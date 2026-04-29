'use strict';

import {SportEnum} from "../Enum/SportEnum";
import {MarketStatusEnum, OddNameEnum, OddTypeEnum} from "../Enum/MarketEnum";
import WebSocket from "ws";
import {CompetitionEnum} from "../Enum/CompetitionEnum";
import {MarketMessageInterface} from "./LiveInterface";

export interface SportInterface {
    id: number | string;
    enum: SportEnum;
    name?: string;
}

export interface CompetitionMappingInterface {
    enum: CompetitionEnum;
    values: {
        id: number | string;
        supplier: string;
    }[]
}

export interface CompetitionInterface {
    id: number | string;
    name: string;
    sport: SportInterface;
    enum: CompetitionEnum | null;
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

export interface MatchingMarketInterface {
    market: MarketInterface,
    score: number;
}

export interface MarketInterface extends MarketMessageInterface {
    id: string | number;
    name: string | number;
    supplier: string;
    event: EventInterface,
    runners: RunnerInterface[];
    odds: OddInterface[];
    marketRunners: MarketRunnerInterface[];
    created: number;
    deleted: number | null;
    inPlayTime: number | null;
    status: MarketStatusEnum | null;
    startTime: number;
    endTime?: number | null;
    totalMatched: number;
    numberOfWinners: number;
    diffs: DiffMarketInterface[];
    modificationsOnMarket: number[];
    connections: MarketConnectionInterface[];
    isSaving: boolean;

    runnersMap?: any;
    clobTokenIds?: string[];
}

export interface MarketConnectionInterface {
    type: string;
    time: number;
    odds: OddNameEnum[];
}

export interface RunnerMatch {
    supplier: string;
    id: number | string;
}

export interface MatchRunnerResult {
    matchings: RunnerMatch[];
}

export interface MatchingRunnerInterface {
    id: RunnerInterface['id'];
    supplier: string;
}

export interface RunnerInterface {
    id: number | string;
    name: string;
    matchings: Record<string, MatchingRunnerInterface>;
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
    supplier: string;
    label: string; // to display on chart
    type?: OddTypeEnum; // BACK, LAY
    index?: number;
    nbValues: number;
    values: TimeValueInterface[];
}

export interface TimeValueInterface {
    i: number;
    t: number;
    v: number;
}

export interface GroupMarketInterface {
    id: number;
    startTime: number;
    competition: CompetitionEnum | null;
    markets: MarketInterface[];
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
    pingInterval: NodeJS.Timeout | null;
    closeTimeout: NodeJS.Timeout | null;
    replaceSocketMarketId?: number;
}

export interface MarketDefinitionRunnerInterface {
    id: number,
    selectionId: number | string,
}

export interface MarketDefinitionInterface {
    inPlay: boolean,
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
