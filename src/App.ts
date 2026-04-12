'use strict';

import OrbitxManager from "./Suppliers/Orbitx/OrbitxManager";
import MongoService from "./Service/MongoService";
import Dashboard from "./Front/Dashboard";

export default class App {
    public mongoService: MongoService;
    public orbitxManager: OrbitxManager;
    public dashboard: Dashboard;

    constructor() {
        this.mongoService = new MongoService(this);
        this.orbitxManager = new OrbitxManager(this);
        this.dashboard = new Dashboard(this);
    }

    async start() {
        await this.mongoService.start()
        this.orbitxManager.start();
        // new PolymarketManager(this).start();
        this.dashboard.start()
    }

    async stop() {
        // todo
    }
}
