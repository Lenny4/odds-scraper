import App from "../App";
import {Server} from "socket.io";
import humanizeDuration from "humanize-duration";
import {DetailAppInterface, SocketMarketDetailChildInterface} from "../Interface/AppInterface";
import {GroupMarketMessageInterface, MarketMessageInterface} from "../Interface/LiveInterface";
import {MarketInterface} from "../Interface/MarketInterface";

export default class Dashboard {
    public app: App;
    public intervalBroadcast: NodeJS.Timeout | null = null;

    constructor(app: App) {
        this.app = app;
    }

    public async start() {
        const port = process.env.SOCKET_PORT || 4002;
        const io = new Server(Number(port), {
            cors: {
                origin: "*",  // adjust this for security in production
            }
        });
        console.log(`Dashboard server running on port ${port}`);

        io.on('connection', (socket) => {
            // nothing
        });

        this.intervalBroadcast = setInterval(async () => {
            if (io.sockets.sockets.size === 0) {
                return;
            }
            io.sockets.emit('details', await this.getDetails());
        }, 1_000);
    }

    public async stop() {
        // todo
    }

    marketToMarketMessage(m: MarketInterface) {
        return {
            marketRunners: m.marketRunners.map(mr => {
                return {
                    ...mr,
                    odds: mr.odds.map(o => {
                        return {
                            ...o,
                            values: [],
                        }
                    }),
                }
            }),
            name: m.name,
            odds: m.odds.map(o => {
                return {
                    ...o,
                    values: [],
                }
            }),
            runners: m.runners,
            id: m.id,
            supplier: m.supplier,
            event: m.event,
            endTime: m.endTime,
            startTime: m.startTime,
        } as MarketMessageInterface
    }

    private async getDetails() {
        const now = Date.now();

        const details: DetailAppInterface = {
            groupMarkets: this.app.groupMarkets.map(gm => {
                const groupMarketMessage: GroupMarketMessageInterface = {
                    id: gm.id,
                    startTime: gm.startTime,
                    markets: gm.markets.map(m => {
                        return this.marketToMarketMessage(m)
                    })
                };
                return groupMarketMessage;
            }),
            socketMarkets: this.app.supplierManagers.map((supplierManager) => {
                return {
                    name: supplierManager.name,
                    socketMarkets: supplierManager.socketMarkets.map(socketMarket => {
                        const socketMarketDetailChild: SocketMarketDetailChildInterface = {
                            id: socketMarket.id,
                            markets: socketMarket.markets.map(m => m.id),
                            newNbModificationsOnMarkets: socketMarket.markets.reduce((sum, m) => {
                                return sum + (m?.modificationsOnMarket?.length || 0);
                            }, 0),
                            closing: socketMarket.closing,
                            websocket: socketMarket.websocket?.readyState,
                            ...(socketMarket.markets.length > 0 && {
                                lastReceivedMessageDiff: humanizeDuration(now - (socketMarket.lastReceivedMessage ?? 0), {
                                    largest: 2,
                                    round: true,
                                }),
                            }),
                        }
                        return socketMarketDetailChild
                    }),
                }
            }),
        }
        return details;
    }
}
