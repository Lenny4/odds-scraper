'use strict';

import {EventInterface, MarketInterface, MarketRunnerInterface, OddInterface, RunnerInterface} from "./MarketInterface";
import {OddNameEnum, OddTypeEnum} from "../Enum/MarketEnum";

export interface LiveMessageInterface {
    type: string;
    value: any;
}

export interface MarketMessageInterface {
    id: string | number;
    name: string | number;
    supplier: string;
    event: EventInterface,
    runners: RunnerInterface[];
    odds: OddInterface[];
    marketRunners: MarketRunnerInterface[];
    startTime: MarketInterface['startTime'];
    endTime: MarketInterface['endTime'];
}


export interface GroupMarketMessageInterface {
    id: number;
    startTime: number;
    markets: MarketMessageInterface[];
}

export interface GroupMarketRequestInterface {
    groupMarketIds: number[] | undefined;
}

export interface OddRequestInterface {
    groupMarketId: number;
    marketId: string | number;
    supplier: string;
    path: string;
    name?: OddNameEnum;
    type?: OddTypeEnum;
    index?: number;
    i?: number;
}

export interface OddReceiveInterface extends OddRequestInterface {
    odds: OddInterface[] | undefined;
}
