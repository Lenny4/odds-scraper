'use strict';

import {MarketInterface} from "../../Interface/MarketInterface";
import App from "../../App";
import {SupplierInterface} from "../../Interface/SupplierInterface";

export default class PolymarketManager implements SupplierInterface {
    app: App;
    name: string = "polymarket";
    markets: MarketInterface[] = [];
    running: boolean = false;

    constructor(app: App) {
        this.app = app;
    }

    public async start() {
        // todo
    }

    public async stop() {
        // todo
    }
}
