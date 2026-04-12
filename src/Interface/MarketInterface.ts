'use strict';

import {SportEnum} from "../Enum/SportEnum";
import {MarketStatusEnum} from "../Enum/MarketEnum";

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
    event: EventInterface,
    runners: RunnerInterface[];
    odds: OddInterface[];
    marketRunners: MarketRunnerInterface[];
    startRecord: number;
    stopRecord: number | null;
    inPlay: boolean;
    status: MarketStatusEnum | null;
    startTime: number;
    totalMatched: number;
    numberOfWinners: number;
    diffs: DiffMarketInterface[];
}

export interface RunnerInterface {
    id: number | string;
    name: string;
}

export interface MarketRunnerInterface {
    runnerId: RunnerInterface['id'];
    odds: OddInterface[];
}

export interface OddInterface {
    name: string; // BACK, LAY for odd VALUE, Volume for odd volumes
    type: string; // odd value, odd volumes ...
    values: TimeValueInterface[];
    options?: any;
}

export interface TimeValueInterface {
    t: number;
    v: number;
}

export interface OddOddValueInterface extends OddInterface {
    options?: OddOddValueOptionInterface;
}

export interface OddOddValueOptionInterface extends OddInterface {
    index: number;
}