'use strict';

import OrbitxManager from "./Suppliers/Orbitx/OrbitxManager";
import PolymarketManager from "./Suppliers/Polymarket/PolymarketManager";

export default class App {


    constructor() {
        // nothing
    }

    public async start() {
        new OrbitxManager(this).start();
        new PolymarketManager(this).start();
    }

    public async stop() {
        // todo
    }
}
