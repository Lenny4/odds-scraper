'use strict';

import {MarketInterface} from "./MarketInterface";
import App from "../App";

export interface SupplierInterface {
    app: App;
    name: string;
    markets: MarketInterface[];
    running: boolean;

    start(distance: number): Promise<void>;
    stop(): Promise<void>;
    canScrapMarket(apiMarket: any): boolean;
    marketToString(market: MarketInterface, encodeUri: boolean): string;
    getMarketIsFinish(market: MarketInterface): boolean;
    getMarketUrl(market: MarketInterface, encodeUri: boolean): string | null;
}
