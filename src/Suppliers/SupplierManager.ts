'use strict';

import {MarketInterface} from "../Interface/MarketInterface";
import App from "../App";
import {MarketStatusEnum} from "../Enum/MarketEnum";
import {diff} from "json-diff";

export abstract class SupplierManager {
    app: App;
    markets: MarketInterface[] = [];

    constructor(app: App) {
        this.app = app;
    }

    addMarket(market: MarketInterface): void {
        this.markets.push(market);
    }

    updateMarket(market: MarketInterface, newMarket: MarketInterface): void {
        const excludeKeys = ['odds', 'marketRunners', 'diffs', 'modificationsOnMarket'];

        const diffMarket = diff(market, newMarket, {excludeKeys});
        if (diffMarket) {
            market.diffs.push({
                time: Date.now(),
                value: diffMarket,
            });

            for (const key in newMarket) {
                if (excludeKeys.includes(key)) continue;
                // @ts-ignore
                market[key] = newMarket[key];
            }
        }
    }

    initMarketRunners(market: MarketInterface) {
        market.marketRunners = market.runners.map(r => {
            return {
                runnerId: r.id,
                odds: [],
            }
        })
    }

    getMarketUrl(market: MarketInterface, encodeUri: boolean = false): string {
        return "";
    }

    marketToString(market: MarketInterface, encodeUri: boolean = false): string {
        return "[" + market.event.competition.sport.name + "-" + market.event.competition.name + "] " + market.event.name + ' ' + this.getMarketUrl(market, encodeUri)
    }

    getMarketIsFinish(market: MarketInterface): boolean {
        return market.inPlay || market.status === MarketStatusEnum.Closed;
    }

    canScrapMarket(market: MarketInterface): boolean {
        const now = Date.now();
        return (
            !this.getMarketIsFinish(market) &&
            (
                (
                    (
                        market.name === 'Match Odds' ||
                        market.name === 'Moneyline'
                    ) &&
                    market.startTime - (2 * 3600 * 1000) < now
                ) ||
                market.totalMatched > 20_000 // totalMatched is not in EUR but rather in a currency 4.5 times higher than EUR
            ) &&
            market.numberOfWinners === 1 &&
            now + (15 * 60 * 1000) < market.startTime &&
            [2, 3].includes(market.runners.length)
        );
    }

    public async removeMarkets(marketIdsToRemove: (string | number)[], time: number) {
        const marketsToRemove = this.markets.filter(m => {
            return marketIdsToRemove.includes(m.id) && !m.isSaving;
        });
        if (marketsToRemove.length === 0) {
            return;
        }
        for (const market of marketsToRemove) {
            // Set `isSaving` to `true` before any asynchronous operations to ensure
            // that other processes calling this function will recognize these markets
            // as already being processed, avoiding concurrent modifications.
            market.isSaving = true;
        }
        for (const market of marketsToRemove) {
            let filePath: string | null = null;
            market.modificationsOnMarket = [];
            market.deleted = time;
            await this.app.mongoService!.saveMarket(market);
            if (process.env.SHOW_LOG_ADD_REMOVE_EVENT === "1") {
                console.info("Market added in Mongo and removed from this.markets", this.marketToString(market));
            }
        }
        this.markets = this.markets.filter(m => !marketIdsToRemove.includes(m.id))
    }
}
