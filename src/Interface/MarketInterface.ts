'use strict';

export interface SportInterface {
    id: number | string;
    name: string;
}

export interface CompetitionInterface {
    id: number | string;
    name: string;
}

export interface EventInterface {
    id: number | string;
    name: string;
}

export interface MarketInterface {
    id: string | number;
    name: string | number;
}

export interface RunnerInterface {
    id: number | string;
    name: string;
}

export interface MarketRunnerInterface {
    runnerId: RunnerInterface['id'];
    quotation: QuotationInterface[];
}

export interface QuotationInterface {
    name: string; // BACK, LAY for odd VALUE, Volume for odd volumes
    type: string; // odd value, odd volumes ...
    values: TimeValueInterface[];
    options?: any;
}

export interface TimeValueInterface {
    t: number;
    v: number;
}

export interface QuotationOddValueInterface extends QuotationInterface {
    options?: QuotationOddValueOptionInterface;
}

export interface QuotationOddValueOptionInterface extends QuotationInterface {
    index: number;
}