'use strict';

import {MarketInterface, OddInterface} from "../Interface/MarketInterface";
import {MarketMessageInterface, OddRequestInterface} from "../Interface/LiveInterface";

export function getValueByPath(obj: any, path: string): any {
    const tokens = path.replace(/\[(\d+)\]/g, '.$1').split('.');
    return tokens.reduce((current, token) => current?.[token], obj);
}

export function getOddsForOddRequest(market: MarketInterface | MarketMessageInterface, oddRequest: OddRequestInterface): OddInterface[] {
    return getValueByPath(market, oddRequest.path)!.filter((o: OddInterface) =>
        (o.name === oddRequest.name || oddRequest.name === undefined) &&
        (o.type === oddRequest.type || oddRequest.type === undefined) &&
        (o.index === oddRequest.index || oddRequest.index === undefined)
    );
}
