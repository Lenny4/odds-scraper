'use strict';

import {MarketInterface, RunnerInterface, SocketMarketInterface, SportInterface} from "../../Interface/MarketInterface";
import App from "../../App";
import {SupplierInterface} from "../../Interface/SupplierInterface";
import ScrapEventTask from "./ScrapEventTask";
import {SupplierManager} from "../SupplierManager";
import {SportEnum} from "../../Enum/SportEnum";
import ScrapSocketTask from "./ScrapSocketTask";
import {MarketStatusEnum} from "../../Enum/MarketEnum";

export default class OrbitxManager extends SupplierManager implements SupplierInterface {
    static readonly url = 'https://orbitxch.com';
    static readonly reconnectRemainingTime: number = 30 * 60_000;
    static readonly cache: string = './cache/orbitx';
    public static readonly timeToWaitBeforeWebSocketHandshakeResponseReceived: number = 10_000;
    app!: App;
    name: string = "OrbitxManager";
    markets: MarketInterface[] = [];
    socketMarkets: SocketMarketInterface[] = [];
    readonly sports: SportInterface[] = [
        {
            id: "1",
            enum: SportEnum.Soccer
        },
        {
            id: "2",
            enum: SportEnum.Tennis
        },
        {
            id: "4",
            enum: SportEnum.Cricket
        },
        {
            id: "7511",
            enum: SportEnum.Baseball,
        },
        {
            id: "7522",
            enum: SportEnum.Basketball,
        },
        {
            id: "61420",
            enum: SportEnum.AustralianRules,
        },
    ];

    scrapEventTask: ScrapEventTask | null = null;
    scrapSocketTask: ScrapSocketTask | null = null;
    headers: any = null;
    connectedUntil: number | null = null;

    constructor(app: App) {
        super(app)
    }

    addMarket(market: MarketInterface): void {
        this._addMarket(market);
        this.scrapSocketTask?.handleMarkets();
    }

    async removeMarkets(ids: (string | number)[], time: number, save: boolean | undefined = undefined): Promise<void> {
        await this._removeMarkets(ids, time, save);
        this.scrapSocketTask?.handleMarkets();
    }

    getMarketUrl(market: MarketInterface, encodeUri: boolean = false): string {
        let url = `${OrbitxManager.url}/customer/sport/${market.event.competition.sport.id}/market/${market.id}`;
        if (encodeUri) {
            url = encodeURI(url);
        }
        return url;
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
                    enum: null,
                    sport: {
                        id: apiMarket.eventType.id,
                        name: apiMarket.eventType.name,
                        enum: this.sports.find(s => s.id === apiMarket.eventType.id)!.enum,
                    }
                }
            },
            supplier: this.name,
            id: apiMarket.marketId,
            inPlayTime: null,
            odds: [],
            marketRunners: [],
            name: apiMarket.marketName,
            numberOfWinners: apiMarket.numberOfWinners,
            runners: apiMarket.runners.map((r: any) => {
                const runner: RunnerInterface = {
                    id: r.selectionId,
                    name: r.runnerName,
                    matchings: {},
                }
                return runner;
            }),
            created: now,
            startTime: (new Date(apiMarket.marketStartTime)).getTime(),
            status: null,
            deleted: null,
            totalMatched: apiMarket.totalMatched,
            diffs: [],
            modificationsOnMarket: [],
            connections: [],
            isSaving: false,
            runnersMap: {},
        };
        this.initMarket(market, this.name);
        return market;
    }

    async start() {
        this.running = true;
        this.scrapEventTask = new ScrapEventTask(this);
        this.scrapSocketTask = new ScrapSocketTask(this);
    }

    async stop() {
        this.running = false;
        this.scrapSocketTask?.stop();
        await this._removeMarkets(this.markets.map(m => m.id), Date.now());
    }

    canScrapMarket(market: MarketInterface): boolean {
        return this._canScrapMarket(market);
    }

    getStatus(status: string): MarketStatusEnum | null {
        const statusMap: Record<string, MarketStatusEnum> = {
            open: MarketStatusEnum.Open,
            closed: MarketStatusEnum.Closed,
            suspended: MarketStatusEnum.Suspended,
        };

        const result = statusMap[status.toLowerCase()];
        if (!result) {
            console.error("getStatus OrbitxManager unknown", status);
            return null;
        }
        return result;
    }
}
