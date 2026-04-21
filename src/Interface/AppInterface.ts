'use strict';
import {GroupMarketMessageInterface} from "./LiveInterface";

export interface SocketMarketDetailChildInterface {
    id: number;
    lastReceivedMessageDiff?: string | undefined;
    markets: (string | number)[];
    newNbModificationsOnMarkets: number;
    websocket: | typeof WebSocket.CONNECTING
        | typeof WebSocket.OPEN
        | typeof WebSocket.CLOSING
        | typeof WebSocket.CLOSED | undefined;
}

export interface SocketMarketDetailInterface {
    name: string;
    socketMarkets: SocketMarketDetailChildInterface[];
}

export interface DetailAppInterface {
    groupMarkets: GroupMarketMessageInterface[];
    socketMarkets: SocketMarketDetailInterface[];
}
