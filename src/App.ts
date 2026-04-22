'use strict';

import OrbitxManager from "./Suppliers/Orbitx/OrbitxManager";
import MongoService from "./Service/MongoService";
import Dashboard from "./Front/Dashboard";
import {
    CompetitionMappingInterface,
    GroupMarketInterface,
    MarketInterface,
    MatchingMarketInterface
} from "./Interface/MarketInterface";
import {SupplierManager} from "./Suppliers/SupplierManager";
import {CompetitionEnum} from "./Enum/CompetitionEnum";
import PolymarketManager from "./Suppliers/Polymarket/PolymarketManager";
import stringSimilarity from "string-similarity";
import LiveSocketService from "./Service/LiveSocketService";
import {SupplierInterface} from "./Interface/SupplierInterface";

export default class App {
    static readonly checkMarketModificationOnLast: number = 5 * 60_000;
    orbitxManager: OrbitxManager;
    polymarketManager: PolymarketManager;
    mongoService: MongoService;
    liveSocketService: LiveSocketService;
    dashboard: Dashboard;
    groupMarketId: number = 0;
    groupMarkets: GroupMarketInterface[] = [];
    competitionMapping: CompetitionMappingInterface[] = [
        {
            enum: CompetitionEnum.Nba,
            values: [
                {
                    supplier: OrbitxManager.name,
                    id: "10547864",
                },
                {
                    supplier: PolymarketManager.name,
                    id: "10345",
                },
            ]
        }
    ];
    readonly liveCompetitions: CompetitionEnum[] = [CompetitionEnum.Nba];

    constructor() {
        this.mongoService = new MongoService(this);
        this.orbitxManager = new OrbitxManager(this);
        this.polymarketManager = new PolymarketManager(this);
        this.dashboard = new Dashboard(this);
        this.liveSocketService = new LiveSocketService(this);
    }

    async start() {
        await this.mongoService.start()
        this.orbitxManager.start();
        this.polymarketManager.start();
        this.dashboard.start()
        this.liveSocketService.start()
    }

    getGroupMarket(marketId: number | string, supplier: string) {
        return this.groupMarkets.find(gm => gm.markets.find(m => m.id === marketId && m.supplier === supplier))!;
    }

    getCompetitionEnum(market: MarketInterface, supplier: string) {
        return this.competitionMapping.find(c =>
            c.values.find(v =>
                v.id === market.event.competition.id && v.supplier === supplier
            ))?.enum ?? null;
    }

    addGroupMarket(market: MarketInterface): GroupMarketInterface {
        for (const supplierManager of Object.values(this)) {
            if (!(supplierManager instanceof SupplierManager) || market.supplier === supplierManager.name) {
                continue;
            }
            const markets = supplierManager.markets.filter(m => m.event.competition.enum === market.event.competition.enum);
            const matchingMarket = this.findMatchingMarket(market, markets);
            if (matchingMarket) {
                const groupMarket = this.getGroupMarket(matchingMarket.id, matchingMarket.supplier);
                if (groupMarket) {
                    this.groupMarketAddMarket(groupMarket, market);
                    return groupMarket;
                }
            }
        }
        this.groupMarketId++;
        const groupMarket: GroupMarketInterface = {
            id: this.groupMarketId,
            startTime: market.startTime,
            markets: [],
        }
        this.groupMarkets.push(groupMarket);
        this.groupMarketAddMarket(groupMarket, market);
        return groupMarket;
    }

    groupMarketAddMarket(groupMarket: GroupMarketInterface, market: MarketInterface) {
        groupMarket.markets.push(market);
        groupMarket.startTime = groupMarket.markets.reduce((sum, m) => sum + m.startTime, 0) / groupMarket.markets.length;
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

    removeGroupMarkets(groupMarkets: GroupMarketInterface[]) {
        for (const groupMarket of groupMarkets) {
            // Copier la liste pour éviter mutation pendant itération
            const marketsToRemove = [...groupMarket.markets];
            for (const market of marketsToRemove) {
                const supplierManager = Object.values(this).find(
                    sm => sm instanceof SupplierManager && sm.name === market.supplier
                ) as SupplierInterface;
                // Suppression côté supplier
                supplierManager.markets = supplierManager.markets.filter(m => m.id !== market.id);
            }
            // Suppression côté group en une seule fois
            groupMarket.markets = groupMarket.markets.filter(
                m => !marketsToRemove.some(rm => rm.id === m.id)
            );
            // Nettoyage des groupes vides
            if (groupMarket.markets.length === 0) {
                this.groupMarkets = this.groupMarkets.filter(gm => gm.id !== groupMarket.id);
            }
        }
    }

    async stop() {
        // todo
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
