'use strict';

export function getValueByPath(obj: any, path: string): any {
    const tokens = path.replace(/\[(\d+)\]/g, '.$1').split('.');
    return tokens.reduce((current, token) => current?.[token], obj);
}
