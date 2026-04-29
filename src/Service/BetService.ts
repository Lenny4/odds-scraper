'use strict';

import App from "../App";
import {GroupMarketInterface, MarketRunnerInterface, OddInterface} from "../Interface/MarketInterface";
import {CompetitionEnum} from "../Enum/CompetitionEnum";
import PolymarketManager from "../Suppliers/Polymarket/PolymarketManager";
import {OddNameEnum} from "../Enum/MarketEnum";
import {getDerive} from "./Utils";

export default class BetService {
    private static readonly DERIVE_WINDOW_MS = 10_000;
    app: App;
    name: string = "BetService";
    private betQueue: GroupMarketInterface[] = [];
    private isBetting: boolean = false;

    public constructor(app: App) {
        this.app = app;
    }

    async start() {
        setInterval(() => {
            this.bet(this.app.groupMarkets)
        }, 1000)
    }

    async bet(groupMarkets: GroupMarketInterface[]) {
        this.enqueue(groupMarkets.filter(gm =>
            gm.competition === CompetitionEnum.Nba &&
            gm.markets.length > 1
        ));
        if (this.isBetting) return;
        await this.processQueue();
    }

    private enqueue(groupMarkets: GroupMarketInterface[]) {
        const existingIds = new Set(this.betQueue.map(m => m.id));
        const newGroupMarkets = groupMarkets.filter(m => !existingIds.has(m.id));
        for (const newGroupMarket of newGroupMarkets) {
            this.betQueue.push(newGroupMarket);
        }
    }

    private async processQueue() {
        this.isBetting = true;
        while (this.betQueue.length > 0) {
            const batch = this.betQueue.splice(0);
            await this.processBatch(batch);
        }
        this.isBetting = false;
    }

    private async processBatch(groupMarkets: GroupMarketInterface[]): Promise<void> {
        const now = Date.now();
        const oddName = OddNameEnum.PolymarketDerive;
        for (const groupMarket of groupMarkets) {
            const polymarketMarket = groupMarket.markets.find(m => m.supplier === PolymarketManager.name)!;
            for (const marketRunner of polymarketMarket.marketRunners) {
                const polymarketOdds = marketRunner.odds.filter(o =>
                    o.supplier === PolymarketManager.name && o.index === 0
                );
                for (const polymarketOdd of polymarketOdds) {
                    const oddDerivePolymarket = this.getOrCreateDeriveOdd(marketRunner, polymarketOdd, oddName);
                    const deriveValue = getDerive(
                        oddDerivePolymarket.values,
                        now - BetService.DERIVE_WINDOW_MS
                    );
                    const last = oddDerivePolymarket.values.at(-1);
                    if (!last || last.v !== deriveValue) {
                        oddDerivePolymarket.values.push({
                            i: oddDerivePolymarket.values.length + 1,
                            t: now,
                            v: deriveValue,
                        });
                    }
                }
            }
        }
    }

    private getOrCreateDeriveOdd(
        marketRunner: MarketRunnerInterface,
        polymarketOdd: OddInterface,
        oddName: OddNameEnum
    ): OddInterface {
        let odd = marketRunner.odds.find(o =>
            o.name === oddName &&
            o.supplier === polymarketOdd.supplier &&
            o.index === polymarketOdd.index &&
            o.type === polymarketOdd.type
        );

        if (!odd) {
            odd = {
                index: polymarketOdd.index,
                label: `${polymarketOdd.label} derive`,
                name: oddName,
                nbValues: 0,
                supplier: polymarketOdd.supplier,
                type: polymarketOdd.type,
                values: [],
            };
            marketRunner.odds.push(odd);
        }

        return odd;
    }
}
