'use strict';

import {MarketInterface, RunnerInterface, SocketMarketInterface} from "../../Interface/MarketInterface";
import App from "../../App";
import {SupplierInterface} from "../../Interface/SupplierInterface";
import {SupplierManager} from "../SupplierManager";
import {SportEnum} from "../../Enum/SportEnum";
import {MarketStatusEnum} from "../../Enum/MarketEnum";
import {
    PolymarketApiMarketInterface,
    PolymarketEventInterface,
    PolymarketMarketInterface,
    PolymarketSportInterface
} from "../../Interface/PolymarketInterface";
import {RateLimiter} from "../../Service/RateLimiter";
import ScrapEventTask from "./ScrapEventTask";
import ScrapSocketTask from "./ScrapSocketTask";

export default class PolymarketManager extends SupplierManager implements SupplierInterface {
    static readonly url = 'https://polymarket.com';
    static readonly gammaUrl = 'https://gamma-api.polymarket.com';
    static readonly clobWsUrl = 'wss://ws-subscriptions-clob.polymarket.com/ws/market';
    static readonly drawRunnerName = 'The Draw'; // same name as Orbitx to match runners
    // https://docs.polymarket.com/api-reference/rate-limits: /events 500 req/10s, we keep a 50% margin
    static readonly gammaEventsLimiter = new RateLimiter(250, 10_000);
    app!: App;
    name: string = "PolymarketManager";
    markets: MarketInterface[] = [];
    socketMarkets: SocketMarketInterface[] = [];
    // same sports as OrbitxManager, id = gamma tag ids (some leagues are not tagged with the generic sport tag)
    readonly sports: PolymarketSportInterface[] = [
        {
            id: "100350",
            name: "Soccer",
            tagIds: [100350],
            enum: SportEnum.Soccer
        },
        {
            id: "864",
            name: "Tennis",
            tagIds: [864],
            enum: SportEnum.Tennis
        },
        {
            id: "517",
            name: "Cricket",
            tagIds: [517],
            enum: SportEnum.Cricket
        },
        {
            id: "678",
            name: "Baseball",
            tagIds: [678, 100381], // baseball, mlb
            enum: SportEnum.Baseball,
        },
        {
            id: "28",
            name: "Basketball",
            tagIds: [28, 745], // basketball, nba
            enum: SportEnum.Basketball,
        },
        {
            id: "103615",
            name: "Australian Rules",
            tagIds: [103615],
            enum: SportEnum.AustralianRules,
        },
    ];

    scrapEventTask: ScrapEventTask | null = null;
    scrapSocketTask: ScrapSocketTask | null = null;

    constructor(app: App) {
        super(app)
    }

    static parseJsonArray(value: string | undefined | null): string[] {
        try {
            const result = JSON.parse(value ?? "[]");
            return Array.isArray(result) ? result.map(String) : [];
        } catch {
            return [];
        }
    }

    static isYesNoMarket(polymarketMarket: PolymarketMarketInterface): boolean {
        const outcomes = PolymarketManager.parseJsonArray(polymarketMarket.outcomes).map(o => o.toLowerCase());
        return outcomes.length === 2 && outcomes.includes("yes") && outcomes.includes("no");
    }

    /**
     * Moneyline markets of an event which can be merged into one MarketInterface:
     * - one market with the teams as outcomes (tennis, basketball ...)
     * - or one Yes/No market per result (soccer: home, draw, away)
     */
    static getMoneylineMarkets(event: PolymarketEventInterface): PolymarketMarketInterface[] {
        const markets = (event.markets ?? []).filter(m =>
            m.sportsMarketType === "moneyline" &&
            PolymarketManager.parseJsonArray(m.clobTokenIds).length === PolymarketManager.parseJsonArray(m.outcomes).length
        );
        if (markets.length > 1 && !markets.every(m => PolymarketManager.isYesNoMarket(m))) {
            return [];
        }
        if (markets.length === 1 && PolymarketManager.isYesNoMarket(markets[0])) {
            return [];
        }
        return markets;
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
        let url = `${PolymarketManager.url}/event/${market.event.slug ?? market.event.id}`;
        if (encodeUri) {
            url = encodeURI(url);
        }
        return url;
    }

    transformApiMarketToMarket({event, sport}: PolymarketApiMarketInterface): MarketInterface {
        const now = Date.now();
        const polymarketMarkets = PolymarketManager.getMoneylineMarkets(event);
        const runners: RunnerInterface[] = [];
        if (polymarketMarkets.length === 1) {
            const tokenIds = PolymarketManager.parseJsonArray(polymarketMarkets[0].clobTokenIds);
            PolymarketManager.parseJsonArray(polymarketMarkets[0].outcomes).forEach((name, index) => {
                runners.push({id: tokenIds[index], name: name, matchings: {}});
            });
        } else {
            for (const polymarketMarket of polymarketMarkets) {
                const outcomes = PolymarketManager.parseJsonArray(polymarketMarket.outcomes).map(o => o.toLowerCase());
                const tokenIds = PolymarketManager.parseJsonArray(polymarketMarket.clobTokenIds);
                const isDraw = (polymarketMarket.groupItemTitle ?? polymarketMarket.question).toLowerCase().includes("draw");
                runners.push({
                    id: tokenIds[outcomes.indexOf("yes")], // backing a runner = buying the "Yes" token
                    name: isDraw ? PolymarketManager.drawRunnerName : (polymarketMarket.groupItemTitle ?? polymarketMarket.question),
                    matchings: {},
                });
            }
        }
        const gameStartTime = polymarketMarkets.find(m => m.gameStartTime)?.gameStartTime;
        const startTime = (new Date(event.startTime ?? gameStartTime ?? 0)).getTime();
        const serie = event.series?.[0];
        const market: MarketInterface = {
            event: {
                id: event.id,
                name: event.title,
                slug: event.slug,
                competition: {
                    id: serie?.id ?? sport.id,
                    name: serie?.title ?? sport.name ?? "",
                    enum: null,
                    sport: {
                        id: sport.id,
                        name: sport.name,
                        enum: sport.enum,
                    }
                }
            },
            supplier: this.name,
            id: event.id,
            inPlayTime: startTime <= now ? startTime : null,
            odds: [],
            marketRunners: [],
            name: "moneyline",
            numberOfWinners: 1,
            runners: runners,
            created: now,
            startTime: startTime,
            status: this.getMarketsStatus(polymarketMarkets),
            deleted: null,
            totalMatched: Math.round(polymarketMarkets.reduce((sum, m) => sum + (m.volumeNum ?? 0), 0)),
            diffs: [],
            modificationsOnMarket: [],
            connections: [],
            isSaving: false,
            clobTokenIds: runners.map(r => String(r.id)),
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
            market_resolved: MarketStatusEnum.Closed,
        };

        const result = statusMap[status.toLowerCase()];
        if (!result) {
            console.error("getStatus PolymarketManager unknown", status);
            return null;
        }
        return result;
    }

    private getMarketsStatus(polymarketMarkets: PolymarketMarketInterface[]): MarketStatusEnum | null {
        if (polymarketMarkets.length === 0 || polymarketMarkets.some(m => m.closed)) {
            return this.getStatus("closed");
        }
        if (polymarketMarkets.some(m => !m.active || m.acceptingOrders === false)) {
            return this.getStatus("suspended");
        }
        return this.getStatus("open");
    }
}
