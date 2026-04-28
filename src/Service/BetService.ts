'use strict';

import App from "../App";
import {GroupMarketInterface} from "../Interface/MarketInterface";
import {CompetitionEnum} from "../Enum/CompetitionEnum";

export default class BetService {
    app: App;
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
        try {
            while (this.betQueue.length > 0) {
                const batch = this.betQueue.splice(0);
                await this.processBatch(batch);
            }
        } catch (e) {
            throw e;
        } finally {
            this.isBetting = false;
        }
    }

    private async processBatch(groupMarkets: GroupMarketInterface[]) {
        const t = 0;
    }
}
