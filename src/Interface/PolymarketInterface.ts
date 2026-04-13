'use strict';
import WebSocket from "ws";

import {MarketInterface} from "./MarketInterface";

export interface PolymarketSportInterface {
    id: number;
    sport: string;
    series: string;
}

export interface PolymarketSeriesInterface {
    id: string;
    events: {
        id: string;
        active: boolean;
        closed: boolean;
    }[];
}

interface PolymarketInitialDumpOddInterface {
    price: string;
    size: string;
}

export interface PolymarketInitialDumpInterface {
    market: string;
    asset_id: string;
    timestamp: string;
    bids: PolymarketInitialDumpOddInterface[]; // lay
    asks: PolymarketInitialDumpOddInterface[]; // back
    tick_size: string;
    event_type: string;
    last_trade_price: string;
}

export interface PolymarketEventInterface {
    id: string;
    title: string;
    markets: any[];
}

export interface PolymarketSocketInterface {
    open: number | null;
    websocket: WebSocket;
    markets: MarketInterface[];
    pingInterval: NodeJS.Timeout | null;
}