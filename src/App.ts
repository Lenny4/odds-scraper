'use strict';

import OrbitxManager from "./Suppliers/Orbitx/OrbitxManager";
import MongoService from "./Service/MongoService";
import Dashboard from "./Front/Dashboard";
import {
    CompetitionMappingInterface,
    GroupMarketInterface,
    MarketInterface,
    MatchingMarketInterface,
    RemoveGroupMarketInterface
} from "./Interface/MarketInterface";
import {SupplierManager} from "./Suppliers/SupplierManager";
import {CompetitionEnum} from "./Enum/CompetitionEnum";
import PolymarketManager from "./Suppliers/Polymarket/PolymarketManager";
import stringSimilarity from "string-similarity";

export default class App {
    public mongoService: MongoService;
    public orbitxManager: OrbitxManager;
    public polymarketManager: PolymarketManager;
    public dashboard: Dashboard;
    public groupMarkets: GroupMarketInterface[] = [];
    public competitionMapping: CompetitionMappingInterface[] = [
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

    constructor() {
        this.mongoService = new MongoService(this);
        this.orbitxManager = new OrbitxManager(this);
        this.polymarketManager = new PolymarketManager(this);
        this.dashboard = new Dashboard(this);
    }

    async start() {
        await this.mongoService.start()
        this.orbitxManager.start();
        this.polymarketManager.start();
        this.dashboard.start()
    }

    addGroupMarket(market: MarketInterface) {
        const competitionMapping = this.competitionMapping.find(c => c.values.find(v => v.supplier === market.supplier && v.id === market.event.competition.id))
        if (!competitionMapping) {
            return;
        }
        for (const supplierManager of Object.values(this)) {
            if (!(supplierManager instanceof SupplierManager) || market.supplier === supplierManager.name) {
                continue;
            }
            const markets = supplierManager.markets.filter(m => m.event.competition.id === market.event.competition.id);
            if (markets.length === 0) {
                return;
            }
            const matchingMarket = this.findMatchingMarket(market, markets);
            if (matchingMarket) {
                let groupMarket = this.groupMarkets.find(gm => gm.markets.find(m => m.id === matchingMarket.id));
                if (groupMarket) {
                    groupMarket.markets.push(market);
                } else {
                    this.groupMarkets.push({
                        markets: [market, matchingMarket],
                    })
                }
            }
            return;
        }
    }

    findMatchingMarket(market: MarketInterface, markets: MarketInterface[]): MarketInterface | null {
        let matchingMarket: MatchingMarketInterface | null = null;
        const runner1Names = market.runners.map(r => r.name);
        for (const m of markets) {
            if (Math.abs(market.startTime - m.startTime) > 3600 * 1000) { // j'en ai vu au moins 1 avec 50 min de diff
                return null;
            }
            const runner2Names = m.runners.map(r => r.name);
            let bestScore = 0;
            const permutations = this.permute(runner2Names);
            for (const perm of permutations) {
                const score = runner1Names.reduce((sum, name, i) => {
                    return sum + stringSimilarity.compareTwoStrings(name, perm[i] ?? '');
                }, 0) / runner1Names.length;
                if (score > bestScore) bestScore = score;
            }
            if (matchingMarket === null || bestScore > matchingMarket.score) {
                matchingMarket = {
                    market: m,
                    score: bestScore,
                }
            }

        }
        if (matchingMarket?.market && matchingMarket.score > 0.62) {
            return matchingMarket?.market;
        }
        return null;
    }

    removeGroupMarkets(removeGroupMarkets: RemoveGroupMarketInterface[]) {
        for (const removeGroupMarket of removeGroupMarkets) {
            for (const [indexGroupMarket, groupMarket] of this.groupMarkets.entries()) {
                const index = groupMarket.markets.findIndex(m => m.supplier === removeGroupMarket.supplier && m.id === removeGroupMarket.id);
                if (index >= 0) {
                    groupMarket.markets.splice(index, 1);
                    if (groupMarket.markets.length === 0) {
                        this.groupMarkets.splice(indexGroupMarket, 1);
                    }
                    break;
                }
            }
        }
    }

    async stop() {
        // todo
    }

    private permute(arr: string[]): string[][] {
        if (arr.length <= 1) return [arr];
        return arr.flatMap((item, i) =>
            this.permute([...arr.slice(0, i), ...arr.slice(i + 1)]).map(p => [item, ...p])
        );
    }
}
