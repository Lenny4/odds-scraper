import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import App from "../App";
import OrbitxManager from "../Suppliers/Orbitx/OrbitxManager";
import PolymarketManager from "../Suppliers/Polymarket/PolymarketManager";
import ScrapSocketTask from "../Suppliers/Polymarket/ScrapSocketTask";
import {PolymarketEventInterface, PolymarketMarketInterface} from "../Interface/PolymarketInterface";
import {SocketMarketInterface} from "../Interface/MarketInterface";
import {OddNameEnum, OddTypeEnum} from "../Enum/MarketEnum";
import {RateLimiter} from "../Service/RateLimiter";
import {SportEnum} from "../Enum/SportEnum";

const HOUR = 3600 * 1000;

let id = 0;

function polymarketMarket(outcomes: string[], overrides: Partial<PolymarketMarketInterface> = {}): PolymarketMarketInterface {
    id++;
    return {
        id: `m${id}`,
        question: `question ${id}`,
        sportsMarketType: "moneyline",
        outcomes: JSON.stringify(outcomes),
        clobTokenIds: JSON.stringify(outcomes.map((_, i) => `t${id}-${i}`)),
        active: true,
        closed: false,
        acceptingOrders: true,
        volumeNum: 100,
        ...overrides,
    };
}

function polymarketEvent(markets: PolymarketMarketInterface[], startIn: number): PolymarketEventInterface {
    id++;
    return {
        id: `e${id}`,
        slug: `event-${id}`,
        title: `event ${id}`,
        startTime: new Date(Date.now() + startIn).toISOString(),
        closed: false,
        series: [{id: "10188", slug: "epl", title: "Premier League"}],
        markets: markets,
    };
}

function soccerEvent(home: string, away: string, startIn: number): PolymarketEventInterface {
    return polymarketEvent([
        polymarketMarket(["Yes", "No"], {groupItemTitle: home}),
        polymarketMarket(["Yes", "No"], {groupItemTitle: `Draw (${home} vs. ${away})`}),
        polymarketMarket(["Yes", "No"], {groupItemTitle: away}),
        polymarketMarket(["Over", "Under"], {sportsMarketType: "totals"}),
    ], startIn);
}

describe("PolymarketManager", () => {
    let app: App;
    let polymarket: PolymarketManager;

    beforeEach(() => {
        app = new App();
        polymarket = new PolymarketManager(app);
        app.supplierManagers.push(polymarket);
        vi.spyOn(app.liveSocketService, "sendGroupMarketsMessage").mockImplementation(() => undefined);
    });

    describe("transformApiMarketToMarket", () => {
        it("uses the outcomes as runners for a two outcomes moneyline", () => {
            const event = polymarketEvent([
                polymarketMarket(["Jannik Sinner", "Carlos Alcaraz"]),
                polymarketMarket(["Over", "Under"], {sportsMarketType: "tennis_set_totals"}),
            ], HOUR);
            const market = polymarket.transformApiMarketToMarket({event, sport: polymarket.sports[1]});

            expect(market.id).toBe(event.id);
            expect(market.name).toBe("moneyline");
            expect(market.runners.map(r => r.name)).toEqual(["Jannik Sinner", "Carlos Alcaraz"]);
            expect(market.clobTokenIds).toEqual(JSON.parse(event.markets[0].clobTokenIds!));
            expect(market.event.competition.id).toBe("10188");
            expect(market.event.competition.sport.enum).toBe(SportEnum.Tennis);
            expect(market.marketRunners).toHaveLength(2);
            expect(polymarket.canScrapMarket(market)).toBe(true);
        });

        it("merges the Yes/No moneylines of a soccer event into one 3 runners market", () => {
            const event = soccerEvent("Arsenal", "Chelsea", HOUR);
            const market = polymarket.transformApiMarketToMarket({event, sport: polymarket.sports[0]});

            expect(market.runners.map(r => r.name)).toEqual(["Arsenal", PolymarketManager.drawRunnerName, "Chelsea"]);
            // runner = "Yes" token of each market
            expect(market.runners.map(r => r.id)).toEqual(event.markets.slice(0, 3).map(m => JSON.parse(m.clobTokenIds!)[0]));
            expect(market.totalMatched).toBe(300);
            expect(polymarket.canScrapMarket(market)).toBe(true);
        });

        it("ignores an event without usable moneyline", () => {
            const event = polymarketEvent([polymarketMarket(["Yes", "No"], {groupItemTitle: "Arsenal"})], HOUR);
            expect(PolymarketManager.getMoneylineMarkets(event)).toHaveLength(0);
        });

        it("marks a started event as in play", () => {
            const market = polymarket.transformApiMarketToMarket({
                event: polymarketEvent([polymarketMarket(["A", "B"])], -HOUR),
                sport: polymarket.sports[1],
            });
            expect(market.inPlayTime).toBe(market.startTime);
            expect(polymarket.getMarketIsFinish(market)).toBe(true);
        });
    });

    it("groups a soccer market with the Orbitx match odds", () => {
        const orbitx = app.supplierManagers[0] as OrbitxManager;
        const orbitxMarket = orbitx.transformApiMarketToMarket({
            event: {id: "e-orbitx", name: "Arsenal v Chelsea"},
            competition: {id: "c1", name: "Premier League"},
            eventType: {id: "1", name: "Soccer"},
            marketId: "1.1",
            marketName: "Match Odds",
            numberOfWinners: 1,
            runners: [
                {selectionId: 1, runnerName: "Chelsea"},
                {selectionId: 2, runnerName: "Arsenal"},
                {selectionId: 3, runnerName: "The Draw"},
            ],
            marketStartTime: new Date(Date.now() + HOUR).toISOString(),
            totalMatched: 0,
        });
        orbitx.addMarket(orbitxMarket);

        const polyMarket = polymarket.transformApiMarketToMarket({event: soccerEvent("Arsenal", "Chelsea", HOUR), sport: polymarket.sports[0]});
        polymarket.addMarket(polyMarket);

        expect(app.groupMarkets).toHaveLength(1);
        expect(app.getGroupMarket(polyMarket.id, polymarket.name)).toBe(app.getGroupMarket(orbitxMarket.id, orbitx.name));
        expect(orbitxMarket.runners[0].matchings[polymarket.name].id).toBe(polyMarket.runners[2].id);
        expect(orbitxMarket.runners[2].matchings[polymarket.name].id).toBe(polyMarket.runners[1].id);
    });

    describe("ScrapSocketTask", () => {
        let task: ScrapSocketTask;

        beforeEach(() => {
            task = new ScrapSocketTask(polymarket);
            vi.spyOn(app, "afterUpdateMarkets").mockImplementation(() => undefined);
        });

        afterEach(() => task.stop());

        it("stores the best levels of the book and applies price changes", () => {
            const market = polymarket.transformApiMarketToMarket({
                event: polymarketEvent([polymarketMarket(["A", "B"])], HOUR),
                sport: polymarket.sports[1],
            });
            polymarket.markets.push(market);
            const tokenId = String(market.runners[0].id);
            const socketMarket = {markets: [market], connections: []} as unknown as SocketMarketInterface;

            task.handleMessage(socketMarket, JSON.stringify([{
                event_type: "book",
                asset_id: tokenId,
                bids: [{price: "0.38", size: "100"}, {price: "0.40", size: "50"}],
                asks: [{price: "0.45", size: "20"}, {price: "0.42", size: "200"}],
            }]));

            const odds = market.marketRunners[0].odds;
            const value = (type: OddTypeEnum, index: number) =>
                odds.find(o => o.name === OddNameEnum.RunnerOddValue && o.type === type && o.index === index)?.values.at(-1)?.v;
            expect(value(OddTypeEnum.Back, 0)).toBe(Math.round(1000 / 0.42));
            expect(value(OddTypeEnum.Back, 1)).toBe(Math.round(1000 / 0.45));
            expect(value(OddTypeEnum.Lay, 0)).toBe(Math.round(1000 / 0.40));
            expect(market.connections.at(-1)?.type).toBe('open');

            task.handleMessage(socketMarket, JSON.stringify({
                event_type: "price_change",
                price_changes: [
                    {asset_id: tokenId, price: "0.42", size: "0", side: "SELL"},
                    {asset_id: tokenId, price: "0.41", size: "10", side: "BUY"},
                ],
            }));
            expect(value(OddTypeEnum.Back, 0)).toBe(Math.round(1000 / 0.45));
            expect(value(OddTypeEnum.Lay, 0)).toBe(Math.round(1000 / 0.41));
            expect(app.afterUpdateMarkets).toHaveBeenCalledTimes(2);
        });
    });
});

describe("RateLimiter", () => {
    afterEach(() => vi.useRealTimers());

    it("waits for the end of the window once the limit is reached", async () => {
        vi.useFakeTimers();
        const limiter = new RateLimiter(2, 10_000);
        await limiter.acquire();
        await limiter.acquire();
        let resolved = false;
        const third = limiter.acquire().then(() => resolved = true);

        await vi.advanceTimersByTimeAsync(9_000);
        expect(resolved).toBe(false);
        await vi.advanceTimersByTimeAsync(1_000);
        await third;
        expect(resolved).toBe(true);
    });
});
