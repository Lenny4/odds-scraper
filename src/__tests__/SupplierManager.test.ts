import {beforeEach, describe, expect, it, vi} from "vitest";
import App from "../App";
import OrbitxManager from "../Suppliers/Orbitx/OrbitxManager";
import PolymarketManager from "../Suppliers/Polymarket/PolymarketManager";
import {MarketInterface} from "../Interface/MarketInterface";

const HOUR = 3600 * 1000;

let marketId = 0;

function apiMarket(runnerNames: string[], startIn: number, overrides: Record<string, any> = {}) {
    marketId++;
    return {
        event: {id: "e" + marketId, name: runnerNames.join(" v ")},
        competition: {id: "c1", name: "Competition"},
        eventType: {id: "1", name: "Soccer"},
        marketId: "1." + marketId,
        marketName: "Match Odds",
        numberOfWinners: 1,
        runners: runnerNames.map((name, i) => ({selectionId: marketId * 10 + i, runnerName: name})),
        marketStartTime: new Date(Date.now() + startIn).toISOString(),
        totalMatched: 0,
        ...overrides,
    };
}

describe("SupplierManager", () => {
    let app: App;
    let orbitx: OrbitxManager;

    beforeEach(() => {
        // the constructors don't open any connection, only start() does
        app = new App();
        orbitx = app.supplierManagers[0] as OrbitxManager;
        vi.spyOn(app.liveSocketService, "sendGroupMarketsMessage").mockImplementation(() => undefined);
    });

    describe("canScrapMarket", () => {
        it("accepts a match odds market starting within 2 hours", () => {
            const market = orbitx.transformApiMarketToMarket(apiMarket(["A", "B", "The Draw"], HOUR));
            expect(orbitx.canScrapMarket(market)).toBe(true);
        });

        it("rejects a market starting in less than 15 minutes", () => {
            const market = orbitx.transformApiMarketToMarket(apiMarket(["A", "B"], 5 * 60_000));
            expect(orbitx.canScrapMarket(market)).toBe(false);
        });

        it("rejects a low volume market starting in more than 2 hours", () => {
            const market = orbitx.transformApiMarketToMarket(apiMarket(["A", "B"], 5 * HOUR));
            expect(orbitx.canScrapMarket(market)).toBe(false);
        });

        it("accepts a high volume market starting in more than 2 hours", () => {
            const market = orbitx.transformApiMarketToMarket(apiMarket(["A", "B"], 5 * HOUR, {totalMatched: 50_000}));
            expect(orbitx.canScrapMarket(market)).toBe(true);
        });

        it("rejects markets with more than 3 runners", () => {
            const market = orbitx.transformApiMarketToMarket(apiMarket(["A", "B", "C", "D"], HOUR));
            expect(orbitx.canScrapMarket(market)).toBe(false);
        });
    });

    describe("groupMarkets", () => {
        it("groups markets of different suppliers with the same runners in another order", () => {
            const polymarket = new PolymarketManager(app);
            app.supplierManagers.push(polymarket);

            const orbitxMarket = orbitx.transformApiMarketToMarket(apiMarket(["Los Angeles Lakers", "Boston Celtics"], HOUR));
            orbitx.addMarket(orbitxMarket);

            const polyMarket: MarketInterface = {
                ...orbitx.transformApiMarketToMarket(apiMarket(["Boston Celtics", "Los Angeles Lakers"], HOUR + 10 * 60_000)),
                supplier: polymarket.name,
            };
            polyMarket.runners = polyMarket.runners.map(r => ({...r, matchings: {}}));
            polymarket.addMarket(polyMarket);

            const groupMarket = app.getGroupMarket(orbitxMarket.id, orbitx.name)!;
            expect(app.groupMarkets).toHaveLength(1);
            expect(app.getGroupMarket(polyMarket.id, polymarket.name)).toBe(groupMarket);
            // runners are matched by name, not by position
            const lakers = orbitxMarket.runners[0];
            expect(lakers.matchings[polymarket.name].id).toBe(polyMarket.runners[1].id);
        });

        it("does not group markets starting more than 1 hour apart", () => {
            const polymarket = new PolymarketManager(app);
            app.supplierManagers.push(polymarket);
            orbitx.addMarket(orbitx.transformApiMarketToMarket(apiMarket(["Lakers", "Celtics"], HOUR)));
            polymarket.addMarket({
                ...orbitx.transformApiMarketToMarket(apiMarket(["Lakers", "Celtics"], 3 * HOUR)),
                supplier: polymarket.name,
            });
            expect(app.groupMarkets).toHaveLength(2);
        });
    });

    describe("removeMarkets", () => {
        it("removes the market once saved", async () => {
            const save = vi.spyOn(app.mongoService, "saveGroupMarket").mockResolvedValue(true);
            const market = orbitx.transformApiMarketToMarket(apiMarket(["A", "B"], HOUR));
            orbitx.addMarket(market);

            await orbitx.removeMarkets([market.id], Date.now());

            expect(save).toHaveBeenCalledTimes(1);
            expect(orbitx.markets).toHaveLength(0);
            expect(app.groupMarkets).toHaveLength(0);
            expect(app.getGroupMarket(market.id, orbitx.name)).toBeUndefined();
        });

        it("keeps the market in memory when the save fails, and retries later", async () => {
            const save = vi.spyOn(app.mongoService, "saveGroupMarket").mockResolvedValue(false);
            const market = orbitx.transformApiMarketToMarket(apiMarket(["A", "B"], HOUR));
            orbitx.addMarket(market);

            await orbitx.removeMarkets([market.id], Date.now());

            expect(orbitx.markets).toHaveLength(1);
            expect(market.isSaving).toBe(false);

            save.mockResolvedValue(true);
            await orbitx.removeMarkets([market.id], Date.now());
            expect(save).toHaveBeenCalledTimes(2);
            expect(orbitx.markets).toHaveLength(0);
        });

        it("does not save when save=false", async () => {
            const save = vi.spyOn(app.mongoService, "saveGroupMarket");
            const market = orbitx.transformApiMarketToMarket(apiMarket(["A", "B"], HOUR));
            orbitx.addMarket(market);

            await orbitx.removeMarkets([market.id], Date.now(), false);

            expect(save).not.toHaveBeenCalled();
            expect(orbitx.markets).toHaveLength(0);
        });
    });
});
