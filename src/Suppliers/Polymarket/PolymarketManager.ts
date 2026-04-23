'use strict';

import {
    MarketInterface,
    RunnerInterface,
    SocketMarketInterface,
    TypeMappingInterface
} from "../../Interface/MarketInterface";
import App from "../../App";
import {SupplierInterface} from "../../Interface/SupplierInterface";
import {SupplierManager} from "../SupplierManager";
import {SportEnum} from "../../Enum/SportEnum";
import {MarketStatusEnum, OddNameEnum, OddTypeEnum} from "../../Enum/MarketEnum";
import {
    PolymarketEventInterface,
    PolymarketInitialDumpInterface,
    PolymarketSeriesInterface,
    PolymarketSportInterface
} from "../../Interface/PolymarketInterface";
import {clearInterval} from "node:timers";
import WebSocket from "ws";
import DiscordService from "../../Service/DiscordService";

export default class PolymarketManager extends SupplierManager implements SupplierInterface {
    static readonly url = 'https://gamma-api.polymarket.com';
    app!: App;
    name: string = "PolymarketManager";
    markets: MarketInterface[] = [];
    newMarkets: MarketInterface[] = [];
    socketMarketId: number = 0;
    socketMarkets: SocketMarketInterface[] = [];
    running: boolean = false;
    sports: PolymarketSportInterface[] = [];
    readonly sportSlugs: string[] = ["nba"];
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
    readonly maxOpenTime: number = 3600 * 1000;

    constructor(app: App) {
        super(app)
    }

    async start() {
        this.running = true;
        await this.updateMarkets();
        setInterval(async () => {
            this.updateMarkets();
        }, 3600 * 1000);
    }

    async updateMarkets() {
        await this.getSports()
        this.newMarkets = [];
        for (const sport of this.sports) {
            if (this.sportSlugs.includes(sport.sport)) {
                await this.getMarkets(sport);
            }
        }
        for (const newMarket of this.newMarkets) {
            let market = this.markets.find(m => m.id === newMarket.id);
            if (market) {
                this.updateMarket(market, newMarket);
            } else if (this.canScrapMarket(newMarket)) {
                this.addMarket(newMarket);
            }
        }
        this.newMarkets = [];
        await this.connectMarkets();
    }

    canScrapMarket(market: MarketInterface): boolean {
        return this._canScrapMarket(market) && market.name === "moneyline";
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
                    enum: null,
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
            runners: JSON.parse(polymarketMarket.outcomes ?? "[]").map((name: string, index: number) => {
                const runner: RunnerInterface = {
                    id: JSON.parse(polymarketMarket.clobTokenIds ?? "[]")[index],
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
            clobTokenIds: JSON.parse(polymarketMarket.clobTokenIds ?? "[]"),
        };
        this.initMarket(market, this.name);
        return market;
    }

    async stop() {
        // todo
    }

    getStatus(status: string): MarketStatusEnum | null {
        console.error("getStatus PolymarketManager unknown", status)
        return null;
    }

    protected createSocketMarket(replaceSocketMarketId: number | undefined = undefined) {
        this.socketMarketId++;
        const socketMarket: SocketMarketInterface = {
            id: this.socketMarketId,
            markets: [],
            pingInterval: null,
            closeTimeout: null,
            closing: false,
            nbModificationsOnMarkets: 0,
            canListen: true,
            websocket: new WebSocket("wss://ws-subscriptions-clob.polymarket.com/ws/market"),
            open: null,
            lastReceivedMessage: undefined,
            oldMarketIds: [],
            replaceSocketMarketId: replaceSocketMarketId,
        };
        this.socketMarkets.push(socketMarket)
        socketMarket.websocket!.on('open', async () => {
            socketMarket!.open = Date.now();
            await this.sendMarkets();
            if (socketMarket.replaceSocketMarketId) {
                this.closeSocketMarket(this.socketMarkets.find(sm => sm.id === socketMarket.replaceSocketMarketId)!);
            }
            socketMarket!.pingInterval = setInterval(async () => {
                socketMarket!.websocket!.send("PING");
            }, 10_000);
            socketMarket!.closeTimeout = setInterval(async () => {
                this.connectMarkets();
            }, this.maxOpenTime);
        });
        socketMarket.websocket!.on('error', (e) => {
            console.error("[PolymarketTask] websocket on error", e);
            DiscordService.send(JSON.stringify({
                event: "websocket.on('error' connectMarkets",
                name: e.name,
                message: e.message,
            }))
        });
        socketMarket.websocket!.on('close', (code) => { // each time error is called -> close is also call
            if (socketMarket!.pingInterval) {
                clearInterval(socketMarket!.pingInterval);
            }
            if (socketMarket!.closeTimeout) {
                clearTimeout(socketMarket!.closeTimeout);
            }
            this.socketMarkets = this.socketMarkets.filter(sm => socketMarket.id !== sm.id);
            if (!socketMarket.closing) {
                console.log("[PolymarketTask] close", code);
                this.addConnectionToMarkets(socketMarket.markets, 'close');
                this.connectMarkets();
            }
        });
        socketMarket.websocket!.on('message', (data: Buffer) => {
            const raw = data.toString();
            let result: any;

            try {
                result = JSON.parse(raw);
            } catch {
                result = raw;
            }

            if (typeof result === "string") {
                if (result === "PONG") return;

                console.warn("new message (unhandled string)", result);
                DiscordService.send(JSON.stringify({event: "no handle string", message: result}));
                return;
            }

            if (
                !this.ignoreMessage(result) &&
                !this.handleMessageInitialDump(result, socketMarket)
            ) {
                console.warn("new message (unhandled object)", result);
                DiscordService.send(JSON.stringify({event: "no handle object", message: result}));
            }
        });
    }

    protected async sendMarkets() {
        for (const socketMarket of this.socketMarkets) {
            if (socketMarket.closing || socketMarket.websocket?.readyState !== WebSocket.OPEN) {
                continue;
            }
            if (socketMarket!.markets.length === 0) {
                socketMarket!.websocket!.send(JSON.stringify({
                    "assets_ids": this.markets.flatMap(m => m.clobTokenIds),
                    "type": "market",
                    "initial_dump": true,
                    "level": 2,
                    "custom_feature_enabled": false
                }));
            } else {
                const listeningAssets: string[] = socketMarket.markets.flatMap(m => m.clobTokenIds!);
                const assets: string[] = this.markets.flatMap(m => m.clobTokenIds!);
                const assetsToRemove = listeningAssets.filter(id => !assets.includes(id));
                const assetToAdd = assets.filter(id => !listeningAssets.includes(id));

                if (assetsToRemove.length > 0) {
                    socketMarket!.websocket!.send(JSON.stringify({
                        "operation": "unsubscribe",
                        "assets_ids": assetsToRemove,
                    }));
                }

                if (assetToAdd.length > 0) {
                    socketMarket!.websocket!.send(JSON.stringify({
                        "operation": "subscribe",
                        "assets_ids": assetToAdd,
                    }));
                }
            }
            socketMarket.markets = this.markets;
        }
    }

    protected async getEvent(eventId: string): Promise<PolymarketEventInterface> {
        const res = await fetch(PolymarketManager.url + '/events/' + eventId, {
            method: 'GET',
            headers: {'Content-Type': 'application/json'},
        });
        return await res.json();
    }

    protected async getSerie(serieId: string | number): Promise<PolymarketSeriesInterface> {
        const res = await fetch(PolymarketManager.url + '/series/' + serieId, {
            method: 'GET',
            headers: {'Content-Type': 'application/json'},
        });
        const serie: PolymarketSeriesInterface = await res.json();
        serie.events = serie.events.filter(e => !e.closed && e.active);
        return serie;

    }

    protected closeSocketMarket(socketMarket: SocketMarketInterface) {
        socketMarket.closing = true;
        if (
            socketMarket?.websocket &&
            (socketMarket.websocket.readyState === WebSocket.CONNECTING || socketMarket.websocket.readyState === WebSocket.OPEN)
        ) {
            socketMarket.websocket.close();
        }
        this.socketMarkets = this.socketMarkets.filter(sm => sm.id !== socketMarket.id);
    }

    private async connectMarkets() {
        const now = Date.now();
        if (this.markets.length === 0) {
            for (const socketMarket of this.socketMarkets) {
                this.closeSocketMarket(socketMarket);
            }
        } else if (this.socketMarkets.length === 0) {
            this.createSocketMarket();
        } else {
            for (const socketMarket of this.socketMarkets) {
                if (socketMarket.closing) {
                    continue;
                }
                if (socketMarket.open !== null && socketMarket.open + this.maxOpenTime < now) {
                    this.createSocketMarket(socketMarket.id);
                }
            }
        }
    }

    private ignoreMessage(data: any): boolean {
        return data.hasOwnProperty("event_type") && (
            data.event_type === "last_trade_price" ||
            data.event_type === "tick_size_change" ||
            data.event_type === "price_change"
        );
    }

    private handleMessageInitialDump(initialDumps: PolymarketInitialDumpInterface[] | PolymarketInitialDumpInterface, socketMarket: SocketMarketInterface): boolean {
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
        this.addConnectionToMarkets(socketMarket.markets, 'open');
        socketMarket.lastReceivedMessage = Date.now();
        const markets: MarketInterface[] = [];
        for (const initialDump of initialDumps) {
            const market = this.markets.find(m => m.clobTokenIds!.includes(initialDump.asset_id));
            if (!market || market.isSaving) {
                continue;
            }
            if (!markets.find(m => m.id === market.id)) {
                markets.push(market);
                market.modificationsOnMarket.push(now);
            }
            const marketRunner = market.marketRunners.find(mr => mr.runnerId === initialDump.asset_id)!;
            const runner = market.runners.find(r => r.id === marketRunner.runnerId)!
            for (const type of this.types) {
                // @ts-ignore
                for (let index = 0; (index < initialDump[type.prop + "s"].length && index < 1); index++) {
                    // @ts-ignore
                    const prop = initialDump[type.prop + "s"][initialDump[type.prop + "s"].length - index - 1];

                    const valueOddValue = Math.round((1 / Number(prop.price)) * 1000);
                    const oddLabel = this.getOddLabel(runner, type.value, index, this.name);
                    if (valueOddValue >= 1) {
                        const oddRunnerOddValue = this.getCreateOdd(marketRunner.odds, OddNameEnum.RunnerOddValue, oddLabel, this.name, type.value, index);
                        this.addOddValue(oddRunnerOddValue, valueOddValue, now)
                    }

                    const valueOddVolume = Math.round(Number(prop.size));
                    if (valueOddVolume > 0) {
                        const oddRunnerOddVolume = this.getCreateOdd(marketRunner.odds, OddNameEnum.RunnerOddVolume, oddLabel, this.name, type.value, index);
                        this.addOddValue(oddRunnerOddVolume, valueOddVolume, now)
                    }
                }
            }
        }
        this.app.liveSocketService.sendOddsMessage(markets);
        this.removeModificationsOnMarkets();
        return true;
    }

    private async getMarkets(sport: PolymarketSportInterface) {
        const serie = await this.getSerie(sport.series);
        const events = serie.events.filter(e => !e.closed && e.active);
        for (const e of events) {
            const event = await this.getEvent(e.id);
            for (const polymarketMarket of event.markets) {
                const newMarket = this.transformApiMarketToMarket({
                    polymarketMarket: polymarketMarket, sport: sport, serie: serie, event: event
                });
                if (this.canScrapMarket(newMarket)) {
                    this.newMarkets.push(newMarket);
                }
            }
        }
    }

    private async getSports() {
        const res = await fetch(PolymarketManager.url + '/sports', {
            method: 'GET',
            headers: {'Content-Type': 'application/json'},
        });
        this.sports = await res.json();
    }
}
