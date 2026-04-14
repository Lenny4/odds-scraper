import App from "../App";
import {Server} from "socket.io";
import humanizeDuration from "humanize-duration";
import {SupplierManager} from "../Suppliers/SupplierManager";
import {DetailAppInterface} from "../Interface/AppInterface";

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
            console.log('Client connected:', socket.id);
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

    private async getDetails() {
        const now = Date.now();

        const supplierManagers = Object.values(this.app).filter(supplierManager => supplierManager instanceof SupplierManager);
        const details: DetailAppInterface = {
            groupMarkets: this.app.groupMarkets.map(gm => {
                return {
                    id: gm.id,
                    markets: gm.markets.map(m => {
                        return {
                            id: m.id,
                            supplier: m.supplier,
                            event: m.event,
                            nbModificationsOnMarket: m.modificationsOnMarket?.length,
                        }
                    })
                }
            }),
            socketMarkets: supplierManagers.map((supplierManager) => {
                return {
                    name: supplierManager.name,
                    socketMarkets: supplierManager.socketMarkets.map(socketMarket => {
                        return {
                            markets: socketMarket.markets.map(m => m.id),
                            newNbModificationsOnMarkets: socketMarket.markets.reduce((sum, m) => {
                                return sum + (m?.modificationsOnMarket?.length || 0);
                            }, 0),
                            websocket: socketMarket.websocket?.readyState,
                            ...(socketMarket.markets.length > 0 && {
                                lastReceivedMessageDiff: humanizeDuration(now - (socketMarket.lastReceivedMessage ?? 0), {
                                    largest: 2,
                                    round: true,
                                }),
                            }),
                        }
                    }),
                }
            }),
        }
        return details;
    }
}
