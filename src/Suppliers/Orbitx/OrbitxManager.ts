'use strict';

import {MarketInterface, RunnerInterface, SportInterface} from "../../Interface/MarketInterface";
import App from "../../App";
import {SupplierInterface} from "../../Interface/SupplierInterface";
import ScrapEventTask from "./ScrapEventTask";
import {SupplierManager} from "../SupplierManager";
import {SportEnum} from "../../Enum/SportEnum";
import ScrapSocketTask from "./ScrapSocketTask";
import {MarketStatusEnum} from "../../Enum/MarketEnum";

export default class OrbitxManager extends SupplierManager implements SupplierInterface {
    static readonly url = 'https://orbitxch.com';
    static readonly timeToWaitBeforeWebSocketHandshakeResponseReceived: number = 10_000;
    static readonly reconnectRemainingTime: number = 30 * 60_000;
    app!: App;
    name: string = "orbitx";
    markets: MarketInterface[] = [];
    running: boolean = false;
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

    getMarketUrl(market: MarketInterface, encodeUri: boolean = false): string {
        let url = OrbitxManager.url + '/customer/sport/' + market.event.competition.sport.id + '/market/' + market.id;
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
                    sport: {
                        id: apiMarket.eventType.id,
                        name: apiMarket.eventType.name,
                        enum: this.sports.find(s => s.id === apiMarket.eventType.id)!.enum,
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
        };
        this.initMarketRunners(market);
        return market;
    }

    async start() {
        this.running = true;
        this.scrapEventTask = new ScrapEventTask(this);
        this.scrapSocketTask = new ScrapSocketTask(this);
    }

    async stop() {
        // todo
    }

    getStatus(status: string): MarketStatusEnum | null {
        return null;
    }
}
