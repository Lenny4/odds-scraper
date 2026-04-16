'use strict';

import DiscordService from "../../Service/DiscordService";
import OrbitxManager from "./OrbitxManager";
import {BrowserManager} from "../../Service/BrowserManager";
import {HTTPResponse, Page} from "puppeteer";

export default class ScrapEventTask {
    orbitxManager: OrbitxManager;
    private isLoginIn: boolean = false;
    private formSelectorOrbitx = 'form.biab_login-form';
    private S_usernameOrbitx = this.formSelectorOrbitx + ' [placeholder="Username"]';
    private S_passwordOrbitx = this.formSelectorOrbitx + ' [placeholder="Password"]';
    private S_loginSubmitOrbitx = this.formSelectorOrbitx + ' [type="submit"]';
    private S_afterLoggingModalOrbitx = [
        '.biab_btn-continue',
        '.biab_tertiary-btn',
    ];
    private S_isLoginOrbitx = '#biab_login-block p.biab_username';
    private S_pageLoadedOrbitx = '#biab_login-block';
    private S_logoutModalOrbitx = '#biab_modal button[data-dismiss="modal"]';

    public constructor(orbitxManager: OrbitxManager) {
        this.orbitxManager = orbitxManager;
        this.start();
    }


    async start() {
        let timeoutBetweenPage = 1_000;
        while (this.orbitxManager.running) {
            for (const sport of this.orbitxManager.sports) {
                await this.scrapSport(sport.id, timeoutBetweenPage);
            }
            timeoutBetweenPage = 5_000;
        }
    }

    private async pageIsLoaded(page: Page): Promise<boolean> {
        if (page.url() === "about:blank") {
            return false;
        }
        return await page.evaluate((S_pageLoadedOrbitx: string) => {
            return new Promise<boolean>(resolve => {
                let currentWait = 0;
                const waitInterval = 100;
                const maxWait = 20_000;

                const interval = setInterval(() => {
                    const domElement = document.querySelector(S_pageLoadedOrbitx);
                    const isLoaded = domElement !== null && (domElement as HTMLElement).clientHeight !== 0;

                    if (isLoaded || currentWait > maxWait) {
                        clearInterval(interval);
                        resolve(isLoaded);
                    }

                    currentWait += waitInterval;
                }, waitInterval);
            });
        }, this.S_pageLoadedOrbitx);
    }

    private async closeModal(page: Page): Promise<void> {
        try {
            for (const selector of this.S_afterLoggingModalOrbitx) {
                await page.waitForSelector(selector, {
                    timeout: 2000,
                });
                if (await page.$(selector) !== null) {
                    await page.evaluate((selector: string) => {
                        const closeModalOrbitxButton: any = document.querySelector(selector);
                        closeModalOrbitxButton.click();
                    }, selector);
                }
            }
        } catch (e) {
            // nothing
        }
        try {
            await page.waitForSelector(this.S_logoutModalOrbitx, {
                timeout: 1000,
            });
            await page.click(this.S_logoutModalOrbitx);
        } catch (e) {
            // nothing
        }
    };

    private async isConnected(page: Page): Promise<boolean> {
        const timeout = 20_000;
        try {
            return await Promise.race([
                page.waitForSelector(this.S_isLoginOrbitx, {timeout}).then(() => true),
                page.waitForSelector(this.S_usernameOrbitx, {timeout}).then(() => false),
            ]);
        } catch {
            return false;
        }
    }

    private needToLoginAgain() {
        return (
            this.orbitxManager.headers === null ||
            this.orbitxManager.connectedUntil === null ||
            (this.orbitxManager.connectedUntil * 1_000) - Date.now() <= OrbitxManager.reconnectRemainingTime
        )
    }

    private async logOut(page: Page): Promise<void> {
        await new Promise(resolve => setTimeout(resolve, 1_000));
        try {
            await (await page.waitForSelector("xpath///button[contains(., 'Account')]", {
                timeout: 1_000
            }))?.click();
            await (await page.waitForSelector("xpath///button[contains(., 'Log Out')]", {
                timeout: 1_000
            }))?.click();
        } catch (e: any) {
            // nothing
        }
    }

    private async login(): Promise<void> {
        if (this.isLoginIn) {
            return;
        }
        this.isLoginIn = true;
        let pageLogIn: Page | null = null;
        while (this.needToLoginAgain()) {
            try {
                const browser = await BrowserManager.acquire(OrbitxManager.cache);
                pageLogIn = await browser.newPage();
                this.addListeningHeaders(pageLogIn);
                let isConnected = false;
                const errorsMessages: string[] = [];
                let globalCounter = 0;
                while (!isConnected) {
                    globalCounter++;
                    if (globalCounter === 5) {
                        const message = "Orbitx globalCounter 5 times !";
                        console.error(message);
                        DiscordService.send(message);
                    }
                    while (!(await this.pageIsLoaded(pageLogIn))) {
                        try {
                            if (pageLogIn.url() !== "about:blank") {
                                await pageLogIn.goto("about:blank");
                            }
                            await pageLogIn.goto(OrbitxManager.url);
                            await this.closeModal(pageLogIn);
                        } catch (e) {
                            // nothing (probably blank page again)
                        }
                    }
                    let counter = 0;
                    while ((isConnected = await this.isConnected(pageLogIn)) && this.needToLoginAgain()) {
                        counter++;
                        await this.logOut(pageLogIn);
                        await this.pageIsLoaded(pageLogIn);
                        await this.closeModal(pageLogIn);
                        if (counter === 5) {
                            const message = "Orbitx login error, try to log out 5 times, then reload page ...";
                            console.error(message);
                            DiscordService.send(message);
                        }
                    }
                    if (isConnected) {
                        continue;
                    }
                    try {
                        await pageLogIn.waitForSelector(this.S_usernameOrbitx, {
                            timeout: 10_000,
                        });
                        await pageLogIn.type(this.S_usernameOrbitx, process.env.ORBITX_USERNAME ?? '');
                        await pageLogIn.waitForSelector(this.S_passwordOrbitx);
                        await pageLogIn.type(this.S_passwordOrbitx, process.env.ORBITX_PASSWORD ?? '');
                        await pageLogIn.waitForSelector(this.S_loginSubmitOrbitx);
                        await pageLogIn.evaluate((S_loginSubmitOrbitx: string) => {
                            let submitButton: any = document.querySelector(S_loginSubmitOrbitx);
                            submitButton?.click();
                        }, this.S_loginSubmitOrbitx);
                        await this.pageIsLoaded(pageLogIn);
                        await this.closeModal(pageLogIn);
                        // todo why Login form connected ! is displayed 3 times in prod
                        console.info("Login form connected Orbitx !");
                    } catch (e: any) {
                        if (!errorsMessages.includes(e.toString())) {
                            errorsMessages.push(e.toString());
                            console.error(e);
                        }
                    }
                    isConnected = await this.isConnected(pageLogIn);
                    if (isConnected) {
                        console.log("login Orbitx isConnected !")
                    }
                }
                let connectedUntilCounter = 0;
                while (this.orbitxManager.connectedUntil === null) {
                    await new Promise(resolve2 => setTimeout(resolve2, 1_000));
                    connectedUntilCounter++;
                    if (connectedUntilCounter === 20) {
                        const message = "Orbitx connectedUntilCounter 20 times !";
                        console.error(message);
                        DiscordService.send(message);
                    }
                }
            } catch (e) {
                console.error(e);
            } finally {
                try {
                    await pageLogIn?.close();
                } catch (e) {
                    // nothing
                }
                pageLogIn = null;
                await BrowserManager.release();
            }
        }
        this.isLoginIn = false;
    }

    private addListeningHeaders(page: Page) {
        page.on('response', async (response: HTTPResponse) => {
            const status = response.status();
            if (status === 200) {
                const headers = response.request().headers();
                if (headers.hasOwnProperty("X-Csrf-Token".toLowerCase())) {
                    const cookies = await page.cookies();
                    const BIAB_CUSTOMER = cookies.find(c => c.name === 'BIAB_CUSTOMER')?.value;
                    if (!BIAB_CUSTOMER) {
                        return;
                    }
                    headers.cookie = cookies
                        .map(c => `${c.name}=${c.value}`)
                        .join('; ');
                    try {
                        const token = atob(BIAB_CUSTOMER);
                        const base64Url = token.split('.')[1];
                        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
                        const jsonPayload = decodeURIComponent(atob(base64).split('').map(function (c) {
                            return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
                        }).join(''));
                        this.orbitxManager.connectedUntil = JSON.parse(jsonPayload).exp;
                        this.orbitxManager.headers = headers;
                    } catch (e) {
                        // nothing
                    }
                }
            } else if (status === 405) {
                await this.login();
            }
        })
    }

    private async scrapSport(sportId: number | string, timeoutBetweenPage: number): Promise<void> {
        let page = 0;
        let totalPage = 0;
        do {
            let result: any = null;
            while (result === null) {
                await this.login();
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
                    const response = await fetch(OrbitxManager.url + '/customer/api/sport/details?page=' + page + '&size=20', {
                        method: "POST",
                        headers: {
                            ...this.orbitxManager.headers,
                            origin: OrbitxManager.url,
                            "content-length": body.length,
                            "content-type": "application/json",
                        },
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
                            this.addUpdateMarket(apiMarket2);
                        }
                    }
                } else {
                    console.error("error customer/api/sport/details", result);
                    DiscordService.send("error customer/api/sport/details" + JSON.stringify(result));
                }
            }
            await new Promise(resolve => setTimeout(resolve, timeoutBetweenPage)); // to prevent spam
        } while (page < totalPage && this.orbitxManager.running);
    }

    private addUpdateMarket(apiMarket: any) {
        const newMarket = this.orbitxManager.transformApiMarketToMarket(apiMarket);
        let market = this.orbitxManager.markets.find(m => m.id === newMarket.id);
        if (market) {
            this.orbitxManager.updateMarket(market, newMarket);
        } else if (this.orbitxManager.canScrapMarket(newMarket)) {
            this.orbitxManager.addMarket(newMarket);
        }
    }

    private async getAllMarketForEvent(eventId: string): Promise<any[]> {
        let result: any[] | null = null;
        while (result === null) {
            await this.login();
            let attempt = 0;
            try {
                const response = await fetch(OrbitxManager.url + '/customer/api/event/details/' + eventId, {
                    method: "GET",
                    headers: {
                        ...this.orbitxManager.headers,
                        origin: OrbitxManager.url,
                        "content-type": "application/json",
                    },
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
