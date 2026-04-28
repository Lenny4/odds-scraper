'use strict';

import {MarketInterface, OddInterface, TimeValueInterface} from "../Interface/MarketInterface";
import {MarketMessageInterface, OddRequestInterface} from "../Interface/LiveInterface";

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
        const change = ((arr[i] - arr[i - 1]) / arr[i - 1]) * 100;
        result.push(+change.toFixed(2));
    }
    return result;
}

function average(arr: number[]): number | undefined {
    if (arr.length === 0) return undefined;
    return arr.reduce((sum, val) => sum + val, 0) / arr.length;
}

export function getDerive(values: TimeValueInterface[], since: number): number {
    if (values.length < 2) return 1;
    const sequence: number[] = [];
    let i = values.length - 1;
    while (i >= 0 && (values[i].t >= since || i === values.length - 1)) {
        sequence.push(values[i].v);
        i--;
    }
    if (sequence.length < 2) return 1;
    const derivative = percentageDerivative(sequence);
    return average(derivative)!;
}