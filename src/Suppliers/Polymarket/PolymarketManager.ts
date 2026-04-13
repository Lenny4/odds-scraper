'use strict';

import {MarketInterface, RunnerInterface, TypeMappingInterface} from "../../Interface/MarketInterface";
import App from "../../App";
import {SupplierInterface} from "../../Interface/SupplierInterface";
import {SupplierManager} from "../SupplierManager";
import {SportEnum} from "../../Enum/SportEnum";
import {MarketStatusEnum, OddNameEnum, OddTypeEnum} from "../../Enum/MarketEnum";
import {
    PolymarketEventInterface,
    PolymarketInitialDumpInterface,
    PolymarketSeriesInterface,
    PolymarketSocketInterface,
    PolymarketSportInterface
} from "../../Interface/PolymarketInterface";
import {clearInterval} from "node:timers";
import WebSocket from "ws";
import DiscordService from "../../Service/DiscordService";

export default class PolymarketManager extends SupplierManager implements SupplierInterface {
    static readonly url = 'https://gamma-api.polymarket.com';
    app!: App;
    name: string = "polymarket";
    markets: MarketInterface[] = [];
    newMarkets: MarketInterface[] = [];
    running: boolean = false;
    sports: PolymarketSportInterface[] = [];
    readonly sportSlugs: string[] = ["nba"];
    polymarketSocket: PolymarketSocketInterface | null = null;
    public types: TypeMappingInterface[] = [
        {
            prop: "ask",
            value: OddTypeEnum.Back,
        },
        {
            prop: "bid",
            value: OddTypeEnum.Lay,
        },
    ]

    constructor(app: App) {
        super(app)
    }

    async start() {
        this.running = true;
        await this.updateMarkets();
        setInterval(async () => {
            this.updateMarkets();
        }, 3600 * 1000 * 24);
    }

    async updateMarkets() {
        await this.getSports()
        this.newMarkets = [];
        for (const sport of this.sports) {
            if (this.sportSlugs.includes(sport.sport)) {
                await this.getMarkets(sport);
            }
        }
        this.markets = [...this.newMarkets];
        this.newMarkets = [];
        await this.connectMarkets();
    }

    transformApiMarketToMarket({
                                   polymarketMarket,
                                   serie,
                                   sport,
                                   event,
                               }: {
        polymarketMarket: any,
        serie: PolymarketSeriesInterface,
        sport: PolymarketSportInterface,
        event: PolymarketEventInterface
    }): MarketInterface {
        const now = Date.now();
        const market: MarketInterface = {
            event: {
                id: event.id,
                name: event.title,
                competition: {
                    id: sport.series,
                    name: sport.sport,
                    sport: {
                        id: "",
                        name: "",
                        enum: SportEnum.Basketball,
                    }
                }
            },
            supplier: this.name,
            id: polymarketMarket.id,
            inPlay: null,
            odds: [],
            marketRunners: [],
            name: polymarketMarket.sportsMarketType,
            numberOfWinners: 1,
            runners: JSON.parse(polymarketMarket.outcomes).map((name: string, index: number) => {
                const runner: RunnerInterface = {
                    id: JSON.parse(polymarketMarket.clobTokenIds)[index],
                    name: name,
                }
                return runner;
            }),
            created: now,
            startTime: (new Date(polymarketMarket.gameStartTime)).getTime(),
            status: null,
            deleted: null,
            totalMatched: 0,
            diffs: [],
            modificationsOnMarket: [],
            connections: [],
            isSaving: false,
            clobTokenIds: JSON.parse(polymarketMarket.clobTokenIds),
        };
        this.initMarketRunners(market);
        return market;
    }

    async stop() {
        // todo
    }

    getStatus(status: string): MarketStatusEnum | null {
        console.error("getStatus 2 unknown", status)
        return null;
    }

    private async connectMarkets() {
        if (this.markets.length === 0) {
            if (
                this.polymarketSocket?.websocket &&
                (this.polymarketSocket.websocket.readyState === WebSocket.CONNECTING || this.polymarketSocket.websocket.readyState === WebSocket.OPEN)
            ) {
                this.polymarketSocket.websocket.close();
            }
            this.polymarketSocket = null;
        } else if (this.polymarketSocket === null) {
            this.polymarketSocket = {
                open: null,
                websocket: new WebSocket("wss://ws-subscriptions-clob.polymarket.com/ws/market", {}),
                markets: [],
                pingInterval: null,
            }
            this.polymarketSocket.websocket.on('open', async () => {
                this.polymarketSocket!.open = Date.now();
                await this.sendMarkets();
                this.polymarketSocket!.pingInterval = setInterval(async () => {
                    this.polymarketSocket!.websocket.send("PING");
                }, 10_000);
            });
            this.polymarketSocket.websocket.on('error', (e) => {
                console.error("[PolymarketTask] websocket on error", e);
                DiscordService.send(JSON.stringify({
                    event: "websocket.on('error' connectMarkets",
                    name: e.name,
                    message: e.message,
                }))
            });
            this.polymarketSocket.websocket.on('close', () => { // each time error is called -> close is also call
                if (this.polymarketSocket!.pingInterval) {
                    clearInterval(this.polymarketSocket!.pingInterval);
                }
                this.connectMarkets();
            });
            this.polymarketSocket.websocket.on('message', (data: Buffer) => {
                let result: any = data.toString();
                try {
                    result = JSON.parse(result);
                    if (
                        !this.ignoreMessage(result) &&
                        !this.handleMessageInitialDump(result)
                    ) {
                        console.warn("new message", result);
                        DiscordService.send(JSON.stringify({
                            event: "no handle",
                            message: data,
                        }));
                    }
                    return;
                } catch (e) {
                    // nothing
                }
                if (result === "PONG") {
                    return;
                }
                console.warn("new message", result)
                DiscordService.send(JSON.stringify({
                    event: "no handle",
                    message: data,
                }));
            });
        } else {
            await this.sendMarkets();
        }
    }

    private ignoreMessage(data: any): boolean {
        return data.hasOwnProperty("event_type") && (
            data.event_type === "last_trade_price" ||
            data.event_type === "price_change"
        );
    }

    private handleMessageInitialDump(initialDumps: PolymarketInitialDumpInterface[] | PolymarketInitialDumpInterface): boolean {
        const now = Date.now();
        if (!Array.isArray(initialDumps)) {
            initialDumps = [initialDumps];
        }
        if (
            !initialDumps[0].hasOwnProperty("asset_id") ||
            !initialDumps[0].hasOwnProperty("timestamp") ||
            !initialDumps[0].hasOwnProperty("bids") || // lay
            !initialDumps[0].hasOwnProperty("asks") || // back
            // !initialDumps[0].hasOwnProperty("tick_size") ||
            !initialDumps[0].hasOwnProperty("event_type") ||
            initialDumps[0].event_type !== "book"
        ) {
            return false;
        }
        for (const initialDump of initialDumps) {
            const market = this.markets.find(m => m.clobTokenIds!.includes(initialDump.asset_id))!;
            const marketRunner = market.marketRunners.find(mr => mr.runnerId === initialDump.asset_id)!;
            for (const type of this.types) {
                // @ts-ignore
                for (let index = 0; (index < initialDump[type.prop + "s"].length && index < 1); index++) {
                    // @ts-ignore
                    const prop = initialDump[type.prop + "s"][initialDump[type.prop + "s"].length - index - 1];

                    const valueOddValue = Math.round((1 / Number(prop.price)) * 1000);
                    if (valueOddValue > 1) {
                        const oddRunnerOddValue = this.getOdd(marketRunner.odds, OddNameEnum.RunnerOddValue, type.value, index);
                        this.addOddValue(oddRunnerOddValue, valueOddValue, now)
                    }

                    const valueOddVolume = Math.round(Number(prop.size));
                    if (valueOddVolume > 0) {
                        const oddRunnerOddVolume = this.getOdd(marketRunner.odds, OddNameEnum.RunnerOddVolume, type.value, index);
                        this.addOddValue(oddRunnerOddVolume, valueOddVolume, now)
                    }
                }
            }
        }
        return true;
    }

    private async sendMarkets() {
        if (this.polymarketSocket!.markets.length === 0) {
            this.polymarketSocket!.websocket.send(JSON.stringify({
                "assets_ids": this.markets.flatMap(m => m.clobTokenIds),
                "type": "market",
                "initial_dump": true,
                "level": 2,
                "custom_feature_enabled": false
            }));
        } else {
            const listeningAssets: string[] = this.polymarketSocket!.markets.flatMap(m => m.clobTokenIds!);
            const assets: string[] = this.markets.flatMap(m => m.clobTokenIds!);
            const assetsToRemove = listeningAssets.filter(id => !assets.includes(id));
            const assetToAdd = assets.filter(id => !listeningAssets.includes(id));

            if (assetsToRemove.length > 0) {
                this.polymarketSocket!.websocket.send(JSON.stringify({
                    "operation": "unsubscribe",
                    "assets_ids": assetsToRemove,
                }));
            }

            if (assetToAdd.length > 0) {
                this.polymarketSocket!.websocket.send(JSON.stringify({
                    "operation": "subscribe",
                    "assets_ids": assetToAdd,
                }));
            }

        }
    }

    private async getMarkets(sport: PolymarketSportInterface) {
        const serie = await this.getSerie(sport.series);
        const events = serie.events.filter(e => !e.closed && e.active);
        for (const e of events) {
            const event = await this.getEvent(e.id);
            const polymarketMarket = event.markets.find(m => m.question === event.title)!;
            this.newMarkets.push(this.transformApiMarketToMarket({
                polymarketMarket: polymarketMarket, sport: sport, serie: serie, event: event
            }));
        }
    }

    private async getEvent(eventId: string): Promise<PolymarketEventInterface> {
        const res = await fetch(PolymarketManager.url + '/events/' + eventId, {
            method: 'GET',
            headers: {'Content-Type': 'application/json'},
        });
        return await res.json();
    }

    private async getSerie(serieId: string): Promise<PolymarketSeriesInterface> {
        const res = await fetch(PolymarketManager.url + '/series/' + serieId, {
            method: 'GET',
            headers: {'Content-Type': 'application/json'},
        });
        return await res.json();
    }

    private async getSports() {
        const res = await fetch(PolymarketManager.url + '/sports', {
            method: 'GET',
            headers: {'Content-Type': 'application/json'},
        });
        this.sports = await res.json();
    }
}
