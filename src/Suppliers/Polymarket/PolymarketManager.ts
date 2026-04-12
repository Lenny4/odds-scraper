'use strict';

import {MarketInterface, RunnerInterface} from "../../Interface/MarketInterface";
import App from "../../App";
import {SupplierInterface} from "../../Interface/SupplierInterface";
import {SupplierManager} from "../SupplierManager";
import {SportEnum} from "../../Enum/SportEnum";
import {MarketStatusEnum} from "../../Enum/MarketEnum";

export default class PolymarketManager extends SupplierManager implements SupplierInterface {
    static readonly url = 'https://polymarket.com';
    app!: App;
    name: string = "polymarket";
    markets: MarketInterface[] = [];
    running: boolean = false;

    constructor(app: App) {
        super(app)
    }

    addMarket(market: MarketInterface): void {
        this._addMarket(market);
    }

    async removeMarkets(ids: (string | number)[], time: number): Promise<void> {
        await this._removeMarkets(ids, time);
    }

    transformApiMarketToMarket(apiMarket: any): MarketInterface {
        const now = Date.now();
        const market: MarketInterface = {
            event: {
                id: apiMarket.event.id,
                name: apiMarket.event.name,
                competition: {
                    id: apiMarket.competition.id,
                    name: apiMarket.competition.name,
                    sport: {
                        id: apiMarket.eventType.id,
                        name: apiMarket.eventType.name,
                        enum: SportEnum.Basketball,
                    }
                }
            },
            supplier: this.name,
            id: apiMarket.marketId,
            inPlay: apiMarket.inPlay,
            odds: [],
            marketRunners: [],
            name: apiMarket.marketName,
            numberOfWinners: apiMarket.numberOfWinners,
            runners: apiMarket.runners.map((r: any) => {
                const runner: RunnerInterface = {
                    id: r.selectionId,
                    name: r.runnerName,
                }
                return runner;
            }),
            created: now,
            startTime: apiMarket.marketStartTime,
            status: null,
            deleted: null,
            totalMatched: apiMarket.totalMatched,
            diffs: [],
            modificationsOnMarket: [],
            connections: [],
            isSaving: false,
            runnersMap: {},
        };
        this.initMarketRunners(market);
        return market;
    }

    async start() {
        this.running = true;
    }

    async stop() {
        // todo
    }

    getStatus(status: string): MarketStatusEnum | null {
        console.error("getStatus 2 unknown", status)
        return null;
    }
}
