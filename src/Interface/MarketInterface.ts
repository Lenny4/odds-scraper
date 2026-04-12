'use strict';

import {SportEnum} from "../Enum/SportEnum";
import {MarketStatusEnum, OddNameEnum, OddTypeEnum} from "../Enum/MarketEnum";
import WebSocket from "ws";

export interface SportInterface {
    id: number | string;
    enum: SportEnum;
    name?: string;
}

export interface CompetitionInterface {
    id: number | string;
    name: string;
    sport: SportInterface;
}

export interface EventInterface {
    id: number | string;
    name: string;
    competition: CompetitionInterface;
}

export interface DiffMarketInterface {
    time: number;
    value: any;
}

export interface MarketInterface {
    id: string | number;
    name: string | number;
    supplier: string;
    event: EventInterface,
    runners: RunnerInterface[];
    odds: OddInterface[];
    marketRunners: MarketRunnerInterface[];
    created: number;
    deleted: number | null;
    inPlay: boolean;
    status: MarketStatusEnum | null;
    startTime: number;
    totalMatched: number;
    numberOfWinners: number;
    diffs: DiffMarketInterface[];
    modificationsOnMarket: number[];
    connections: MarketConnectionInterface[];
    runnersMap?: any;
    isSaving: boolean;
}

export interface MarketConnectionInterface {
    type: string;
    time: number;
}

export interface RunnerInterface {
    id: number | string;
    name: string;
}

export interface RequestSocketMarketInterface {
    eventId: string | number,
    marketId: string | number,
    applicationType: string,
}

export interface MarketRunnerInterface {
    runnerId: RunnerInterface['id'];
    odds: OddInterface[];
}

export interface OddInterface {
    name: OddNameEnum; // odd value, odd volumes ...
    type?: OddTypeEnum; // BACK, LAY for odd VALUE, Volume for odd volumes
    nbValues: number;
    values: TimeValueInterface[];
    index?: number;
}

export interface TimeValueInterface {
    i: number;
    t: number;
    v: number;
}

export interface TypeMappingInterface {
    prop: string;
    value: OddTypeEnum;
}

export interface SocketMarketInterface {
    id: number;
    websocket: WebSocket | null;
    open: number | null;
    canListen: boolean;
    closing: boolean;
    markets: MarketInterface[];
    oldMarketIds: (string | number)[];
    nbModificationsOnMarkets: number;
    lastReceivedMessage: number | undefined;
}

export interface MarketDefinitionRunnerInterface {
    id: number,
    selectionId: number | string,
}

export interface MarketDefinitionInterface {
    inPlay: true,
    status: string,
    runners: MarketDefinitionRunnerInterface[],
}

export interface ResponseSocketMarketInterface {
    id: string,
    marketDefinition?: MarketDefinitionInterface,
    rc: RcInterface[],
    tv: string,
    ewlPt: number, // time of the response
}

export interface RcInterface {
    id: number,
    tv: number,
    bdatb: BdatInterface[],
    bdatl: BdatInterface[],
}

export interface BdatInterface {
    index: number,
    odds: number,
    amount: number,
}
