'use strict';

import * as fs from "fs";
import {diff} from "json-diff";
import {SportInterface} from "../../Interface/MarketInterface";
import DiscordService from "../../Service/DiscordService";

const clone = require('clone');

export default class ScrapEventTask {
    running: boolean = false;
    headers: any = null;

    public async start(sports: SportInterface[]) {
        this.running = true;
        let timeoutBetweenPage = 1_000;
        while (this.running) {
            for (const sport of sports) {
                await this.scrapSport(sport.id, timeoutBetweenPage);
            }
            timeoutBetweenPage = 5_000;
        }
    }

    async scrapSport(sportId: number | string, timeoutBetweenPage: number): Promise<void> {
        let page = 0;
        let totalPage = 0;
        const loginTask = this.app.loginTask!;
        do {
            let result: any = null;
            while (result === null) {
                while (loginTask.headers === null || loginTask.connectedUntil === null) {
                    await new Promise(resolve => setTimeout(resolve, 1_000));
                }
                let attempt = 0;
                let lastStatusCode = 0;
                if (attempt === 5) {
                    DiscordService.send(`customer/api/sport/details attempt exceeded lastStatusCode:${lastStatusCode}`)
                }
                try {
                    const body = JSON.stringify({
                        "contextFilter": "EVENT_TYPE",
                        "id": sportId,
                        "timeFilter": "ALL",
                        "viewBy": "TIME",
                    });
                    const headers = {...loginTask.headers};
                    headers.origin = App.orbitxUrl;
                    headers["content-length"] = body.length;
                    headers["content-type"] = "application/json";
                    const response = await fetch(App.orbitxUrl + '/customer/api/sport/details?page=' + page + '&size=20', {
                        method: "POST",
                        headers: headers,
                        body: body
                    });
                    lastStatusCode = response.status;
                    if (lastStatusCode !== 200) {
                        attempt++;
                        await new Promise(resolve => setTimeout(resolve, 2_000));
                    } else {
                        result = await response.json();
                    }
                } catch (e) {
                    attempt++;
                    if (attempt > 5) {
                        console.error("customer/api/sport/details attempt exceeded")
                        throw e;
                    }
                    await new Promise(resolve => setTimeout(resolve, 2_000));
                }
            }
            if (result && result?.marketCatalogueList?.totalPages !== undefined) {
                totalPage = result.marketCatalogueList.totalPages;
                page++;
                if (result?.marketCatalogueList?.content) {
                    for (const apiMarket1 of result.marketCatalogueList.content) {
                        if (process.env.MARKET_ID_TO_TEST && apiMarket1.marketId !== process.env.MARKET_ID_TO_TEST) {
                            continue;
                        }
                        const apiMarkets = await this.getAllMarketForEvent(apiMarket1.event.id);
                        for (const apiMarket2 of apiMarkets) {
                            const newScrapSocketTaskCreated = this.addUpdateMarket(apiMarket2);
                            if (newScrapSocketTaskCreated) {
                                await new Promise(resolve => setTimeout(resolve, App.timeToWaitBeforeWebSocketHandshakeResponseReceived));
                            }
                        }
                    }
                } else {
                    console.error("error customer/api/sport/details", result);
                    DiscordService.send("error customer/api/sport/details" + JSON.stringify(result));
                }
            }
            await this.app.saveFileTask?.saveMarketsJson();
            await new Promise(resolve => setTimeout(resolve, timeoutBetweenPage)); // to prevent spam
        } while (page < totalPage && this.app.running);
    }

    private addUpdateMarket(apiMarket: any): boolean {
        let newScrapSocketTaskCreated = false;
        let market = this.app.markets.find(m => m.marketId === apiMarket.marketId);
        if (!(this.app.canScrapMarket(apiMarket) || market)) {
            return false;
        }
        const now = Date.now();
        const marketDataCreation: any = {
            totalMatched: null, // apiMarket.totalMatched is not the real totalMatched
            needToSave: true,
            created: now,
            deletedAt: null,
            connections: [],
            runnersMap: {},
            registrationDuration: null,
            inPlayDate: null,
            diff: [],
            isSaving: false,
        }
        if (!market) {
            const thisMarketMappingJson = this.app.saveFileTask?.marketMappingJson.find(m => m.marketId === apiMarket.marketId);
            if (thisMarketMappingJson) {
                market = JSON.parse(fs.readFileSync(thisMarketMappingJson.filePath).toString());
                market = {
                    ...marketDataCreation,
                    ...market,
                }
                if (process.env.SHOW_LOG_ADD_REMOVE_EVENT === "1") {
                    console.info("Add JSON market " + App.marketToString(market!));
                }
                this.app.addMarket(market!);
            }
        }
        if (market) {
            const diffMarket = clone(market);
            const diffApiMarket = clone(apiMarket);
            const keysNotFromOrbitx = Object.keys(diffMarket).filter(item => !Object.keys(diffApiMarket).includes(item));
            for (const key of [
                ...keysNotFromOrbitx,
                "totalMatched",
                "marketStartTime",
                "description.marketTime",
                "description.suspendTime",
                "event.openDate",
                "competition.regionNameTranslations",
                "event.nameTranslations",
                "event.homeTeamTranslations",
                "event.awayTeamTranslations",
                "regionTranslations",
            ]) {
                const path = key.split(".");
                deleteProp(diffMarket, [...path])
                deleteProp(diffApiMarket, [...path])
            }
            const thisDiff = diff(diffMarket, diffApiMarket);
            for (const key in apiMarket) {
                if ([
                    "totalMatched", // is saved with ScrapSocketTask
                ].includes(key)) {
                    continue;
                }
                // @ts-ignore
                market[key] = apiMarket[key];
            }
            if (thisDiff !== undefined) {
                market!.diff.push({
                    time: now,
                    diff: thisDiff,
                });
                market!.needToSave = true;
            }
        } else if (!this.app.getMarketIsOver(apiMarket)) {
            const newMarket: MarketInterface = {
                ...apiMarket,
                ...marketDataCreation,
            };
            if (process.env.SHOW_LOG_ADD_REMOVE_EVENT === "1") {
                console.info("Add new market " + App.marketToString(newMarket));
            }
            this.app.addMarket(newMarket);
        }
        return newScrapSocketTaskCreated;
    }

    private async getAllMarketForEvent(eventId: string): Promise<any[]> {
        const loginTask = this.app.loginTask!;
        let result: any[] | null = null;
        while (result === null) {
            while (loginTask.headers === null || loginTask.connectedUntil === null) {
                await new Promise(resolve => setTimeout(resolve, 1_000));
            }
            let attempt = 0;
            try {
                const headers = {...loginTask.headers};
                headers.origin = App.orbitxUrl;
                headers["content-type"] = "application/json";
                const response = await fetch(App.orbitxUrl + '/customer/api/event/details/' + eventId, {
                    method: "GET",
                    headers: headers,
                });
                if (response.status === 200) {
                    result = (await response.json()).marketCatalogues;
                }
            } catch (e) {
                attempt++;
                if (attempt > 5) {
                    console.error("customer/api/event/details attempt exceeded")
                    throw e;
                }
                await new Promise(resolve => setTimeout(resolve, 2_000));
            }
        }
        return result;
    }
}
