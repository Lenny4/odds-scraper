'use strict';

import {MarketInterface} from "./MarketInterface";
import App from "../App";

export interface SupplierInterface {
    app: App;
    name: string;
    markets: MarketInterface[];

    start(distance: number): Promise<void>;
    stop(): Promise<void>;
}
