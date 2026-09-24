'use strict';

import {
    GroupMarketInterface,
    MarketInterface,
    MatchingMarketInterface,
    MatchRunnerResult,
    OddInterface,
    RunnerInterface,
    SocketMarketInterface
} from "../Interface/MarketInterface";
import App from "../App";
import {MarketStatusEnum, OddNameEnum, OddTypeEnum} from "../Enum/MarketEnum";
import {diff} from "json-diff";
import stringSimilarity from "string-similarity";

export abstract class SupplierManager {
    app: App;
    markets: MarketInterface[] = [];
    name: string = "";
    socketMarkets: SocketMarketInterface[] = [];

    constructor(app: App) {
        this.app = app;
    }

    updateMarket(market: MarketInterface, newMarket: MarketInterface): void {
        const excludeKeys = [
            'odds',
            'marketRunners',
            'runners', // we add runners here because it reset matchings
            'diffs',
            'modificationsOnMarket',
            'connections'
        ];

        const diffMarket = diff(market, newMarket, {excludeKeys});
        if (diffMarket) {
            market.diffs.push({
                time: Date.now(),
                value: diffMarket,
            });

            for (const key in newMarket) {
                if (excludeKeys.includes(key)) continue;
                // @ts-ignore
                market[key] = newMarket[key];
            }
        }
    }

    removeModificationsOnMarkets(): void {
        const now = Date.now();
        for (const market of this.markets) {
            market.modificationsOnMarket = market.modificationsOnMarket?.filter(n => n > now - App.checkMarketModificationOnLast) ?? [];
        }
    }

    addConnectionToMarkets(
        markets: MarketInterface[],
        type: 'open' | 'close',
        message?: string,
        minusTime: number = 0,
        odds: OddNameEnum[] = [OddNameEnum.RunnerOddValue, OddNameEnum.RunnerOddVolume, OddNameEnum.MarketVolume],
    ) {
        const now = Date.now();
        for (const market of markets) {
            let add = true;
            for (let i = market.connections.length - 1; i >= 0; i--) {
                if (this.isEqualArray(market.connections[i].odds, odds)) {
                    add = market.connections[i].type !== type
                    break;
                }
            }
            if (add) {
                market.connections.push({
                    time: now - minusTime,
                    odds: odds,
                    type: type,
                    ...(message && {
                        message: message
                    })
                })
            }
        }
    }

    initMarket(market: MarketInterface, supplier: string) {
        market.marketRunners = market.runners.map(r => {
            return {
                runnerId: r.id,
                odds: [],
            }
        });
        if (!market.event.competition.enum) {
            market.event.competition.enum = this.getCompetitionEnum(market, supplier)
        }
    }

    getMarketUrl(market: MarketInterface, encodeUri: boolean = false): string {
        return "";
    }

    marketToString(market: MarketInterface, encodeUri: boolean = false): string {
        return "[" + market.event.competition.sport.name + "-" + market.event.competition.name + "] " + market.event.name + ' ' + this.getMarketUrl(market, encodeUri)
    }

    getMarketIsFinish(market: MarketInterface): boolean {
        if (market.status === MarketStatusEnum.Closed) {
            return true;
        }
        if (market.event.competition.enum !== null && this.app.liveCompetitions.includes(market.event.competition.enum)) {
            return false;
        }
        return market.inPlayTime !== null;
    }

    getCreateOdd(odds: OddInterface[], name: OddNameEnum, label: string, supplier: string, type: OddTypeEnum | undefined = undefined, index: number | undefined = undefined): OddInterface {
        let odd = odds.find(o => o.name === name && o.type === type && o.index === index && o.supplier === supplier);
        if (!odd) {
            odd = {
                type: type,
                label: label,
                name: name,
                nbValues: 0,
                index: index,
                values: [],
                supplier: supplier,
            }
            odds.push(odd);
        }
        return odd!;
    }

    getOddLabel(runner: RunnerInterface, type: OddTypeEnum, index: number, supplier: string): string {
        return `${runner.name}[${type}][${index}][${supplier}]`;
    }

    addOddValue(odd: OddInterface, value: number, time: number) {
        if (odd.values.length === 0 || odd.values[odd.values.length - 1].v !== value) {
            odd.values.push({
                i: odd.values.length + 1,
                t: time,
                v: value,
            });
        }
    }

    addMarket(market: MarketInterface): void {
        this._addMarket(market);
    }

    async removeMarkets(ids: (string | number)[], time: number, save: boolean | undefined = undefined): Promise<void> {
        await this._removeMarkets(ids, time, save);
    }

    getCompetitionEnum(market: MarketInterface, supplier: string) {
        return this.app.competitionMapping.find(c =>
            c.values.find(v =>
                v.id === market.event.competition.id && v.supplier === supplier
            ))?.enum ?? null;
    }

    groupMarketAddMarket(groupMarket: GroupMarketInterface, newMarket: MarketInterface) {
        groupMarket.markets.push(newMarket);
        this.app.indexGroupMarket(newMarket, groupMarket);
        groupMarket.startTime = groupMarket.markets.reduce((sum, m) => sum + m.startTime, 0) / groupMarket.markets.length;
        if (groupMarket.markets.length > 1) {
            for (const market of groupMarket.markets) {
                if (market.id === newMarket.id) {
                    continue;
                }
                const matchRunnerResults = this.matchRunners(newMarket, market);
                this.addMatchingRunner([newMarket, market], matchRunnerResults)
            }
        }
    }

    findMatchingMarket(market: MarketInterface, markets: MarketInterface[]): MarketInterface | null {
        let matchingMarket: MatchingMarketInterface | null = null;
        const runner1Names = market.runners.map(r => r.name);

        for (const m of markets) {
            if (Math.abs(market.startTime - m.startTime) > 3600 * 1000) {
                continue;
            }

            const runner2Names = m.runners.map(r => r.name);
            let bestScore = 0;
            const permutations = this.permute(runner2Names);

            for (const perm of permutations) {
                const score = runner1Names.reduce((sum, name, i) => {
                    return sum + this.compareRunnerNames(name, perm[i] ?? '');
                }, 0) / runner1Names.length;

                if (score > bestScore) bestScore = score;
            }

            if (matchingMarket === null || bestScore > matchingMarket.score) {
                matchingMarket = {market: m, score: bestScore};
            }
        }

        if (matchingMarket?.market && matchingMarket.score > 0.62) {
            return matchingMarket.market;
        }
        return null;
    }

    protected _addMarket(market: MarketInterface): void {
        if (process.env.SHOW_LOG_ADD_REMOVE_EVENT === "1") {
            console.info("Add new market " + this.marketToString(market));
        }
        this.markets.push(market);
        const groupMarket = this.addGroupMarket(market);
        this.app.liveSocketService.sendGroupMarketsMessage({
            groupMarketIds: [groupMarket.id],
        })
    }

    protected async _removeMarkets(marketIdsToRemove: (string | number)[], time: number, save: boolean | undefined = undefined) {
        if (marketIdsToRemove.length === 0) {
            return;
        }
        const idSet = new Set(marketIdsToRemove);
        const marketsToRemove = this.markets.filter(m => idSet.has(m.id) && !m.isSaving);
        if (marketsToRemove.length === 0) {
            return;
        }
        for (const market of marketsToRemove) {
            // Set `isSaving` to `true` before any asynchronous operations to ensure
            // that other processes calling this function will recognize these markets
            // as already being processed, avoiding concurrent modifications.
            market.isSaving = true;
        }
        const groupMarkets: GroupMarketInterface[] = [];
        for (const removeMarket of marketsToRemove) {
            const groupMarket = this.app.getGroupMarket(removeMarket.id, removeMarket.supplier);
            if (!groupMarket) {
                console.error("Market without groupMarket removed", this.marketToString(removeMarket));
                this.markets = this.markets.filter(m => m.id !== removeMarket.id);
                continue;
            }
            if (groupMarkets.includes(groupMarket)) {
                continue;
            }
            if (save !== false) {
                if (!(await this.app.mongoService.saveGroupMarket(groupMarket, time))) {
                    // keep it in memory, it will be saved on the next removeMarkets call
                    removeMarket.isSaving = false;
                    continue;
                }
                if (process.env.SHOW_LOG_ADD_REMOVE_EVENT === "1") {
                    console.info("Market added in Mongo and removed from this.markets", this.marketToString(groupMarket.markets[0]));
                }
            } else if (process.env.SHOW_LOG_ADD_REMOVE_EVENT === "1") {
                console.info("Market removed from this.markets", this.marketToString(groupMarket.markets[0]));
            }
            groupMarkets.push(groupMarket);
        }
        this.removeGroupMarkets(groupMarkets);
    }

    protected _canScrapMarket(market: MarketInterface): boolean {
        const now = Date.now();
        const liveCompetitions = (market.event.competition.enum !== null && this.app.liveCompetitions.includes(market.event.competition.enum));
        return (
            // market.event.competition.enum !== null &&
            !this.getMarketIsFinish(market) &&
            (
                (
                    ["match odds", "moneyline"].includes(market.name.toString().toLowerCase()) &&
                    (market.startTime - (2 * 3600 * 1000) < now || liveCompetitions)
                ) ||
                (market.totalMatched > 20_000 || liveCompetitions) // totalMatched is not in EUR but rather in a currency 4.5 times higher than EUR
            ) &&
            market.numberOfWinners === 1 &&
            (now + (15 * 60 * 1000) < market.startTime || liveCompetitions) &&
            [2, 3].includes(market.runners.length)
        );
    }

    private isEqualArray = (a: any[], b: any[]) =>
        a.length === b.length && a.every((val, i) => val === b[i]);

    private addMatchingRunner(markets: MarketInterface[], matchRunnerResults: MatchRunnerResult[]) {
        for (const market of markets) {
            for (const matchRunnerResult of matchRunnerResults) {
                const thisMarketRunnerMatch = matchRunnerResult.matchings.find(m => m.supplier === market.supplier)!;
                const runner = market.runners.find(r => r.id === thisMarketRunnerMatch.id)!;
                for (const runnerMatch of matchRunnerResult.matchings) {
                    if (runnerMatch.supplier === market.supplier) {
                        continue;
                    }
                    runner.matchings[runnerMatch.supplier] = {
                        id: runnerMatch.id,
                        supplier: runnerMatch.supplier
                    }
                }
            }
        }
    }

    private matchRunners(source: MarketInterface, target: MarketInterface): MatchRunnerResult[] {
        const sourceRunners = source.runners;
        const targetRunners = target.runners;

        // Build a score matrix: score[i][j] = similarity between sourceRunners[i] and targetRunners[j]
        const scoreMatrix: number[][] = sourceRunners.map(s =>
            targetRunners.map(t => this.compareRunnerNames(s.name, t.name))
        );

        // Find the optimal assignment using permutations of target indices
        const targetIndices = targetRunners.map((_, i) => String(i));
        const allPermutations = this.permute(targetIndices);

        let bestPermutation: string[] = targetIndices;
        let bestTotalScore = -Infinity;

        for (const perm of allPermutations) {
            const totalScore = perm.reduce((sum, targetIdx, sourceIdx) => {
                return sum + scoreMatrix[sourceIdx][Number(targetIdx)];
            }, 0);

            if (totalScore > bestTotalScore) {
                bestTotalScore = totalScore;
                bestPermutation = perm;
            }
        }

        // Build result using the best assignment
        return bestPermutation.map((targetIdx, sourceIdx) => ({
            matchings: [
                {supplier: source.supplier, id: sourceRunners[sourceIdx].id},
                {supplier: target.supplier, id: targetRunners[Number(targetIdx)].id},
            ],
        }));
    }

    private addGroupMarket(market: MarketInterface): GroupMarketInterface {
        for (const supplierManager of this.app.supplierManagers) {
            if (market.supplier === supplierManager.name) {
                continue;
            }
            const markets = supplierManager.markets.filter(m => m.event.competition.enum === market.event.competition.enum);
            const matchingMarket = this.findMatchingMarket(market, markets);
            if (matchingMarket) {
                const groupMarket = this.app.getGroupMarket(matchingMarket.id, matchingMarket.supplier);
                if (groupMarket) {
                    this.groupMarketAddMarket(groupMarket, market);
                    return groupMarket;
                }
            }
        }
        this.app.groupMarketId++;
        const groupMarket: GroupMarketInterface = {
            id: this.app.groupMarketId,
            startTime: market.startTime,
            competition: market.event.competition.enum,
            markets: [],
        }
        this.app.groupMarkets.push(groupMarket);
        this.groupMarketAddMarket(groupMarket, market);
        return groupMarket;
    }

    private removeGroupMarkets(groupMarkets: GroupMarketInterface[]) {
        for (const groupMarket of groupMarkets) {
            // Copier la liste pour éviter mutation pendant itération
            const marketsToRemove = [...groupMarket.markets];
            for (const market of marketsToRemove) {
                const supplierManager = this.app.supplierManagers.find(sm => sm.name === market.supplier)!;
                supplierManager.markets = supplierManager.markets.filter(m => m.id !== market.id);
                this.app.indexGroupMarket(market, null);
            }
            // Suppression côté group en une seule fois
            groupMarket.markets = groupMarket.markets.filter(
                m => !marketsToRemove.some(rm => rm.id === m.id)
            );
            // Nettoyage des groupes vides
            if (groupMarket.markets.length === 0) {
                this.app.groupMarkets = this.app.groupMarkets.filter(gm => gm.id !== groupMarket.id);
            }
        }
    }

    private compareRunnerNames(a: string, b: string): number {
        const direct = stringSimilarity.compareTwoStrings(a.toLowerCase(), b.toLowerCase());

        const wordsA = a.toLowerCase().split(/\s+/);
        const wordsB = b.toLowerCase().split(/\s+/);

        const wordScore = wordsB.reduce((sum, wb) => {
            const best = Math.max(...wordsA.map(wa => stringSimilarity.compareTwoStrings(wa, wb)));
            return sum + best;
        }, 0) / wordsB.length;

        return Math.max(direct, wordScore);
    }

    private permute(arr: string[]): string[][] {
        if (arr.length <= 1) return [arr];
        return arr.flatMap((item, i) =>
            this.permute([...arr.slice(0, i), ...arr.slice(i + 1)]).map(p => [item, ...p])
        );
    }
}
