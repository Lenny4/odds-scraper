'use strict';

import OrbitxManager from "./Suppliers/Orbitx/OrbitxManager";
import MongoService from "./Service/MongoService";
import Dashboard from "./Front/Dashboard";
import {CompetitionMappingInterface, GroupMarketInterface} from "./Interface/MarketInterface";
import {CompetitionEnum} from "./Enum/CompetitionEnum";
import PolymarketManager from "./Suppliers/Polymarket/PolymarketManager";
import LiveSocketService from "./Service/LiveSocketService";
import {SupplierInterface} from "./Interface/SupplierInterface";
import PolymarketBitcoinManager from "./Polymarket/PolymarketBitcoinManager";

export default class App {
    static readonly checkMarketModificationOnLast: number = 5 * 60_000;
    supplierManagers: SupplierInterface[] = [];
    mongoService: MongoService;
    polymarketBitcoinManager: PolymarketBitcoinManager;
    liveSocketService: LiveSocketService;
    dashboard: Dashboard;
    groupMarketId: number = 0;
    groupMarkets: GroupMarketInterface[] = [];
    competitionMapping: CompetitionMappingInterface[] = [
        {
            enum: CompetitionEnum.Nba,
            values: [
                {
                    supplier: OrbitxManager.name,
                    id: "10547864",
                },
                {
                    supplier: PolymarketManager.name,
                    id: "10345",
                },
            ]
        }
    ];
    readonly liveCompetitions: CompetitionEnum[] = [CompetitionEnum.Nba];

    constructor() {
        this.mongoService = new MongoService(this);
        this.supplierManagers = [
            new OrbitxManager(this),
            new PolymarketManager(this),
            new PolymarketBitcoinManager(this),
        ]
        this.polymarketBitcoinManager = new PolymarketBitcoinManager(this);
        this.dashboard = new Dashboard(this);
        this.liveSocketService = new LiveSocketService(this);
    }

    getGroupMarket(marketId: number | string, supplier: string) {
        return this.groupMarkets.find(gm => gm.markets.find(m => m.id === marketId && m.supplier === supplier))!;
    }

    async start() {
        await this.mongoService.start();
        this.polymarketBitcoinManager.start()
        // for (const manager of this.supplierManagers) {
        //     manager.start();
        // }
        this.dashboard.start()
        this.liveSocketService.start()
    }

    async stop() {
        // todo
    }
}
