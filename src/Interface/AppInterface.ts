'use strict';
import {EventInterface} from "./MarketInterface";

export interface GroupMarketDetailInterface {
    id: number;
    markets: {
        id: string | number;
        supplier: string;
        event: EventInterface;
        nbModificationsOnMarket: number;
    }[];
}

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
    groupMarkets: GroupMarketDetailInterface[];
    socketMarkets: SocketMarketDetailInterface[];
}
