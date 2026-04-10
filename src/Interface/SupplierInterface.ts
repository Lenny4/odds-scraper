'use strict';

import {MarketInterface} from "./MarketInterface";

export interface SupplierInterface {
    name: string;
    markets: MarketInterface[]
}
