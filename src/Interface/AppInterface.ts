'use strict';
import {EventInterface} from "./MarketInterface";

export interface DetailAppInterface {
    groupMarkets: {
        markets: {
            id: string | number;
            supplier: string;
            event: EventInterface;
            nbModificationsOnMarket: number;
        }[];
    }[];
    socketMarkets: {
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
    }[];
}
