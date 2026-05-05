'use strict';

import App from "../App";
import {
    GroupMarketInterface,
    MarketInterface,
    MarketRunnerInterface,
    OddInterface,
    RunnerInterface
} from "../Interface/MarketInterface";
import {CompetitionEnum} from "../Enum/CompetitionEnum";
import PolymarketManager from "../Suppliers/Polymarket/PolymarketManager";
import {DirectionEnum, OddNameEnum, OddTypeEnum} from "../Enum/MarketEnum";
import {getDerive} from "./Utils";
import WebSocket from "ws";
import OrbitxManager from "../Suppliers/Orbitx/OrbitxManager";
import {BrowserManager} from "./BrowserManager";
import DiscordService from "./DiscordService";
import {
    AccountInterface,
    BalanceResponseInterface,
    BetActionInterface,
    BetActionsInterface,
    BetMarketInterface,
    BetslipSelectionInterface,
    CurrentBetInterface,
    CurrentBetsResponseInterface,
    GroupBetInterface,
    MarketRunnerBetStateInterface,
    RootPriceBySelectionInterface,
    SumBetOddInterface
} from "../Interface/AccountInterface";

export default class BetService {
    static readonly MIN_BET_AMOUNT = 7;
    static readonly DEFAULT_BET_AMOUNT = BetService.MIN_BET_AMOUNT;
    static readonly MIN_SIZE = 0.01;
    private static readonly DERIVE_WINDOW_MS = 10_000;
    app: App;
    name: string = "BetService";
    account: AccountInterface = {
        balance: 0,
        currentBets: [],
    };
    private cancellingBets: Set<number> = new Set();
    private betQueue: GroupMarketInterface[] = [];
    private isBetting: boolean = false;
    private accountWebsocket: WebSocket | null = null;
    private reconnectAttempts = 0;
    private mappingBackLayLabel = {
        "back": OddTypeEnum.Back,
        "lay": OddTypeEnum.Lay,
    };
    private reverseMappingBackLayLabel = Object.fromEntries(
        Object.entries(this.mappingBackLayLabel).map(([k, v]) => [v, k])
    );
    private betDirections = {
        [OddTypeEnum.Back]: [DirectionEnum.Stable, DirectionEnum.Down],
        [OddTypeEnum.Lay]: [DirectionEnum.Stable, DirectionEnum.Up],
    };
    private defaultBetslipSelection: BetslipSelectionInterface = {
        selectionId: 0,
        handicap: 0,
        price: 0,
        size: 0,
        side: "",
        betUuid: "",
        betType: "EXCHANGE",
        netPLBetslipEnabled: true,
        netPLMarketPageEnabled: true,
        quickStakesEnabled: true,
        confirmBetsEnabled: false,
        applicationType: "WEB",
        showLayOddsEnabled: false,
        mobile: false,
        isEachWay: false,
        eachWayData: {},
        page: "market",
        persistenceType: "LAPSE",
        placedUsingEnterKey: false
    }

    public constructor(app: App) {
        this.app = app;
    }

    async start() {
        await this.createAccountWebsocket();
        setInterval(() => {
            this.bet(this.app.groupMarkets)
        }, 1000)
    }

    async bet(groupMarkets: GroupMarketInterface[]) {
        this.enqueue(groupMarkets.filter(gm =>
            gm.competition === CompetitionEnum.Nba &&
            gm.markets.length > 1 &&
            gm.markets.find(m => m.id === "1.257752587")
        ));
        if (this.isBetting) return;
        await this.processQueue();
    }

    private async createAccountWebsocket(): Promise<void> {
        const orbitxManager = this.app.supplierManagers.find(s => s.name === OrbitxManager.name) as OrbitxManager;
        while (orbitxManager.connectedUntil === null) {
            await new Promise(resolve2 => setTimeout(resolve2, 1_000));
        }
        const browser = await BrowserManager.acquire(OrbitxManager.cache);
        this.accountWebsocket?.removeAllListeners();
        this.accountWebsocket = await orbitxManager.scrapSocketTask!.createWebsocket(
            browser,
            /wss.*customer\/ws\/general.*websocket/
        );
        await BrowserManager.release();
        this.accountWebsocket.on('open', () => {
            this.reconnectAttempts = 0;
            // this.accountWebsocket!.send(JSON.stringify([JSON.stringify({
            //     "PROPERTIES": {"subscribe": true, "applicationType": "WEB"}
            // })]));
            // this.accountWebsocket!.send(JSON.stringify([JSON.stringify({
            //     "OPEN_BETS_COUNTER": {"subscribe": false, "applicationType": "WEB"}
            // })]));
            this.accountWebsocket!.send(JSON.stringify([JSON.stringify(
                {"BALANCE": {"subscribe": true, "applicationType": "WEB"}}
            )]));
            this.accountWebsocket!.send(JSON.stringify([JSON.stringify(
                {"CURRENT_BETS": {"subscribe": true, "applicationType": "WEB"}}
            )]));
            // this.accountWebsocket!.send(JSON.stringify([JSON.stringify(
            //     {"BET_STATUSES": {"subscribe": false, "applicationType": "WEB"}}
            // )]));
        });
        this.accountWebsocket.on('error', (e: Error) => {
            if (e.message === "WebSocket was closed before the connection was established") return;
            console.error("accountWebsocket error, attempting reconnect...", e);
            DiscordService.send(JSON.stringify({
                event: "websocket.on('error')",
                name: e.name,
                message: e.message,
            }));
        });
        this.accountWebsocket.on('close', () => {
            const delay = 1000;
            this.reconnectAttempts++;
            console.warn(`WebSocket closed. Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})...`);
            setTimeout(() => {
                this.createAccountWebsocket();
            }, delay);
        });
        this.accountWebsocket.on('message', (data: Buffer) => {
            const string = data.toString();
            if (string.startsWith('o')) {
                // nothing
            } else if (string.startsWith('h')) {
                // C’est un ping ou un heartbeat (h pour “heartbeat” souvent), pour maintenir la connexion WebSocket ouverte.
            } else if (string.startsWith('a')) {
                const result: any = JSON.parse(JSON.parse(string.substring(1)));
                if (result.hasOwnProperty("BALANCE")) {
                    this.handleBalance(result);
                } else if (result.hasOwnProperty("CURRENT_BETS")) {
                    this.handleCurrentBets(result);
                } else {
                    console.error("Unknown message this.accountWebsocket", result);
                    DiscordService.send(string)
                }
            } else {
                const message = 'Unknown message type websocket: ' + string;
                console.error(message);
                DiscordService.send(message)
                throw message;
            }
        });
    }

    private handleBalance(data: BalanceResponseInterface) {
        if (data.BALANCE && data.BALANCE.balance) {
            this.account.balance = Number(data.BALANCE.balance)
        }
    }

    private handleCurrentBets(data: CurrentBetsResponseInterface) {
        if (!Array.isArray(data.CURRENT_BETS)) { // {"CURRENT_BETS":"DENIED"}
            return;
        }
        const offerIds = new Set(data.CURRENT_BETS.map(b => b.offerId));
        for (const newBet of data.CURRENT_BETS) {
            const currentBetIndex = this.account.currentBets.findIndex(b =>
                b.offerId === newBet.offerId ||
                (
                    b.offerId === undefined &&
                    b.side === newBet.side &&
                    Number(b.price) === Number(newBet.price) &&
                    Number(b.size) === Number(newBet.size)
                )
            );
            if (currentBetIndex >= 0) {
                this.account.currentBets[currentBetIndex] = newBet;
            } else {
                this.account.currentBets.push(newBet);
            }
        }
        this.account.currentBets = this.account.currentBets.filter(
            b => b.offerId === undefined || offerIds.has(b.offerId)
        );
    }

    private enqueue(groupMarkets: GroupMarketInterface[]) {
        const existingIds = new Set(this.betQueue.map(m => m.id));
        const newGroupMarkets = groupMarkets.filter(m => !existingIds.has(m.id));
        for (const newGroupMarket of newGroupMarkets) {
            this.betQueue.push(newGroupMarket);
        }
    }

    private async processQueue() {
        this.isBetting = true;
        while (this.betQueue.length > 0) {
            const batch = this.betQueue.splice(0);
            await this.processBatch(batch);
        }
        this.isBetting = false;
    }

    private async processBatch(groupMarkets: GroupMarketInterface[]): Promise<void> {
        const now = Date.now();
        let betActions: BetActionsInterface[] = [];
        for (const groupMarket of groupMarkets) {
            const polymarketMarket = groupMarket.markets.find(m => m.supplier === PolymarketManager.name)!;
            for (const polymarketMarketRunner of polymarketMarket.marketRunners) {
                this.updateDeriveOddValues(polymarketMarketRunner, now)
            }
            const orbitxMarket = groupMarket.markets.find(m => m.supplier === OrbitxManager.name)!;
            betActions = [...betActions, ...this.getBetsTodo(groupMarket, this.account.currentBets.filter(b => b.marketId === orbitxMarket.id))];
        }
        if (betActions.length > 0) {
            const closestToOddValue = 2;
            betActions.sort((a, b) => {
                if (a.balancing !== null && b.balancing === null) {
                    return -1;
                }
                if (a.balancing === null && b.balancing !== null) {
                    return 1;
                }
                const aOddValues = [a.backBetAction.newBet?.price ?? 0, a.layBetAction.newBet?.price ?? 0]
                const bOddValues = [b.backBetAction.newBet?.price ?? 0, b.layBetAction.newBet?.price ?? 0]
                const aAvg = aOddValues.reduce((sum, num) => sum + num, 0) / aOddValues.length;
                const bAvg = bOddValues.reduce((sum, num) => sum + num, 0) / bOddValues.length;
                return Math.abs((aAvg / (closestToOddValue * 1000)) - 1) - Math.abs((bAvg / (closestToOddValue * 1000)) - 1);
            })
            for (const [index, betAction] of betActions.entries()) {
                this.doBetActions(betAction, index > 0);
            }
        }
    }

    private getBetsTodo(groupMarket: GroupMarketInterface, bets: CurrentBetInterface[]): BetActionsInterface[] {
        const polymarketMarket = groupMarket.markets.find(m => m.supplier === PolymarketManager.name)!;
        const orbitxMarket = groupMarket.markets.find(m => m.supplier === OrbitxManager.name)!;
        const betActions: BetActionsInterface[] = [];
        for (const orbitxMarketRunner of orbitxMarket.marketRunners) {
            const orbitxRunner = orbitxMarket.runners.find(r => r.id === orbitxMarketRunner.runnerId)!;
            const polymarketMarketRunner = polymarketMarket.marketRunners.find(mr =>
                mr.runnerId === orbitxRunner.matchings[PolymarketManager.name].id)!;

            const backMarketRunnerBetState = this.getMarketRunnerBetState(orbitxMarketRunner, polymarketMarketRunner, OddTypeEnum.Back);
            const layMarketRunnerBetState = this.getMarketRunnerBetState(orbitxMarketRunner, polymarketMarketRunner, OddTypeEnum.Lay);
            if (backMarketRunnerBetState.oddValue === null || layMarketRunnerBetState.oddValue === null) {
                continue;
            }

            const backBetslip = this.getBetslips(orbitxMarket.id, bets, backMarketRunnerBetState, layMarketRunnerBetState, undefined);
            const layBetslip = this.getBetslips(orbitxMarket.id, bets, layMarketRunnerBetState, backMarketRunnerBetState, backBetslip.newBet?.size ? Number(backBetslip.newBet.size) : undefined);

            const betsToCancelId = new Set([backBetslip, layBetslip].flatMap(b => b.betToCancels.map(bc => bc.offerId))) as Set<number>;
            const betslipBalancing = this.getBetslipSelectionBalancing(
                orbitxMarket.id,
                [
                    ...bets,
                    backBetslip.newBet,
                    layBetslip.newBet,
                ].filter(bet => bet !== null) as GroupBetInterface[],
                betsToCancelId,
                backMarketRunnerBetState,
                layMarketRunnerBetState
            );
            betActions.push({
                backBetAction: backBetslip,
                balancing: betslipBalancing,
                layBetAction: layBetslip,
                marketId: orbitxMarket.id,
            })
        }
        return betActions;
    }

    private doBetActions(betActions: BetActionsInterface, onlyCancel: boolean = false) {
        for (const betAction of [betActions.backBetAction, betActions.layBetAction]) {
            this.cancelBets(betActions.marketId, betAction.betToCancels);
        }
        if (onlyCancel) {
            return;
        }
        this.preventBetActionSameSize(betActions.backBetAction, betActions.layBetAction);
    }

    private async cancelBets(marketId: MarketInterface['id'], betToCancels: CurrentBetInterface[]) {
        betToCancels = betToCancels.filter(b => !this.cancellingBets.has(b.offerId as number));
        if (betToCancels.length === 0) {
            return;
        }
        const offerIds: number[] = [];
        for (const betToCancel of betToCancels) {
            offerIds.push(betToCancel.offerId as number);
            this.cancellingBets.add(betToCancel.offerId as number);
        }
        try {
            const orbitxManager = this.app.supplierManagers.find(s => s.name === OrbitxManager.name) as OrbitxManager;
            console.log("cancelBets", betToCancels.map(b => {
                return {
                    selectionName: b.selectionName,
                    side: b.side,
                    price: b.price,
                    size: b.size,
                }
            }))
            const res = await fetch("https://www.orbitxch.com/customer/api/cancelBets", {
                headers: orbitxManager.headers,
                body: JSON.stringify({
                    [marketId]: betToCancels,
                }),
                method: "POST",
            });
            if (res.ok) {
                const data = await res.json();
                if (data.status === "OK" && data.error === null && data.betDelay === null) {
                    this.account.currentBets = this.account.currentBets.filter(b => !offerIds.includes(b.offerId as number))
                } else {
                    console.error("res cancelBets", data);
                }
            }
        } catch (e) {
            console.error("cancelBets but error: ", e);
        } finally {
            for (const betToCancel of betToCancels) {
                this.cancellingBets.delete(betToCancel.offerId as number);
            }
        }
    }

    private preventBetActionSameSize(backBetslip: BetActionInterface, layBetslip: BetActionInterface) {
        while (this.hasPendingBetWithSameSize(backBetslip.newBet) || this.hasPendingBetWithSameSize(layBetslip.newBet)) {
            const backSize = Number(backBetslip.newBet?.size ?? 0);
            while (this.hasPendingBetWithSameSize(backBetslip.newBet)) {
                this.addSize(backBetslip, layBetslip, backSize)
            }
            const laySize = Number(layBetslip.newBet?.size ?? 0);
            while (this.hasPendingBetWithSameSize(layBetslip.newBet)) {
                this.addSize(layBetslip, backBetslip, laySize)
            }
        }
    }

    private addSize(betslip: BetActionInterface, oppositeBetslip: BetActionInterface, originalBetslipSize: number) {
        betslip.newBet!.size = Number(betslip.newBet) + BetService.MIN_SIZE;
        if (oppositeBetslip.newBet) {
            oppositeBetslip.newBet!.size = Number(oppositeBetslip.newBet) * (betslip.newBet!.size / originalBetslipSize);
        }
    }

    private hasPendingBetWithSameSize(betslip: BetslipSelectionInterface | null) {
        return betslip && this.account.currentBets.find(b =>
            b.offerId === undefined &&
            Number(b.size) === Math.round(Number(betslip.size)) &&
            Number(b.price) === Number(betslip.price) * 1000 &&
            b.side === betslip.side
        )
    }

    private getBetslipSelectionBalancing(
        marketId: MarketInterface['id'],
        bets: GroupBetInterface[],
        betsToCancelId: Set<number>,
        backMarketRunnerBetState: MarketRunnerBetStateInterface,
        layMarketRunnerBetState: MarketRunnerBetStateInterface,
    ): BetslipSelectionInterface | null {
        const sumBetOdd: SumBetOddInterface = {back: 0, lay: 0};
        for (const bet of bets) {
            const size = bet.offerId && betsToCancelId.has(bet.offerId) ? Number(bet.sizeMatched) : Number(bet.size);
            const price = Number(bet.price);
            const side = this.mappingBackLayLabel[bet.side.toLowerCase() as keyof typeof this.mappingBackLayLabel];
            if (side === OddTypeEnum.Back) {
                sumBetOdd.back += size * price;
            } else {
                sumBetOdd.lay += size * price;
            }
        }
        const betslipSelection: BetslipSelectionInterface = {
            ...this.defaultBetslipSelection,
            selectionId: Number(backMarketRunnerBetState.runnerId),
            betUuid: this.getBetUuid(marketId, backMarketRunnerBetState.runnerId),
        }
        let type: OddTypeEnum | null = null;
        let marketRunnerBetState: MarketRunnerBetStateInterface | null = null;
        let oppositeMarketRunnerBetState: MarketRunnerBetStateInterface | null = null;
        if (sumBetOdd.back > sumBetOdd.lay) {
            type = OddTypeEnum.Lay;
            marketRunnerBetState = layMarketRunnerBetState;
            oppositeMarketRunnerBetState = backMarketRunnerBetState;
            betslipSelection.price = backMarketRunnerBetState.oddValue!;
            betslipSelection.size = Math.abs(sumBetOdd.back - sumBetOdd.lay) / betslipSelection.price;
            betslipSelection.side = this.reverseMappingBackLayLabel[type].toUpperCase();
        } else if (sumBetOdd.lay > sumBetOdd.back) {
            type = OddTypeEnum.Back;
            marketRunnerBetState = backMarketRunnerBetState;
            oppositeMarketRunnerBetState = layMarketRunnerBetState;
            betslipSelection.price = layMarketRunnerBetState.oddValue!;
            betslipSelection.size = Math.abs(sumBetOdd.back - sumBetOdd.lay) / betslipSelection.price;
            betslipSelection.side = this.reverseMappingBackLayLabel[type].toUpperCase();
        }
        if (Number(betslipSelection.size) > BetService.MIN_SIZE && type !== null) {
            const betMarket = this.getBetMarket(
                type,
                marketRunnerBetState!.oddValue!,
                oppositeMarketRunnerBetState!.oddValue!,
                marketRunnerBetState!.direction,
            );
            if (!betMarket.isMovingAgainstBet) {
                return betslipSelection;
            }
        }
        return null;
    }

    private getBetUuid(marketId: MarketInterface['id'], runnerId: RunnerInterface['id']) {
        return `${marketId}_${runnerId}_0__${Date.now()}-${this.generateRandomAlphanumeric()}`;
    }

    private generateRandomAlphanumeric(length: number = 5): string {
        const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
        let result = '';
        for (let i = 0; i < length; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }

    private getBetslips(
        marketId: MarketInterface['id'],
        bets: CurrentBetInterface[],
        marketRunnerBetState: MarketRunnerBetStateInterface,
        oppositeMarketRunnerBetState: MarketRunnerBetStateInterface,
        previousSize: number | undefined
    ): BetActionInterface {
        const betAction: BetActionInterface = {
            betToCancels: [],
            newBet: null,
        }
        let betFounded = false;
        for (const bet of bets) {
            if (Number(bet.sizeRemaining) <= 0 || bet.selectionId !== marketRunnerBetState.runnerId) {
                continue;
            }
            const side = this.mappingBackLayLabel[bet.side.toLowerCase() as keyof typeof this.mappingBackLayLabel];
            if (side !== marketRunnerBetState.type) {
                continue;
            }
            if (oppositeMarketRunnerBetState.oddValue) {
                const betOddValue = Number(bet.price) * 1000;
                const betMarket = this.getBetMarket(
                    marketRunnerBetState.type,
                    betOddValue,
                    oppositeMarketRunnerBetState.oddValue,
                    marketRunnerBetState.direction,
                );
                if (betMarket.isBeyondMarket || (betMarket.isAtMarket && betMarket.isMovingAgainstBet)) {
                    betAction.betToCancels.push(bet);
                } else if (betMarket.isAtMarket) {
                    betFounded = true;
                }
            }
        }
        if (!betFounded) {
            let size = BetService.DEFAULT_BET_AMOUNT;
            if (previousSize) {
                size = (marketRunnerBetState.oddValue! / oppositeMarketRunnerBetState.oddValue!) * previousSize;
            }
            betAction.newBet = {
                ...this.defaultBetslipSelection,
                selectionId: Number(marketRunnerBetState.runnerId),
                betUuid: this.getBetUuid(marketId, marketRunnerBetState.runnerId),
                price: oppositeMarketRunnerBetState.oddValue!,
                size: size,
                side: this.reverseMappingBackLayLabel[marketRunnerBetState.type].toUpperCase(),
            }
        }
        return betAction;
    }

    private getBetMarket(
        type: OddTypeEnum,
        betOddValue: number,
        oppositeBetOddValue: number,
        direction: DirectionEnum | null,
    ): BetMarketInterface {
        const isBack = type === OddTypeEnum.Back;
        const isBeyondMarket = isBack
            ? betOddValue > oppositeBetOddValue
            : betOddValue < oppositeBetOddValue;
        const isAtMarket = isBack
            ? betOddValue === oppositeBetOddValue
            : betOddValue === oppositeBetOddValue;
        const isMovingAgainstBet =
            direction !== null &&
            !this.betDirections[type].includes(direction);
        return {
            isAtMarket: isAtMarket,
            isBeyondMarket: isBeyondMarket,
            isMovingAgainstBet: isMovingAgainstBet
        }
    }

    private getMarketRunnerBetState(orbitxMarketRunner: MarketRunnerInterface, polymarketMarketRunner: MarketRunnerInterface, type: OddTypeEnum): MarketRunnerBetStateInterface {
        const oddBack = orbitxMarketRunner.odds.find(o => o.name === OddNameEnum.RunnerOddValue && o.index === 0 && o.type === type);
        let oddValue: number | null = null;
        let direction: DirectionEnum | null = null;
        if (oddBack && oddBack.values.length > 0) {
            oddValue = oddBack.values.at(-1)!.v;
            const oddBackDerive = polymarketMarketRunner.odds.find(o => o.name === OddNameEnum.PolymarketDerive && o.index === 0 && o.type === type);
            if (oddBackDerive && oddBackDerive.values.length > 0) {
                direction = this.getDirection(oddBackDerive.values.at(-1)!.v);
            }
        }
        return {
            runnerId: orbitxMarketRunner.runnerId,
            direction: direction,
            oddValue: oddValue,
            type: type,
        }
    }

    private getDirection(value: number) {
        if (value < 0) {
            return DirectionEnum.Down;
        }
        if (value > 0) {
            return DirectionEnum.Up;
        }
        return DirectionEnum.Stable;
    }

    private getPriceBySelection(market: MarketInterface, bets: CurrentBetInterface[]): RootPriceBySelectionInterface {
        const result: RootPriceBySelectionInterface = {};
        const selectionIds = market.runners.map(r => r.id) as number[];
        for (const winnerId of selectionIds) {
            let totalPnl = 0;
            const selectionBets: CurrentBetInterface[] = [];
            for (const bet of bets) {
                const isWinner = bet.selectionId === winnerId;
                if (isWinner) {
                    selectionBets.push(bet);
                }
                const side = this.mappingBackLayLabel[bet.side.toLowerCase() as keyof typeof this.mappingBackLayLabel];
                if (side === OddTypeEnum.Back) {
                    totalPnl += isWinner ? Number(bet.size) * (bet.price - 1) : -bet.size;
                } else if (side === OddTypeEnum.Lay) {
                    totalPnl += isWinner ? -Number(bet.size) * (bet.price - 1) : Number(bet.size);
                } else {
                    throw `unknown side getPriceBySelection: ${bet.side}`;
                }
            }
            result[winnerId] = {
                selectionId: winnerId,
                revenue: totalPnl,
                bets: selectionBets,
            }
        }
        return result;
    }

    private updateDeriveOddValues(marketRunner: MarketRunnerInterface, time: number) {
        for (const oddPolymarket of marketRunner.odds) {
            if (
                oddPolymarket.supplier !== PolymarketManager.name ||
                oddPolymarket.name !== OddNameEnum.RunnerOddValue ||
                oddPolymarket.index !== 0
            ) {
                continue;
            }
            // region update polymarket odd derive value
            const deriveValue = getDerive(oddPolymarket.values, time - BetService.DERIVE_WINDOW_MS);
            const oddDerivePolymarket = this.getOrCreateDeriveOdd(marketRunner, oddPolymarket, OddNameEnum.PolymarketDerive);
            const last = oddDerivePolymarket.values.at(-1);
            if (!last || last.v !== deriveValue) {
                oddDerivePolymarket.values.push({
                    i: oddDerivePolymarket.values.length + 1,
                    t: time,
                    v: deriveValue,
                });
            }
            // endregion
        }
    }

    private getOrCreateDeriveOdd(
        marketRunner: MarketRunnerInterface,
        polymarketOdd: OddInterface,
        oddName: OddNameEnum
    ): OddInterface {
        let odd = marketRunner.odds.find(o =>
            o.name === oddName &&
            o.supplier === polymarketOdd.supplier &&
            o.index === polymarketOdd.index &&
            o.type === polymarketOdd.type
        );

        if (!odd) {
            odd = {
                index: polymarketOdd.index,
                label: `${polymarketOdd.label} derive`,
                name: oddName,
                nbValues: 0,
                supplier: polymarketOdd.supplier,
                type: polymarketOdd.type,
                values: [],
            };
            marketRunner.odds.push(odd);
        }

        return odd;
    }
}
