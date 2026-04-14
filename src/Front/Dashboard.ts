import App from "../App";
import {Server} from "socket.io";
import humanizeDuration from "humanize-duration";

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
        const details: any = {
            markets: this.app.orbitxManager.markets.map(m => {
                return {
                    id: m.id,
                    name: m.name,
                    event: m.event,
                }
            }) ?? [],
            // groupMarkets: this.app.groupMarkets.map(gm => {
            //     return {
            //         markets: gm.markets.map(m => {
            //             return {
            //                 id: m.id,
            //                 supplier: m.supplier,
            //                 event: {
            //                     name: m.event.name,
            //                 }
            //             }
            //         })
            //     }
            // }),
            expectedNbSocketMarkets: this.app.orbitxManager.scrapSocketTask?.getExpectedNbSocketMarkets(),
            expectedNbWaitingSocketMarkets: this.app.orbitxManager.scrapSocketTask?.getExpectedNbWaitingSocketMarkets(),
            socketMarkets: this.app.orbitxManager.scrapSocketTask?.socketMarkets.map((s) => {
                const result: any = {
                    ...s,
                    markets: s.markets.map(m => {
                        return {
                            id: m?.id,
                            nbModificationsOnMarket: m.modificationsOnMarket?.length,
                        }
                    }),
                    newNbModificationsOnMarkets: s.markets.reduce((sum, m) => {
                        return sum + (m?.modificationsOnMarket?.length || 0);
                    }, 0),
                    websocket: s.websocket?.readyState,
                    ...(s.markets.length > 0 && {
                        lastReceivedMessageDiff: humanizeDuration(now - (s.lastReceivedMessage ?? 0), {
                            largest: 2,
                            round: true,
                        }),
                    }),
                }
                if (result.hasOwnProperty("oldMarketIds")) {
                    delete result.oldMarketIds;
                }
                return result
            }),
            waitingSocketMarkets: this.app.orbitxManager.scrapSocketTask?.waitingSocketMarkets.map((s) => {
                return {
                    ...s,
                    websocket: s.websocket?.readyState
                }
            }),
        }
        return details;
    }
}
