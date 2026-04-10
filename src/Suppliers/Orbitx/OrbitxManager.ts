'use strict';

import {MarketInterface, SportInterface} from "../../Interface/MarketInterface";
import App from "../../App";
import {SupplierInterface} from "../../Interface/SupplierInterface";
import ScrapEventTask from "./ScrapEventTask";

export default class OrbitxManager implements SupplierInterface {
    app: App;
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

    static readonly url = 'https://orbitxch.com';
    static readonly timeToWaitBeforeWebSocketHandshakeResponseReceived: number = 10_000;
    scrapEventTask: ScrapEventTask | null = null;
    headers: any = null;
    connectedUntil: number | null = null;


    constructor(app: App) {
        this.app = app;
    }

    getMarketUrl(market: MarketInterface, encodeUri: boolean = false): string | null {
        let url = OrbitxManager.url + '/customer/sport/' + market.event.competition.sport.id + '/market/' + market.id;
        if (encodeUri) {
            url = encodeURI(url);
        }
        return url;
    }

    canScrapMarket(market: MarketInterface): boolean {
        const now = Date.now();
        return (
            !this.getMarketIsFinish(market) &&
            (
                (
                    (
                        market.name === 'Match Odds' ||
                        market.name === 'Moneyline'
                    ) &&
                    market.startTime - (2 * 3600 * 1000) < now
                ) ||
                market.totalMatched > 20_000 // totalMatched is not in EUR but rather in a currency 4.5 times higher than EUR
            ) &&
            market.numberOfWinners === 1 &&
            now + (15 * 60 * 1000) < market.startTime &&
            [2, 3].includes(market.runners.length)
        );
    }

    marketToString(market: MarketInterface, encodeUri: boolean = false): string {
        return "[" + market.event.competition.sport.name + "-" + market.event.competition.name + "] " + market.event.name + ' ' + this.getMarketUrl(market, encodeUri)
    }

    getMarketIsFinish(market: MarketInterface): boolean {
        return market.inPlay || market.status === MarketStatusEnum.Closed;
    }

    async start() {
        this.running = true;
        this.scrapEventTask = new ScrapEventTask(this);
    }

    async stop() {
        // todo
    }
}
