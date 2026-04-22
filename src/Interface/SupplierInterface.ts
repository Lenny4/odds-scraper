'use strict';

import {MarketInterface, OddInterface, SocketMarketInterface} from "./MarketInterface";
import App from "../App";
import {MarketStatusEnum, OddNameEnum, OddTypeEnum} from "../Enum/MarketEnum";

export interface SupplierInterface {
    app: App;
    name: string;
    markets: MarketInterface[];
    running: boolean;
    socketMarkets: SocketMarketInterface[];

    start(): Promise<void>;

    stop(): Promise<void>;

    canScrapMarket(apiMarket: any): boolean;

    marketToString(market: MarketInterface, encodeUri: boolean): string;

    getMarketIsFinish(market: MarketInterface): boolean;

    getMarketUrl(market: MarketInterface, encodeUri: boolean): string | null;

    transformApiMarketToMarket(apiMarket: any): MarketInterface;

    addMarket(market: MarketInterface): void;

    getStatus(status: string): MarketStatusEnum | null;

    removeMarkets(ids: (string | number)[], time: number): Promise<void>;

    getCreateOdd(odds: OddInterface[], name: OddNameEnum, label: string, supplier: string, type: OddTypeEnum | undefined, index: number | undefined): OddInterface;

    addOddValue(odd: OddInterface, value: number, time: number): void;
}
