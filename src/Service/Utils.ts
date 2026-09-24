'use strict';

import {MarketInterface, OddInterface, TimeValueInterface} from "../Interface/MarketInterface";
import {MarketMessageInterface, OddRequestInterface} from "../Interface/LiveInterface";

export const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

export const errorToString = (e: unknown): string => e instanceof Error ? (e.stack ?? e.toString()) : String(e);

export const ticks = [
    {from: 0.00, to: 2.00, tick: 0.01},
    {from: 2.00, to: 3.00, tick: 0.02},
    {from: 3.00, to: 4.00, tick: 0.05},
    {from: 4.00, to: 6.0, tick: 0.1},
    {from: 6.0, to: 10.0, tick: 0.2},
    {from: 10.0, to: 20.0, tick: 0.5},
    {from: 20.0, to: 30.0, tick: 1.0},
    {from: 30.0, to: 50.0, tick: 2.0},
    {from: 50.0, to: 100.0, tick: 5.0},
    {from: 100.0, to: 1000.0, tick: 10.0}
];

/**
 * Tick used to go UP from oddValue (e.g. 2.00 -> 2.02, 1.99 -> 2.00)
 */
export const getTickSize = (oddValue: number): number => {
    for (const range of ticks) {
        if (oddValue >= range.from && oddValue < range.to) {
            return range.tick;
        }
    }
    return 10; // hors plage connue
}

export const getTickDiff = (min: number, max: number): number => {
    let result = 0;
    while (min < max) {
        result++;
        // round to the hundredth: all ticks are multiples of 0.01, avoids float drift (1.9 + 10 * 0.01 = 1.9999...)
        min = Math.round((min + getTickSize(min)) * 100) / 100;
    }
    return result;
}

export function getValueByPath(obj: any, path: string): any {
    const tokens = path.replace(/\[(\d+)\]/g, '.$1').split('.');
    return tokens.reduce((current, token) => current?.[token], obj);
}

export function getOddsForOddRequest(market: MarketInterface | MarketMessageInterface, oddRequest: OddRequestInterface): OddInterface[] {
    return getValueByPath(market, oddRequest.path)!.filter((o: OddInterface) =>
        (o.name === oddRequest.name || oddRequest.name === undefined) &&
        (o.type === oddRequest.type || oddRequest.type === undefined) &&
        (o.supplier === oddRequest.supplier || oddRequest.supplier === undefined) &&
        (o.index === oddRequest.index || oddRequest.index === undefined)
    );
}

function percentageDerivative(arr: number[]): number[] {
    const result: number[] = [];
    for (let i = 1; i < arr.length; i++) {
        if (arr[i - 1] >= arr[i]) {
            result.push((arr[i] / arr[i - 1]));
        } else {
            result.push(-(arr[i - 1] / arr[i]));
        }
    }
    return result;
}

export function getDerive(values: TimeValueInterface[], since: number): number {
    if (values.length < 2) {
        return 0;
    }
    const sequence: number[] = [];
    let i = values.length - 1;
    for (let i = values.length - 1; i >= 0; i--) {
        if (values[i].t >= since) {
            sequence.push(values[i].v);
        } else {
            if (sequence.length === 1) {
                sequence.push(values[i].v);
            }
            break;
        }
    }
    if (sequence.length < 2) {
        return 0;
    }
    const derivative = percentageDerivative(sequence);
    return derivative.reduce((sum, val) => sum + val, 0);
}