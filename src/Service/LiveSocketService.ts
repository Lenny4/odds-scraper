'use strict';

import App from "../App";
import {createServer} from "node:http";
import {Server, Socket} from "socket.io";
import {
    GroupMarketMessageInterface,
    GroupMarketRequestInterface,
    LiveMessageInterface,
    MarketMessageInterface,
    OddReceiveInterface,
    OddRequestInterface
} from "../Interface/LiveInterface";
import {OddInterface} from "../Interface/MarketInterface";
import {getOddsForOddRequest} from "./Utils";

const clone = require('clone');

export default class LiveSocketService {
    public app: App;
    private io?: Server;

    constructor(app: App) {
        this.app = app;
    }

    public async start() {
        const PORT = Number(process.env.LIVE_PORT) || 4004;

        const httpServer = createServer();
        this.io = new Server(httpServer, {
            cors: {
                origin: "http://localhost:4001",
                credentials: true
            }
        });
        this.io.on("connection", (socket) => {
            socket.on("message", (data: LiveMessageInterface) => {
                if (data.type === 'groupMarkets') {
                    socket.emit("message", this.groupMarketsMessage(data.value));
                }
                if (data.type === 'odds') {
                    socket.emit("message", this.oddsMessage(data.value));
                }
                if (data.type === 'join') {
                    this.joinRooms(socket, data.value);
                }
            });
        });

        httpServer.listen(PORT, '0.0.0.0', () => {
            console.log(`LiveSocketService server running on port ${PORT}`);
        });
    }

    sendOddsMessage(oddRequests: OddRequestInterface[]) {
        for (const oddRequest of oddRequests) {
            this.io?.to(oddRequest.groupMarketId.toString()).emit("message", this.oddsMessage(oddRequests));
        }
    }

    sendGroupMarketsMessage(groupMarketRequest: GroupMarketRequestInterface) {
        this.io?.sockets.emit("message", this.groupMarketsMessage(groupMarketRequest));
    }

    private groupMarketsMessage(groupMarketRequest: GroupMarketRequestInterface): GroupMarketMessageInterface[] {
        let groupMarkets = [...this.app.groupMarkets];
        if (groupMarketRequest.groupMarketIds !== undefined) {
            groupMarkets = groupMarkets.filter(gm => groupMarketRequest.groupMarketIds!.includes(gm.id));
        }
        return groupMarkets.map(gm => {
            const groupMarketMessage: GroupMarketMessageInterface = {
                id: gm.id,
                markets: gm.markets.map(m => {
                    const marketMessage: MarketMessageInterface = {
                        id: m.id,
                        event: m.event,
                        marketRunners: m.marketRunners.map(mr => {
                            return {
                                ...mr,
                                odds: [],
                            }
                        }),
                        name: m.name,
                        odds: [],
                        runners: m.runners,
                        supplier: m.supplier,
                    }
                    return marketMessage;
                }),
            };
            return groupMarketMessage;
        });
    }

    private oddsMessage(oddRequests: OddRequestInterface[]) {
        const oddReceives: OddReceiveInterface[] = [];
        for (const oddRequest of oddRequests) {
            let odds: OddInterface[] | undefined = undefined;
            const market = this.app.groupMarkets.find(gm => gm.id === oddRequest.groupMarketId)?.markets.find(m => m.supplier === oddRequest.supplier && m.id === oddRequest.marketId);
            if (market) {
                odds = getOddsForOddRequest(market, oddRequest);
                if (oddRequest.i !== undefined) {
                    for (const [index, odd] of odds.entries()) {
                        odds[index] = clone(odd);
                        odds[index].values = odd.values.filter(o => o.i >= oddRequest.i!)
                    }
                }
                oddReceives.push({
                    ...oddRequest,
                    odds: odds,
                })
            }
        }
        return oddReceives;
    }

    private joinRooms(socket: Socket, groupMarketIds: string[]) {
        const currentRooms = new Set(socket.rooms);
        currentRooms.delete(socket.id); // Ignore private room

        const roomsToLeave = [...currentRooms].filter(room => !groupMarketIds.includes(room));
        const roomsToJoin = groupMarketIds.filter(room => !currentRooms.has(room));

        // Leave rooms that are not in marketIds
        for (const room of roomsToLeave) {
            socket.leave(room);
        }

        // Join rooms that are not already joined
        for (const room of roomsToJoin) {
            socket.join(room);
        }
    }

}
