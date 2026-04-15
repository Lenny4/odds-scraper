'use strict';

import OrbitxManager from "./OrbitxManager";
import {OddNameEnum, OddTypeEnum} from "../../Enum/MarketEnum";
import WebSocket from "ws";
import {Browser, Page} from "puppeteer";
import {
    MarketInterface,
    MarketRunnerInterface,
    RequestSocketMarketInterface,
    ResponseSocketMarketInterface,
    SocketMarketInterface,
    TypeMappingInterface
} from "../../Interface/MarketInterface";
import DiscordService from "../../Service/DiscordService";
import {BrowserManager} from "../../Service/BrowserManager";
import {diff} from "json-diff";

export default class ScrapSocketTask {
    orbitxManager: OrbitxManager;
    maxNbMarketPerSocket: number = 15; // todo censé être récupéré dans le header [sec-websocket-extensions: permessage-deflate;client_max_window_bits=15], à implémenter dans PuppeteerService.createWebsocket
    ratioMarketPerSocket: number = 2 / 3;
    ratioWaitingSocketMarket: number = 1; // percentage de socketMarkets sans markets (en attente)
    maxWaitingSocketMarket: number = 8;
    waitingSocketMarkets: SocketMarketInterface[] = [];
    id: number = 0;
    isHandlingMarket: boolean = false;
    needHandleMarket: boolean = false;
    readonly timeoutOpenConnectionMessage: number = 1_000;
    private types: TypeMappingInterface[] = [
        {prop: 'bdatb', value: OddTypeEnum.Back},
        {prop: 'bdatl', value: OddTypeEnum.Lay}
    ];


    public constructor(orbitxManager: OrbitxManager) {
        this.orbitxManager = orbitxManager;
        this.start();
    }

    public async start() {
        this.handleMarkets();
        setInterval(() => {
            this.handleMarkets(false, true);
        }, 30 * 1_000)
    }

    public getExpectedNbWaitingSocketMarkets() {
        let r = this.ratioWaitingSocketMarket * this.getExpectedNbSocketMarkets();
        if (r > this.maxWaitingSocketMarket) {
            r = this.maxWaitingSocketMarket;
        }
        return r;
    }

    public getExpectedNbSocketMarkets() {
        return Math.ceil(this.orbitxManager.markets.length / Math.round(this.maxNbMarketPerSocket * this.ratioMarketPerSocket));
    }

    public async handleMarkets(force: boolean = false, isRefreshSocket = false) {
        if (this.isHandlingMarket && !force) {
            if (!isRefreshSocket) {
                this.needHandleMarket = true;
            }
            return;
        }
        this.isHandlingMarket = true;
        this.needHandleMarket = false;
        try {
            await this.createWaitingSocketMarkets();
            await this.createMarketSockets();
        } catch (e: any) {
            const message = "handleMarkets, " + e.toString() + " " + this.getLogSocketMarketsState();
            console.error(message);
            DiscordService.send(message);
        } finally {
            if (this.needHandleMarket) {
                this.handleMarkets(true);
            } else {
                this.isHandlingMarket = false;
            }
        }
    }

    private getLogSocketMarketsState() {
        return JSON.stringify({
            socketMarkets: this.orbitxManager.socketMarkets.map((s) => {
                return {
                    ...s,
                    websocket: s.websocket?.readyState,
                    markets: s.markets.map((m) => {
                        return {
                            id: m.id,
                        }
                    }),
                }
            }),
            waitingSocketMarkets: this.waitingSocketMarkets.map((s) => {
                return {
                    ...s,
                    websocket: s.websocket?.readyState,
                    markets: s.markets.map((m) => {
                        return {
                            id: m.id,
                        }
                    }),
                }
            }),
        });
    }

    private assignMarketsToSocketMarkets(): (string | number)[] {
        const assignedMarkets: (string | number)[] = [];
        for (const socketMarket of this.orbitxManager.socketMarkets) {
            socketMarket.oldMarketIds = socketMarket.markets.map(m => m.id);
            socketMarket.markets = [];
            socketMarket.nbModificationsOnMarkets = 0;
        }
        if (this.orbitxManager.markets.length > 1) {
            this.orbitxManager.markets.sort((a, b) => {
                let r = (b.modificationsOnMarket?.length ?? 0) - (a.modificationsOnMarket?.length ?? 0);
                if (r === 0) {
                    r = a.created - b.created;
                }
                return r;
            });
        }
        this.orbitxManager.removeModificationsOnMarkets(this.orbitxManager.markets);
        for (const market of this.orbitxManager.markets) {
            const socketMarket = this.getBestSocketMarket(market);
            if (socketMarket) {
                assignedMarkets.push(market.id);
                socketMarket.markets.push(market);
                socketMarket.nbModificationsOnMarkets += market.modificationsOnMarket?.length ?? 0;
            } else {
                this.addConnectionToMarkets([market], 'close', 'could not find getBestSocketMarket');
                // if (this.orbitxManager.socketMarkets.find(s => s.markets.length < this.maxNbMarketPerSocket)) {
                //     const message = "getBestSocketMarket socketMarket is undefined " + this.getLogSocketMarketsState();
                //     console.error(message);
                // }
            }
        }
        const socketMarketIdsToRemove: number[] = [];
        for (const socketMarket of this.orbitxManager.socketMarkets) {
            if (socketMarket.markets.length > 0) {
                if (
                    (socketMarket.oldMarketIds ?? []).sort().join(',') !==
                    socketMarket.markets.map(m => m.id).sort().join(',')
                ) {
                    this.sendListeningMarkets(socketMarket, "assignMarketsToSocketMarkets");
                }
            } else if (socketMarket.closing) {
                // const readyState = socketMarket.websocket!.readyState;
                // console.info("[" + socketMarket.id + "] [" + readyState + "]socketMarket.websocket!.close()", socketMarket.websocket!.readyState);
                socketMarket.websocket!.close();
                socketMarketIdsToRemove.push(socketMarket.id);
            }
        }
        this.orbitxManager.socketMarkets = this.orbitxManager.socketMarkets.filter(s => !socketMarketIdsToRemove.includes(s.id));
        return assignedMarkets;
    }

    private sendListeningMarkets(socketMarket: SocketMarketInterface, from: string = "") {
        if (socketMarket.canListen) {
            socketMarket.websocket!.send(JSON.stringify([JSON.stringify(
                socketMarket.markets.map(m => this.marketToRequestSocketMarket(m))
            )]));
            setTimeout(() => {
                if (
                    socketMarket.lastReceivedMessage === undefined ||
                    socketMarket.lastReceivedMessage + this.timeoutOpenConnectionMessage < Date.now()
                ) {
                    this.addConnectionToMarkets(socketMarket.markets, 'close', "No response from server after sendListeningMarkets for " + this.timeoutOpenConnectionMessage + " ms, from: " + from, this.timeoutOpenConnectionMessage);
                    socketMarket.websocket!.close();
                }
            }, this.timeoutOpenConnectionMessage);
        }
    }

    private marketToRequestSocketMarket(market: MarketInterface): RequestSocketMarketInterface {
        return {
            eventId: market.event.id,
            marketId: market.id,
            applicationType: "WEB",
        }
    }

    private addConnectionToMarkets(
        markets: MarketInterface[],
        type: 'open' | 'close',
        message?: string,
        minusTime: number = 0,
    ) {
        const now = Date.now();
        for (const market of markets) {
            if (
                market.connections.length === 0 ||
                market.connections[market.connections.length - 1].type !== type
            ) {
                market.connections.push({
                    time: now - minusTime,
                    type: type,
                    ...(message && {
                        message: message
                    })
                })
            }
        }
    }

    private getBestSocketMarket(market: MarketInterface): SocketMarketInterface | undefined {
        const socketMarkets = this.orbitxManager.socketMarkets.filter(s =>
            s.markets.length < this.maxNbMarketPerSocket &&
            (
                s.websocket!.readyState === WebSocket.CONNECTING ||
                s.websocket!.readyState === WebSocket.OPEN
            )
        );
        if (socketMarkets.length === 0) {
            return undefined;
        }
        return socketMarkets.reduce((a, b) => {
            if (a.closing !== b.closing) {
                if (a.closing) {
                    return b;
                }
                if (b.closing) {
                    return a;
                }
            }
            // region En modifiant les markets via les sockets, cela forcera le serveur Orbitx à recharger les données
            // du market, même si celles-ci n'ont pas changé (s'assurer d'avoir les dernières données)
            if (a.oldMarketIds.includes(market.id) && !b.oldMarketIds.includes(market.id)) {
                return b;
            }
            if (b.oldMarketIds.includes(market.id) && !a.oldMarketIds.includes(market.id)) {
                return a;
            }
            // endregion
            if (a.nbModificationsOnMarkets === b.nbModificationsOnMarkets) {
                return a.markets.length <= b.markets.length ? a : b;
            }
            return a.nbModificationsOnMarkets < b.nbModificationsOnMarkets ? a : b;
        });
    }

    private async createMarketSockets() {
        const expectedNbSocketMarkets = this.getExpectedNbSocketMarkets();
        let alreadyAssigned = false;
        if (this.orbitxManager.socketMarkets.length < expectedNbSocketMarkets) {
            const browser = await BrowserManager.acquire(OrbitxManager.cache);
            for (let i = this.orbitxManager.socketMarkets.length; i < expectedNbSocketMarkets; i++) {
                const newSocketMarket = await this.createNewSocketMarket(browser);
                this.orbitxManager.socketMarkets.push(newSocketMarket);
                this.assignMarketsToSocketMarkets();
                alreadyAssigned = true;
            }
            await BrowserManager.release();
        }
        if (this.orbitxManager.socketMarkets.length > expectedNbSocketMarkets) {
            for (const [index, socketMarket] of this.orbitxManager.socketMarkets.entries()) {
                if (index >= expectedNbSocketMarkets) {
                    socketMarket.closing = true;
                    alreadyAssigned = false;
                }
            }
        }
        if (!alreadyAssigned) {
            this.assignMarketsToSocketMarkets();
        }
    }

    private async createWaitingSocketMarkets() {
        const expectedNbWaitingSocketMarkets = this.getExpectedNbWaitingSocketMarkets();
        this.waitingSocketMarkets = this.waitingSocketMarkets.filter(s =>
            s.websocket === null ||
            s.websocket!.readyState === WebSocket.OPEN ||
            s.websocket!.readyState === WebSocket.CONNECTING
        );
        if (this.getExpectedNbSocketMarkets() === this.orbitxManager.socketMarkets.filter(s => s.canListen).length) { // prioritize socketMarkets
            if (this.waitingSocketMarkets.length < expectedNbWaitingSocketMarkets) {
                const browser = await BrowserManager.acquire(OrbitxManager.cache);
                for (let i = this.waitingSocketMarkets.length; i < expectedNbWaitingSocketMarkets; i++) {
                    const newSocketMarket = await this.createNewSocketMarket(browser);
                    this.waitingSocketMarkets.push(newSocketMarket);
                }
                await BrowserManager.release();
            }
        }
        let nbToDelete = this.waitingSocketMarkets.length - expectedNbWaitingSocketMarkets;
        if (nbToDelete > 0) {
            for (const waitingSocketMarket of this.waitingSocketMarkets.filter(s => s.websocket!.readyState === WebSocket.OPEN)) {
                if (nbToDelete <= 0) {
                    break;
                }
                waitingSocketMarket.websocket!.close();
                nbToDelete--;
            }
        }
    }

    private async createNewSocketMarket(browser: Browser): Promise<SocketMarketInterface> {
        this.id++;
        const newSocketMarket: SocketMarketInterface = {
            id: this.id,
            markets: [],
            oldMarketIds: [],
            open: null,
            websocket: null,
            closing: false,
            nbModificationsOnMarkets: 0,
            canListen: false,
            lastReceivedMessage: undefined,
            pingInterval: null,
        };
        newSocketMarket.websocket = await this.createWebsocketForSocketMarket(browser, newSocketMarket)
        return newSocketMarket;
    }

    private createWebsocket(browser: Browser, socketMarketId: number): Promise<WebSocket> {
        return new Promise(async (resolve) => {
            let done = false;
            let page: Page | null = null;
            let loopCount = 0;
            while (!done) {
                loopCount++;
                if (loopCount === 10) {
                    DiscordService.send("loopCount = " + loopCount + ", socketMarket[" + socketMarketId + "]")
                }
                while (!this.orbitxManager.connectedUntil === null) {
                    await new Promise(resolve2 => setTimeout(resolve2, 1_000));
                }
                // region create page
                if (page !== null) {
                    await page.close();
                }
                let pageCreated = false;
                while (!pageCreated) {
                    try {
                        page = await browser.newPage();
                        pageCreated = true;
                    } catch (e) {
                        await new Promise(resolve2 => setTimeout(resolve2, 1_000));
                    }
                }
                // endregion
                const cdp = await BrowserManager.addCDPSession(page!);
                // region register socket handshake
                cdp!.on('Network.webSocketHandshakeResponseReceived', (event) => {
                    const r: RegExpMatchArray | null | undefined = event.response.requestHeadersText?.match(/wss.*multiple-market-prices.*websocket/);
                    if (Array.isArray(r) && r.length > 0) {
                        if (loopCount >= 10) {
                            DiscordService.send("end loopCount = " + loopCount + ", socketMarket[" + socketMarketId + "]")
                        }
                        done = true;
                        page!.close();
                        resolve(new WebSocket(r[0], {
                            headers: event.response.requestHeaders
                        }));
                    }
                });
                // endregion
                try {
                    await page!.goto(OrbitxManager.url);
                } catch (e: any) {
                    // nothing
                }
                await new Promise(resolve2 => setTimeout(resolve2, OrbitxManager.timeToWaitBeforeWebSocketHandshakeResponseReceived));
            }
        })
    }

    private async createWebsocketForSocketMarket(browser: Browser, socketMarket: SocketMarketInterface): Promise<WebSocket> {
        const websocket = await this.createWebsocket(browser, socketMarket.id);
        websocket.on('open', () => {
            socketMarket.open = Date.now();
        });
        websocket.on('error', (e) => {
            console.error("[" + socketMarket.id + "] websocket on error [" + socketMarket.id + "], try reconnect ...", e);
            if (e.message == "WebSocket was closed before the connection was established") {
                return;
            }
            DiscordService.send(JSON.stringify({
                event: "websocket.on('error'",
                name: e.name,
                message: e.message,
                id: socketMarket.id,
                socketMarketId: socketMarket.id,
            }))
        });
        websocket.on('close', () => { // each time error is called -> close is also call
            socketMarket.canListen = false;
            this.switchOnWaitingSocketMarket(socketMarket);
            this.handleMarkets();
        });
        websocket.on('message', (data: Buffer) => {
            const string = data.toString();
            socketMarket.lastReceivedMessage = Date.now();
            if (string.startsWith('o')) {
                socketMarket.canListen = true;
                this.sendListeningMarkets(socketMarket, "on message");
            } else if (string.startsWith('h')) {
                // C’est un ping ou un heartbeat (h pour “heartbeat” souvent), pour maintenir la connexion WebSocket ouverte.
            } else if (string.startsWith('a')) {
                this.addConnectionToMarkets(socketMarket.markets, 'open');
                this.updateMarket(JSON.parse(JSON.parse(string.substring(1))))
            } else {
                const message = 'Unknown message type websocket: ' + string;
                DiscordService.send(message)
                throw message;
            }
        });
        return websocket;
    }

    private async updateMarket(data: ResponseSocketMarketInterface): Promise<void> {
        const market = this.orbitxManager!.markets.find(m => m.id === data.id);
        if (market === undefined) {
            return;
        }
        const now = Date.now();
        if (data.marketDefinition) {
            let diffRunnersMap = undefined;
            if (market.runnersMap) {
                diffRunnersMap = {
                    runnersMap: {
                        ...market.runnersMap,
                    }
                }
            }
            for (const runner of data.marketDefinition.runners) {
                market.runnersMap[runner.selectionId] = runner.id;
            }
            if (diffRunnersMap) {
                const diffApiRunnersMap = {
                    runnersMap: {
                        ...market.runnersMap,
                    }
                };
                const thisDiff = diff(diffRunnersMap, diffApiRunnersMap);
                if (thisDiff !== undefined) {
                    market!.diffs.push({
                        time: now,
                        value: thisDiff,
                    });
                }
            }
            if (market.status !== data.marketDefinition.status) {
                market.status = this.orbitxManager.getStatus(data.marketDefinition.status);
            }
            if (market.inPlay !== data.marketDefinition.inPlay) {
                market.inPlay = data.marketDefinition.inPlay;
            }
        }
        if (this.orbitxManager!.getMarketIsFinish(market)) {
            await this.orbitxManager!.removeMarkets([market.id], now);
            return;
        }
        market.modificationsOnMarket.push(now);

        const valueMarketVolume = Math.round(Number(data.tv));
        const oddMarketVolume = this.orbitxManager.getCreateOdd(market.odds, OddNameEnum.MarketVolume, `Market volume [${this.orbitxManager.name}]`, this.orbitxManager.name);
        this.orbitxManager.addOddValue(oddMarketVolume, valueMarketVolume, now)
        market.totalMatched = valueMarketVolume;

        if (!data.rc) { // something data.rc is not send by socket
            return;
        }
        for (const rc of data.rc) {
            let marketRunner: MarketRunnerInterface | undefined = undefined;
            if (market.runnersMap.hasOwnProperty(rc.id)) {
                marketRunner = market.marketRunners.find(mr => mr.runnerId === market.runnersMap[rc.id]);
            } else {
                marketRunner = market.marketRunners.find(mr => mr.runnerId === rc.id);
            }
            if (!marketRunner) {
                throw "marketRunner not founded";
            }
            const runner = market.runners.find(r => r.id === marketRunner.runnerId)!
            for (const type of this.types) {
                // @ts-ignore
                for (const bdat: BdatInterface of rc[type.prop]) {
                    const valueOddValue = Math.round(bdat.odds * 1000);
                    const oddLabel = this.orbitxManager.getOddLabel(runner, type.value, bdat.index, this.orbitxManager.name);
                    if (valueOddValue > 1) {
                        const oddRunnerOddValue = this.orbitxManager.getCreateOdd(marketRunner.odds, OddNameEnum.RunnerOddValue, oddLabel, this.orbitxManager.name, type.value, bdat.index);
                        this.orbitxManager.addOddValue(oddRunnerOddValue, valueOddValue, now)
                    }

                    const valueOddVolume = Math.round(bdat.amount);
                    if (valueOddVolume > 0) {
                        const oddRunnerOddVolume = this.orbitxManager.getCreateOdd(marketRunner.odds, OddNameEnum.RunnerOddVolume, oddLabel, this.orbitxManager.name, type.value, bdat.index);
                        this.orbitxManager.addOddValue(oddRunnerOddVolume, valueOddVolume, now)
                    }
                }
            }
        }
    }

    private switchOnWaitingSocketMarket(socketMarket: SocketMarketInterface) {
        if (this.isWaitingSocketMarket(socketMarket)) {
            return;
        }
        this.orbitxManager.socketMarkets = this.orbitxManager.socketMarkets.filter(s => s.id !== socketMarket.id);
        if (socketMarket.markets.length > 0) {
            const replaceSocketMarket = this.waitingSocketMarkets.find(s => s.canListen);
            if (replaceSocketMarket) {
                this.waitingSocketMarkets = this.waitingSocketMarkets.filter(w => w.id !== replaceSocketMarket.id);
                replaceSocketMarket.markets = socketMarket.markets;
                this.orbitxManager.socketMarkets.push(replaceSocketMarket);
                this.sendListeningMarkets(replaceSocketMarket, "switchOnWaitingSocketMarket");
            } else {
                const assignedMarkets = this.assignMarketsToSocketMarkets();
                const notAssignedMarkets = socketMarket.markets.filter(m => !assignedMarkets.includes(m.id));
                if (notAssignedMarkets.length > 0) {
                    // const message = "replaceSocketMarket is undefined, " + this.getLogSocketMarketsState();
                    // console.error(message);
                    // DiscordService.send(message);
                    this.addConnectionToMarkets(notAssignedMarkets, 'close', 'no waitingSocketMarket available');
                }
            }
        }
    }

    private isWaitingSocketMarket(socketMarket: SocketMarketInterface): boolean {
        return this.waitingSocketMarkets.find(w => w.id === socketMarket.id) !== undefined;
    }

}
