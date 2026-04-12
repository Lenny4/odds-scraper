'use strict';

import OrbitxManager from "./Suppliers/Orbitx/OrbitxManager";
import MongoService from "./Service/MongoService";

export default class App {
    public mongoService: MongoService;

    constructor() {
        this.mongoService = new MongoService(this);
    }

    async start() {
        await this.mongoService.start()
        new OrbitxManager(this).start();
        // new PolymarketManager(this).start();
    }

    async stop() {
        // todo
    }
}
