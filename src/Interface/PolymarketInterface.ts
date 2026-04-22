'use strict';

export interface PolymarketSportInterface {
    id: number;
    sport: string;
    series: string;
}

export interface PolymarketSerieEventInterface {
    id: string;
    title: string;
    active: boolean;
    closed: boolean;
    endDate: string;
}

export interface PolymarketSeriesInterface {
    id: string;
    events: PolymarketSerieEventInterface[];
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
    startDate: number;
    endDate: number | null;
    markets: any[];
}