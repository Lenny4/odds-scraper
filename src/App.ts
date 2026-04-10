'use strict';

import OrbitxManager from "./Suppliers/Orbitx/OrbitxManager";

export default class App {


    constructor() {
        // nothing
    }

    async start() {
        new OrbitxManager(this).start();
        // new PolymarketManager(this).start();
    }

    async stop() {
        // todo
    }
}
