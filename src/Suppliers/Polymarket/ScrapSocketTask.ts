'use strict';

import WebSocket from "ws";
import PolymarketManager from "./PolymarketManager";
import {MarketInterface, SocketMarketInterface, TypeMappingInterface} from "../../Interface/MarketInterface";
import {OddNameEnum, OddTypeEnum} from "../../Enum/MarketEnum";
import {
    PolymarketBookMessageInterface,
    PolymarketMarketResolvedMessageInterface,
    PolymarketOrderBookInterface,
    PolymarketPriceChangeMessageInterface
} from "../../Interface/PolymarketInterface";
import DiscordService from "../../Service/DiscordService";
import {RateLimiter} from "../../Service/RateLimiter";
import {errorToString} from "../../Service/Utils";

export default class ScrapSocketTask {
    static readonly maxAssetsPerSocket: number = 500; // not documented by Polymarket, conservative value
    static readonly maxOpenTime: number = 3600 * 1000; // a socket is replaced after 1 hour
    static readonly pingInterval: number = 10_000; // https://docs.polymarket.com: send PING every 10 seconds
    static readonly refreshInterval: number = 30_000;
    static readonly reconnectBaseDelay: number = 1_000;
    static readonly reconnectMaxDelay: number = 60_000;
    static readonly nbOddIndexes: number = 3; // same depth as Orbitx
    private static readonly ignoredEventTypes = ["last_trade_price", "tick_size_change", "best_bid_ask", "new_market"];
    polymarketManager: PolymarketManager;
    id: number = 0;
    isHandlingMarket: boolean = false;
    needHandleMarket: boolean = false;
    refreshInterval: NodeJS.Timeout | null = null;
    reconnectTimeout: NodeJS.Timeout | null = null;
    nbReconnections: number = 0;
    books: Map<string, PolymarketOrderBookInterface> = new Map();
    // avoid opening a burst of connections (reconnection loop, many sockets needed at start)
    private connectionLimiter = new RateLimiter(5, 10_000);
    private types: TypeMappingInterface[] = [
        {prop: 'asks', value: OddTypeEnum.Back}, // back a runner = buy its token at the ask price
        {prop: 'bids', value: OddTypeEnum.Lay},
    ];

    public constructor(polymarketManager: PolymarketManager) {
        this.polymarketManager = polymarketManager;
        this.start();
    }

    static getBookOdds(book: PolymarketOrderBookInterface, prop: string): { price: number, size: number }[] {
        const levels = [...(prop === 'asks' ? book.asks : book.bids).entries()]
            .map(([price, size]) => ({price, size}))
            .filter(l => l.size > 0 && l.price > 0);
        // best ask = lowest price, best bid = highest price
        levels.sort((a, b) => prop === 'asks' ? a.price - b.price : b.price - a.price);
        return levels.slice(0, ScrapSocketTask.nbOddIndexes);
    }

    public start() {
        this.handleMarkets();
        this.refreshInterval = setInterval(() => {
            this.polymarketManager.removeModificationsOnMarkets();
            this.handleMarkets();
        }, ScrapSocketTask.refreshInterval);
    }

    public stop() {
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
            this.refreshInterval = null;
        }
        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
            this.reconnectTimeout = null;
        }
        for (const socketMarket of this.polymarketManager.socketMarkets) {
            this.closeSocketMarket(socketMarket);
        }
    }

    public async handleMarkets() {
        if (!this.polymarketManager.running) {
            return;
        }
        if (this.isHandlingMarket) {
            this.needHandleMarket = true;
            return;
        }
        this.isHandlingMarket = true;
        do {
            this.needHandleMarket = false;
            try {
                this.removeOldMarkets();
                await this.replaceOldSocketMarkets();
                await this.assignNewMarkets();
                this.closeEmptySocketMarkets();
            } catch (e) {
                const message = `Polymarket handleMarkets error: ${errorToString(e)}`;
                console.error(message);
                DiscordService.send(message);
            }
        } while (this.needHandleMarket && this.polymarketManager.running);
        this.isHandlingMarket = false;
    }

    handleMessage(socketMarket: SocketMarketInterface, raw: string) {
        if (raw === "PONG") {
            return;
        }
        let result: any;
        try {
            result = JSON.parse(raw);
        } catch {
            const message = `Polymarket websocket unhandled string: ${raw}`;
            console.warn(message);
            DiscordService.send(message);
            return;
        }
        const now = Date.now();
        const updatedMarkets = new Set<MarketInterface>();
        for (const message of (Array.isArray(result) ? result : [result])) {
            switch (message?.event_type) {
                case "book":
                    this.handleBook(message, updatedMarkets, socketMarket);
                    break;
                case "price_change":
                    this.handlePriceChange(message, updatedMarkets);
                    break;
                case "market_resolved":
                    this.handleMarketResolved(message);
                    break;
                default:
                    if (!ScrapSocketTask.ignoredEventTypes.includes(message?.event_type)) {
                        console.warn("Polymarket websocket unhandled message", JSON.stringify(message).substring(0, 500));
                    }
            }
        }
        for (const market of updatedMarkets) {
            market.modificationsOnMarket.push(now);
        }
        if (updatedMarkets.size > 0) {
            this.polymarketManager.app.afterUpdateMarkets([...updatedMarkets]);
        }
    }

    private handleBook(message: PolymarketBookMessageInterface, updatedMarkets: Set<MarketInterface>, socketMarket: SocketMarketInterface) {
        const toMap = (levels: { price: string, size: string }[]) =>
            new Map((levels ?? []).map(l => [Number(l.price), Number(l.size)]));
        this.books.set(message.asset_id, {bids: toMap(message.bids), asks: toMap(message.asks)});
        this.polymarketManager.addConnectionToMarkets(socketMarket.markets, 'open');
        this.updateOdds(message.asset_id, updatedMarkets);
    }

    private handlePriceChange(message: PolymarketPriceChangeMessageInterface, updatedMarkets: Set<MarketInterface>) {
        for (const priceChange of message.price_changes ?? []) {
            const book = this.books.get(priceChange.asset_id);
            if (!book) {
                continue; // wait for the book snapshot
            }
            const levels = priceChange.side === "BUY" ? book.bids : book.asks;
            const size = Number(priceChange.size);
            if (size > 0) {
                levels.set(Number(priceChange.price), size);
            } else {
                levels.delete(Number(priceChange.price));
            }
            this.updateOdds(priceChange.asset_id, updatedMarkets);
        }
    }

    private handleMarketResolved(message: PolymarketMarketResolvedMessageInterface) {
        const assetIds = message.assets_ids ?? [];
        const market = this.polymarketManager.markets.find(m => m.clobTokenIds!.some(id => assetIds.includes(id)));
        if (!market) {
            return;
        }
        market.status = this.polymarketManager.getStatus(message.event_type);
        if (this.polymarketManager.getMarketIsFinish(market)) {
            void this.polymarketManager.removeMarkets([market.id], Date.now());
        }
    }

    private updateOdds(assetId: string, updatedMarkets: Set<MarketInterface>) {
        const market = this.polymarketManager.markets.find(m => m.clobTokenIds!.includes(assetId));
        const book = this.books.get(assetId);
        if (!market || market.isSaving || !book) {
            return;
        }
        const marketRunner = market.marketRunners.find(mr => mr.runnerId === assetId);
        const runner = market.runners.find(r => r.id === assetId);
        if (!marketRunner || !runner) {
            return;
        }
        const now = Date.now();
        for (const type of this.types) {
            ScrapSocketTask.getBookOdds(book, type.prop).forEach((level, index) => {
                const oddLabel = this.polymarketManager.getOddLabel(runner, type.value, index, this.polymarketManager.name);
                const valueOddValue = Math.round((1 / level.price) * 1000);
                if (valueOddValue >= 1) {
                    const oddRunnerOddValue = this.polymarketManager.getCreateOdd(marketRunner.odds, OddNameEnum.RunnerOddValue, oddLabel, this.polymarketManager.name, type.value, index);
                    this.polymarketManager.addOddValue(oddRunnerOddValue, valueOddValue, now);
                }
                // size is in shares, price * size = USDC available at this price
                const valueOddVolume = Math.round(level.size * level.price);
                if (valueOddVolume > 0) {
                    const oddRunnerOddVolume = this.polymarketManager.getCreateOdd(marketRunner.odds, OddNameEnum.RunnerOddVolume, oddLabel, this.polymarketManager.name, type.value, index);
                    this.polymarketManager.addOddValue(oddRunnerOddVolume, valueOddVolume, now);
                }
            });
        }
        updatedMarkets.add(market);
    }

    private getAssetIds(markets: MarketInterface[]): string[] {
        return markets.flatMap(m => m.clobTokenIds ?? []);
    }

    private getNbAssets(socketMarket: SocketMarketInterface): number {
        return this.getAssetIds(socketMarket.markets).length;
    }

    private isOpen(socketMarket: SocketMarketInterface): boolean {
        return socketMarket.canListen && socketMarket.websocket?.readyState === WebSocket.OPEN;
    }

    private send(socketMarket: SocketMarketInterface, data: any) {
        if (this.isOpen(socketMarket)) {
            socketMarket.websocket!.send(typeof data === "string" ? data : JSON.stringify(data));
        }
    }

    /**
     * Unsubscribe markets which are not followed anymore
     */
    private removeOldMarkets() {
        const marketIds = new Set(this.polymarketManager.markets.map(m => m.id));
        for (const socketMarket of this.polymarketManager.socketMarkets) {
            const oldMarkets = socketMarket.markets.filter(m => !marketIds.has(m.id));
            if (oldMarkets.length === 0) {
                continue;
            }
            socketMarket.markets = socketMarket.markets.filter(m => marketIds.has(m.id));
            const assetIds = this.getAssetIds(oldMarkets);
            for (const assetId of assetIds) {
                this.books.delete(assetId);
            }
            if (socketMarket.markets.length > 0) {
                this.send(socketMarket, {operation: "unsubscribe", assets_ids: assetIds});
            }
        }
    }

    private async replaceOldSocketMarkets() {
        const now = Date.now();
        for (const socketMarket of [...this.polymarketManager.socketMarkets]) {
            if (
                socketMarket.closing ||
                socketMarket.open === null ||
                socketMarket.open + ScrapSocketTask.maxOpenTime > now ||
                this.polymarketManager.socketMarkets.some(s => s.replaceSocketMarketId === socketMarket.id)
            ) {
                continue;
            }
            await this.createSocketMarket(socketMarket.markets, socketMarket.id);
        }
    }

    private async assignNewMarkets() {
        const assignedMarketIds = new Set(
            this.polymarketManager.socketMarkets
                .filter(s => !s.closing && s.replaceSocketMarketId === undefined)
                .flatMap(s => s.markets.map(m => m.id))
        );
        const newMarkets = this.polymarketManager.markets.filter(m => !assignedMarketIds.has(m.id) && !m.isSaving);
        const markets: MarketInterface[] = [];
        for (const market of newMarkets) {
            const socketMarket = this.polymarketManager.socketMarkets.find(s =>
                !s.closing &&
                s.replaceSocketMarketId === undefined &&
                this.getNbAssets(s) + (market.clobTokenIds?.length ?? 0) <= ScrapSocketTask.maxAssetsPerSocket
            );
            if (socketMarket) {
                socketMarket.markets.push(market);
                // if the socket is not open yet, the market will be sent with the initial subscription
                this.send(socketMarket, {operation: "subscribe", assets_ids: market.clobTokenIds});
            } else {
                markets.push(market);
            }
        }
        // after a websocket close, wait for scheduleReconnect (backoff) before opening new sockets
        while (markets.length > 0 && this.polymarketManager.running && this.reconnectTimeout === null) {
            const socketMarkets: MarketInterface[] = [];
            let nbAssets = 0;
            while (markets.length > 0 && nbAssets + (markets[0].clobTokenIds?.length ?? 0) <= ScrapSocketTask.maxAssetsPerSocket) {
                nbAssets += markets[0].clobTokenIds?.length ?? 0;
                socketMarkets.push(markets.shift()!);
            }
            await this.createSocketMarket(socketMarkets);
        }
    }

    private closeEmptySocketMarkets() {
        for (const socketMarket of [...this.polymarketManager.socketMarkets]) {
            if (!socketMarket.closing && socketMarket.markets.length === 0) {
                this.closeSocketMarket(socketMarket);
            }
        }
    }

    private closeSocketMarket(socketMarket: SocketMarketInterface) {
        socketMarket.closing = true;
        if (socketMarket.pingInterval) {
            clearInterval(socketMarket.pingInterval);
            socketMarket.pingInterval = null;
        }
        if (
            socketMarket.websocket &&
            (socketMarket.websocket.readyState === WebSocket.CONNECTING || socketMarket.websocket.readyState === WebSocket.OPEN)
        ) {
            socketMarket.websocket.close();
        }
        this.polymarketManager.socketMarkets = this.polymarketManager.socketMarkets.filter(s => s.id !== socketMarket.id);
    }

    private scheduleReconnect() {
        if (this.reconnectTimeout || !this.polymarketManager.running) {
            return;
        }
        this.nbReconnections++;
        const delay = Math.min(ScrapSocketTask.reconnectBaseDelay * 2 ** (this.nbReconnections - 1), ScrapSocketTask.reconnectMaxDelay);
        this.reconnectTimeout = setTimeout(() => {
            this.reconnectTimeout = null;
            this.handleMarkets();
        }, delay);
    }

    private async createSocketMarket(markets: MarketInterface[], replaceSocketMarketId: number | undefined = undefined) {
        await this.connectionLimiter.acquire();
        if (!this.polymarketManager.running) {
            return;
        }
        this.id++;
        const socketMarket: SocketMarketInterface = {
            id: this.id,
            markets: [...markets],
            oldMarketIds: [],
            open: null,
            websocket: new WebSocket(PolymarketManager.clobWsUrl),
            closing: false,
            nbModificationsOnMarkets: 0,
            canListen: false,
            lastReceivedMessage: undefined,
            pingInterval: null,
            closeTimeout: null,
            replaceSocketMarketId: replaceSocketMarketId,
        };
        this.polymarketManager.socketMarkets.push(socketMarket);
        const websocket = socketMarket.websocket!;
        websocket.on('open', () => {
            socketMarket.open = Date.now();
            socketMarket.canListen = true;
            this.nbReconnections = 0;
            this.send(socketMarket, {
                assets_ids: this.getAssetIds(socketMarket.markets),
                type: "market",
                initial_dump: true,
                level: 2,
                custom_feature_enabled: true, // needed for market_resolved
            });
            socketMarket.pingInterval = setInterval(() => {
                this.send(socketMarket, "PING");
            }, ScrapSocketTask.pingInterval);
            if (socketMarket.replaceSocketMarketId !== undefined) {
                const oldSocketMarket = this.polymarketManager.socketMarkets.find(s => s.id === socketMarket.replaceSocketMarketId);
                socketMarket.replaceSocketMarketId = undefined;
                if (oldSocketMarket) {
                    // markets added to the old socket while this one was connecting
                    const newMarkets = oldSocketMarket.markets.filter(m => !socketMarket.markets.includes(m));
                    if (newMarkets.length > 0) {
                        socketMarket.markets.push(...newMarkets);
                        this.send(socketMarket, {operation: "subscribe", assets_ids: this.getAssetIds(newMarkets)});
                    }
                    this.closeSocketMarket(oldSocketMarket);
                }
                this.handleMarkets();
            }
        });
        websocket.on('error', (e) => {
            console.error(`[Polymarket ${socketMarket.id}] websocket on error`, e);
            DiscordService.send(JSON.stringify({
                event: "Polymarket websocket.on('error'",
                name: e.name,
                message: e.message,
                socketMarketId: socketMarket.id,
            }));
        });
        websocket.on('close', (code) => { // each time error is called -> close is also call
            socketMarket.canListen = false;
            if (socketMarket.pingInterval) {
                clearInterval(socketMarket.pingInterval);
                socketMarket.pingInterval = null;
            }
            if (socketMarket.closing) {
                return;
            }
            console.log(`[Polymarket ${socketMarket.id}] websocket closed`, code);
            this.polymarketManager.socketMarkets = this.polymarketManager.socketMarkets.filter(s => s.id !== socketMarket.id);
            if (!this.polymarketManager.running) {
                return;
            }
            if (socketMarket.replaceSocketMarketId !== undefined) {
                // replacement failed before opening, the markets are still listened by the old socket
                this.scheduleReconnect();
                return;
            }
            this.polymarketManager.addConnectionToMarkets(socketMarket.markets, 'close', `websocket closed ${code}`);
            for (const assetId of this.getAssetIds(socketMarket.markets)) {
                this.books.delete(assetId);
            }
            this.scheduleReconnect();
        });
        websocket.on('message', (data: Buffer) => {
            socketMarket.lastReceivedMessage = Date.now();
            try {
                this.handleMessage(socketMarket, data.toString());
            } catch (e) {
                const message = `[Polymarket ${socketMarket.id}] websocket on message error: ${errorToString(e)}`;
                console.error(message);
                DiscordService.send(message);
            }
        });
    }
}
