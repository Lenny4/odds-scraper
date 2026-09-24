'use strict';

import OrbitxManager from "./Suppliers/Orbitx/OrbitxManager";
import MongoService from "./Service/MongoService";
import Dashboard from "./Front/Dashboard";
import {CompetitionMappingInterface, GroupMarketInterface, MarketInterface} from "./Interface/MarketInterface";
import {CompetitionEnum} from "./Enum/CompetitionEnum";
import PolymarketManager from "./Suppliers/Polymarket/PolymarketManager";
import LiveSocketService from "./Service/LiveSocketService";
import {SupplierInterface} from "./Interface/SupplierInterface";
import {BrowserManager} from "./Service/BrowserManager";

export default class App {
    static readonly checkMarketModificationOnLast: number = 5 * 60_000;
    supplierManagers: SupplierInterface[] = [];
    mongoService: MongoService;
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
    readonly liveCompetitions: CompetitionEnum[] = [
        CompetitionEnum.Nba,
        CompetitionEnum.BtcUpdown5m,
    ];
    private groupMarketByMarket: Map<string, GroupMarketInterface> = new Map();

    constructor() {
        this.mongoService = new MongoService(this);
        this.supplierManagers = [
            new OrbitxManager(this),
            // new PolymarketManager(this),
        ]
        this.dashboard = new Dashboard(this);
        this.liveSocketService = new LiveSocketService(this);
    }

    static marketKey(marketId: number | string, supplier: string): string {
        return `${supplier}:${marketId}`;
    }

    getGroupMarket(marketId: number | string, supplier: string): GroupMarketInterface | undefined {
        return this.groupMarketByMarket.get(App.marketKey(marketId, supplier));
    }

    indexGroupMarket(market: MarketInterface, groupMarket: GroupMarketInterface | null) {
        const key = App.marketKey(market.id, market.supplier);
        if (groupMarket) {
            this.groupMarketByMarket.set(key, groupMarket);
        } else {
            this.groupMarketByMarket.delete(key);
        }
    }

    afterUpdateMarkets(markets: MarketInterface[]) {
        this.liveSocketService.sendOddsMessage(markets);
    }

    async start() {
        await this.mongoService.start();
        for (const manager of this.supplierManagers) {
            void manager.start();
        }
        void this.dashboard.start()
        void this.liveSocketService.start()
    }

    async stop() {
        // stop suppliers first: they save their remaining groupMarkets in Mongo
        for (const manager of this.supplierManagers) {
            try {
                await manager.stop();
            } catch (e) {
                console.error(`stop ${manager.name}`, e);
            }
        }
        await this.dashboard.stop();
        await this.liveSocketService.stop();
        await BrowserManager.closeAll();
        await this.mongoService.stop();
    }
}
