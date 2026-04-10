'use strict';

import {MarketInterface} from "../Interface/MarketInterface";
import App from "../App";
import {MarketStatusEnum} from "../Enum/MarketEnum";

export abstract class SupplierManager {
    app: App;
    markets: MarketInterface[] = [];

    constructor(app: App) {
        this.app = app;
    }

    addMarket(market: MarketInterface): void {
        this.markets.push(market);
    }

    initMarketRunners(market: MarketInterface) {
        market.marketRunners = market.runners.map(r => {
            return {
                runnerId: r.id,
                quotation: [],
            }
        })
    }

    getMarketUrl(market: MarketInterface, encodeUri: boolean = false): string | null {
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
}
