'use strict';

import {MarketInterface} from "../../Interface/MarketInterface";
import App from "../../App";
import {SupplierInterface} from "../../Interface/SupplierInterface";

export default class OrbitxManager implements SupplierInterface {
    app: App;
    name: string = "orbitx";
    markets: MarketInterface[] = [];

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
