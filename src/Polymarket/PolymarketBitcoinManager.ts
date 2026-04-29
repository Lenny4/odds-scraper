'use strict';


import App from "../App";
import {
    PolymarketEventInterface,
    PolymarketSerieEventInterface,
    PolymarketSeriesInterface
} from "../Interface/PolymarketInterface";
import PolymarketManager from "../Suppliers/Polymarket/PolymarketManager";
import {
    MarketInterface,
    RunnerInterface,
    SocketMarketInterface,
    TimeValueInterface
} from "../Interface/MarketInterface";
import {SportEnum} from "../Enum/SportEnum";
import {CompetitionEnum} from "../Enum/CompetitionEnum";
import {OddNameEnum} from "../Enum/MarketEnum";
import WebSocket from "ws";
import DiscordService from "../Service/DiscordService";

export default class PolymarketBitcoinManager extends PolymarketManager {
    static readonly url = 'https://gamma-api.polymarket.com';
    name: string = "PolymarketBitcoinManager";
    app!: App;
    socketMarketId: number = 0;
    saveMarket: boolean = false;
    markets: MarketInterface[] = [];
    socketMarkets: SocketMarketInterface[] = [];
    bitcoinPrices: TimeValueInterface[] = [];
    oddsBinance: OddNameEnum[] = [OddNameEnum.CryptoValue];
    private serieId: number = 10684;
    private wsBinance: WebSocket | null = null;

    constructor(app: App) {
        super(app)
    }

    async start() {
        this.listenWsBinance();
        const serie = await this._getSerie();
        for (const serieEvent of serie.events) {
            const marketIdsToRemove = this.markets.map(m => m.id);
            await this.removeMarkets(marketIdsToRemove, Date.now(), this.saveMarket)
            if (!this.saveMarket && marketIdsToRemove.length > 0) {
                this.saveMarket = true;
            }
            const event = await this._getEvent(serieEvent);
            this.addMarket(this.transformApiMarketToMarket({
                polymarketMarket: event.markets[0],
                serie: serie,
                event: event
            }))
            this.clearBitcoinPrice();
            this.createSocketMarket();
            await this.waitMarketEnd();
        }
        this.start();
    }

    listenWsBinance() {
        if (this.wsBinance !== null) {
            return;
        }
        this.wsBinance = new WebSocket('wss://stream.binance.com:9443/ws/btcusdt@trade');
        this.wsBinance.onmessage = (event) => {
            const now = Date.now();
            const data = JSON.parse(event.data.toString());
            const currentPrice = parseFloat(data.p);
            if (this.bitcoinPrices.length === 0 || this.bitcoinPrices[this.bitcoinPrices.length - 1].v !== currentPrice) {
                this.bitcoinPrices.push({
                    i: this.bitcoinPrices.length + 1,
                    v: currentPrice,
                    t: now,
                });
                if (this.markets.length === 1) {
                    this.addConnectionToMarkets(this.markets, 'open', undefined, 0, this.oddsBinance);
                    if (this.markets[0].odds[0].values.length === 0) {
                        this.markets[0].odds[0].values = this.bitcoinPrices;
                    }
                }
                this.app.liveSocketService.sendOddsMessage(this.markets);
            }
        }
        this.wsBinance.onclose = (e) => {
            console.error("this.wsBinance", e);
            this.wsBinance = null;
            DiscordService.send(JSON.stringify({
                event: "this.wsBinance",
                message: e,
            }))
            if (this.markets.length === 1) {
                this.addConnectionToMarkets(this.markets, 'close', undefined, 0, this.oddsBinance);
            }
            this.listenWsBinance();
        }
    }

    transformApiMarketToMarket({
                                   polymarketMarket,
                                   serie,
                                   event,
                               }: {
        polymarketMarket: any,
        serie: PolymarketSeriesInterface,
        event: PolymarketEventInterface
    }): MarketInterface {
        const now = Date.now();
        const market: MarketInterface = {
            event: {
                id: event.id,
                name: event.title,
                competition: {
                    id: serie.id,
                    name: serie.id.toString(),
                    enum: CompetitionEnum.BtcUpdown5m,
                    sport: {
                        id: "",
                        name: "",
                        enum: SportEnum.Crypto,
                    }
                }
            },
            supplier: this.name,
            id: polymarketMarket.id,
            inPlayTime: null,
            odds: [{
                index: 0,
                name: OddNameEnum.CryptoValue,
                supplier: this.name,
                label: "Bitcoin value",
                nbValues: 0,
                values: []
            }],
            marketRunners: [],
            name: polymarketMarket.question,
            numberOfWinners: 1,
            runners: JSON.parse(polymarketMarket.outcomes ?? "[]").map((name: string, index: number) => {
                const runner: RunnerInterface = {
                    id: JSON.parse(polymarketMarket.clobTokenIds ?? "[]")[index],
                    name: name,
                    matchings: {},
                }
                return runner;
            }),
            created: now,
            startTime: event.startDate,
            endTime: event.endDate,
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

    private clearBitcoinPrice() {
        this.bitcoinPrices = this.bitcoinPrices.filter(bp => bp.t >= this.markets[0].startTime);
        for (const [index, bitcoinPrice] of this.bitcoinPrices.entries()) {
            bitcoinPrice.i = index;
        }
    }

    private async _getEvent(serieEvent: PolymarketSerieEventInterface) {
        const endDate = new Date(serieEvent.endDate!).getTime();
        const event = await this.getEvent(serieEvent.id);
        event.startDate = endDate - (5 * 60 * 1000);
        event.endDate = endDate;
        return event;
    }

    private async waitMarketEnd() {
        return new Promise<void>(resolve => {
            const now = Date.now();
            setTimeout(() => {
                this.closeSocketMarket(this.socketMarkets[0]);
                resolve();
            }, this.markets[0].endTime! - now);
        });
    }

    private async _getSerie() {
        const now = Date.now();
        const serie = await this.getSerie(this.serieId);
        serie.events = serie.events.filter(e => {
            const endDate = new Date(e.endDate).getTime();
            return endDate > now;
        })
        serie.events.sort((a, b) => {
            return new Date(a.endDate).getTime() - new Date(b.endDate).getTime()
        })
        return serie;
    }
}
