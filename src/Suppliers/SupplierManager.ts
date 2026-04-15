'use strict';

import {
    MarketInterface,
    OddInterface,
    RemoveGroupMarketInterface,
    RunnerInterface,
    SocketMarketInterface
} from "../Interface/MarketInterface";
import App from "../App";
import {MarketStatusEnum, OddNameEnum, OddTypeEnum} from "../Enum/MarketEnum";
import {diff} from "json-diff";

export abstract class SupplierManager {
    app: App;
    markets: MarketInterface[] = [];
    name: string = "";
    socketMarkets: SocketMarketInterface[] = [];

    constructor(app: App) {
        this.app = app;
    }

    _addMarket(market: MarketInterface): void {
        if (process.env.SHOW_LOG_ADD_REMOVE_EVENT === "1") {
            console.info("Add new market " + this.marketToString(market));
        }
        this.markets.push(market);
        const groupMarket = this.app.addGroupMarket(market);
        this.app.liveSocketService.sendGroupMarketsMessage({
            groupMarketIds: [groupMarket.id],
        })
    }

    updateMarket(market: MarketInterface, newMarket: MarketInterface): void {
        const excludeKeys = ['odds', 'marketRunners', 'diffs', 'modificationsOnMarket', 'connections'];

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

    removeModificationsOnMarkets(markets: MarketInterface[]): void {
        const now = Date.now();
        for (const market of this.markets) {
            market.modificationsOnMarket = market.modificationsOnMarket?.filter(n => n > now - App.checkMarketModificationOnLast) ?? [];
        }
    }


    initMarket(market: MarketInterface, supplier: string) {
        market.marketRunners = market.runners.map(r => {
            return {
                runnerId: r.id,
                odds: [],
            }
        });
        market.event.competition.enum = this.app.getCompetitionEnum(market, supplier)
    }

    getMarketUrl(market: MarketInterface, encodeUri: boolean = false): string {
        return "";
    }

    marketToString(market: MarketInterface, encodeUri: boolean = false): string {
        return "[" + market.event.competition.sport.name + "-" + market.event.competition.name + "] " + market.event.name + ' ' + this.getMarketUrl(market, encodeUri)
    }

    getMarketIsFinish(market: MarketInterface): boolean {
        if (market.status === MarketStatusEnum.Closed) {
            return true;
        }
        if (market.event.competition.enum !== null && this.app.liveCompetitions.includes(market.event.competition.enum)) {
            return false;
        }
        return market.inPlay ?? false;
    }

    async _removeMarkets(marketIdsToRemove: (string | number)[], time: number) {
        const marketsToRemove = this.markets.filter(m => {
            return marketIdsToRemove.includes(m.id) && !m.isSaving;
        });
        if (marketsToRemove.length === 0) {
            return;
        }
        const removeGroupMarkets: RemoveGroupMarketInterface[] = [];
        for (const market of marketsToRemove) {
            // Set `isSaving` to `true` before any asynchronous operations to ensure
            // that other processes calling this function will recognize these markets
            // as already being processed, avoiding concurrent modifications.
            market.isSaving = true;
            removeGroupMarkets.push({
                supplier: market.supplier,
                id: market.id,
            })
        }
        for (const market of marketsToRemove) {
            market.modificationsOnMarket = [];
            market.deleted = time;
            await this.app.mongoService!.saveMarket(market);
            if (process.env.SHOW_LOG_ADD_REMOVE_EVENT === "1") {
                console.info("Market added in Mongo and removed from this.markets", this.marketToString(market));
            }
        }
        this.app.removeGroupMarkets(removeGroupMarkets);
        this.markets = this.markets.filter(m => !marketIdsToRemove.includes(m.id));
    }

    getOdd(odds: OddInterface[], name: OddNameEnum, label: string, type: OddTypeEnum | undefined = undefined, index: number | undefined = undefined): OddInterface {
        let odd = odds.find(o => o.name === name && o.type === type && o.index === index);
        if (!odd) {
            odd = {
                type: type,
                label: label,
                name: name,
                nbValues: 0,
                index: index,
                values: [],
            }
            odds.push(odd);
        }
        return odd!;
    }

    getOddLabel(runner: RunnerInterface, type: OddTypeEnum, index: number, supplier: string): string {
        return `${runner.name}[${type}][${index}][${supplier}]`;
    }

    addOddValue(odd: OddInterface, value: number, time: number) {
        if (odd.values.length === 0 || odd.values[odd.values.length - 1].v !== value) {
            odd.values.push({
                i: odd.values.length + 1,
                t: time,
                v: value,
            });
        }
    }

    addMarket(market: MarketInterface): void {
        this._addMarket(market);
    }

    async removeMarkets(ids: (string | number)[], time: number): Promise<void> {
        await this._removeMarkets(ids, time);
    }
}
