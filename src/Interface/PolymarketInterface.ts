'use strict';

import {SportInterface} from "./MarketInterface";

export interface PolymarketSportInterface extends SportInterface {
    tagIds: number[]; // gamma tags, an event matches the sport if it has one of them
}

export interface PolymarketSeriesInterface {
    id: string;
    slug: string;
    title: string;
}

export interface PolymarketMarketInterface {
    id: string;
    question: string;
    groupItemTitle?: string | null;
    sportsMarketType?: string | null;
    outcomes: string; // JSON string: '["Yes", "No"]'
    clobTokenIds?: string; // JSON string, same order as outcomes
    gameStartTime?: string | null;
    active: boolean;
    closed: boolean;
    acceptingOrders?: boolean;
    volumeNum?: number | null;
}

export interface PolymarketEventInterface {
    id: string;
    slug: string;
    title: string;
    startTime?: string | null;
    closed: boolean;
    series?: PolymarketSeriesInterface[];
    markets: PolymarketMarketInterface[];
}

export interface PolymarketEventsKeysetInterface {
    events: PolymarketEventInterface[];
    next_cursor?: string | null;
}

export interface PolymarketApiMarketInterface {
    event: PolymarketEventInterface;
    sport: PolymarketSportInterface;
}

export interface PolymarketOrderSummaryInterface {
    price: string;
    size: string;
}

export interface PolymarketBookMessageInterface {
    event_type: "book";
    market: string;
    asset_id: string;
    timestamp: string;
    bids: PolymarketOrderSummaryInterface[]; // lay
    asks: PolymarketOrderSummaryInterface[]; // back
}

export interface PolymarketPriceChangeInterface {
    asset_id: string;
    price: string;
    size: string; // new total size at this price, "0" removes the level
    side: "BUY" | "SELL"; // BUY -> bids, SELL -> asks
}

export interface PolymarketPriceChangeMessageInterface {
    event_type: "price_change";
    market: string;
    timestamp: string;
    price_changes: PolymarketPriceChangeInterface[];
}

export interface PolymarketMarketResolvedMessageInterface {
    event_type: "market_resolved";
    market: string;
    assets_ids: string[];
    winning_asset_id: string;
}

export interface PolymarketOrderBookInterface {
    bids: Map<number, number>; // price -> size
    asks: Map<number, number>;
}
