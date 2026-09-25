'use strict';

import DiscordService from "../../Service/DiscordService";
import PolymarketManager from "./PolymarketManager";
import {errorToString, sleep} from "../../Service/Utils";
import {OddNameEnum} from "../../Enum/MarketEnum";
import {
    PolymarketEventInterface,
    PolymarketEventsKeysetInterface,
    PolymarketSportInterface
} from "../../Interface/PolymarketInterface";

export default class ScrapEventTask {
    static readonly retryBaseDelay: number = 2_000;
    static readonly retryMaxDelay: number = 60_000;
    static readonly alertAfterAttempts: number = 5;
    static readonly maxAttempts: number = 10;
    static readonly timeBetweenLoops: number = 5_000;
    static readonly pageSize: number = 100; // max allowed by /events/keyset
    // live events are still returned by gamma for a while after their start (NBA live competition)
    static readonly startTimeMinDelta: number = 6 * 3600 * 1000;
    static readonly startTimeMaxDelta: number = 48 * 3600 * 1000;
    polymarketManager: PolymarketManager;

    public constructor(polymarketManager: PolymarketManager) {
        this.polymarketManager = polymarketManager;
        this.start().catch((e) => {
            const message = `Polymarket ScrapEventTask stopped: ${errorToString(e)}`;
            console.error(message);
            DiscordService.send(message);
        });
    }

    async start() {
        while (this.polymarketManager.running) {
            for (const sport of this.polymarketManager.sports) {
                if (!this.polymarketManager.running) {
                    break;
                }
                try {
                    await this.scrapSport(sport);
                } catch (e) {
                    const message = `Polymarket scrapSport ${sport.enum} error: ${errorToString(e)}`;
                    console.error(message);
                    DiscordService.send(message);
                }
            }
            await sleep(ScrapEventTask.timeBetweenLoops);
        }
    }

    private async scrapSport(sport: PolymarketSportInterface): Promise<void> {
        const now = Date.now();
        const seenMarketIds = new Set<string | number>();
        let cursor: string | null = null;
        let complete = true;
        do {
            const params = new URLSearchParams({
                limit: String(ScrapEventTask.pageSize),
                closed: "false",
                start_time_min: new Date(now - ScrapEventTask.startTimeMinDelta).toISOString(),
                start_time_max: new Date(now + ScrapEventTask.startTimeMaxDelta).toISOString(),
            });
            for (const tagId of sport.tagIds) {
                params.append("tag_id", String(tagId));
            }
            if (cursor) {
                params.set("after_cursor", cursor);
            }
            const result: PolymarketEventsKeysetInterface | null = await this.fetchJsonWithRetry(
                `gamma events/keyset ${sport.enum}`,
                `${PolymarketManager.gammaUrl}/events/keyset?${params.toString()}`,
            );
            if (!result || !Array.isArray(result.events)) {
                complete = false;
                break;
            }
            for (const event of result.events) {
                const marketId = await this.addUpdateMarket(event, sport);
                if (marketId !== null) {
                    seenMarketIds.add(marketId);
                }
            }
            cursor = result.next_cursor || null;
        } while (cursor && this.polymarketManager.running);

        if (complete && this.polymarketManager.running) {
            // events closed or out of the time window are not returned anymore
            const marketIdsToRemove = this.polymarketManager.markets
                .filter(m => m.event.competition.sport.enum === sport.enum && !seenMarketIds.has(m.id))
                .map(m => m.id);
            await this.polymarketManager.removeMarkets(marketIdsToRemove, Date.now());
        }
    }

    private async addUpdateMarket(event: PolymarketEventInterface, sport: PolymarketSportInterface): Promise<string | number | null> {
        if (PolymarketManager.getMoneylineMarkets(event).length === 0) {
            return null;
        }
        if (process.env.MARKET_ID_TO_TEST && event.id !== process.env.MARKET_ID_TO_TEST) {
            return null;
        }
        const newMarket = this.polymarketManager.transformApiMarketToMarket({event, sport});
        let market = this.polymarketManager.markets.find(m => m.id === newMarket.id);
        if (market) {
            this.polymarketManager.updateMarket(market, newMarket);
        } else if (this.polymarketManager.canScrapMarket(newMarket)) {
            this.polymarketManager.addMarket(newMarket);
            market = newMarket;
        } else {
            return null;
        }
        const now = Date.now();
        if (this.polymarketManager.getMarketIsFinish(market)) {
            await this.polymarketManager.removeMarkets([market.id], now);
            return null;
        }
        const oddMarketVolume = this.polymarketManager.getCreateOdd(market.odds, OddNameEnum.MarketVolume, `Market volume [${this.polymarketManager.name}]`, this.polymarketManager.name);
        this.polymarketManager.addOddValue(oddMarketVolume, market.totalMatched, now);
        return market.id;
    }

    /**
     * Fetch a gamma endpoint, rate limited, with exponential backoff.
     * Returns null when maxAttempts is reached (never throws).
     */
    private async fetchJsonWithRetry(label: string, url: string): Promise<any | null> {
        let attempt = 0;
        let lastError = '';
        while (attempt < ScrapEventTask.maxAttempts && this.polymarketManager.running) {
            await PolymarketManager.gammaEventsLimiter.acquire();
            let retryAfter = 0;
            try {
                const response = await fetch(url, {
                    method: "GET",
                    headers: {"content-type": "application/json"},
                });
                if (response.status === 200) {
                    return await response.json();
                }
                if (response.status === 429) {
                    retryAfter = (Number(response.headers.get("retry-after")) || 0) * 1_000;
                }
                lastError = `status ${response.status}`;
            } catch (e) {
                lastError = errorToString(e);
            }
            attempt++;
            if (attempt === ScrapEventTask.alertAfterAttempts) {
                const message = `Polymarket ${label} failed ${attempt} times, last error: ${lastError}`;
                console.error(message);
                DiscordService.send(message);
            }
            await sleep(Math.max(retryAfter, Math.min(ScrapEventTask.retryBaseDelay * 2 ** (attempt - 1), ScrapEventTask.retryMaxDelay)));
        }
        console.error(`Polymarket ${label} giving up after ${attempt} attempts, last error: ${lastError}`);
        return null;
    }
}
