'use strict';
import {GroupMarketMessageInterface} from "./LiveInterface";

export interface SocketMarketDetailInterface {
    name: string;
    socketMarkets: {
        lastReceivedMessageDiff?: string | undefined;
        markets: (string | number)[];
        newNbModificationsOnMarkets: number;
        websocket: | typeof WebSocket.CONNECTING
            | typeof WebSocket.OPEN
            | typeof WebSocket.CLOSING
            | typeof WebSocket.CLOSED | undefined;
    }[];
}

export interface DetailAppInterface {
    groupMarkets: GroupMarketMessageInterface[];
    socketMarkets: SocketMarketDetailInterface[];
}
