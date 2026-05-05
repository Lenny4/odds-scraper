'use strict';

export enum MarketStatusEnum {
    Open = "open",
    Closed = "closed",
    Suspended = "suspended",
}

export enum OddTypeEnum {
    Back = "B",
    Lay = "L",
}

export enum OddNameEnum {
    MarketVolume = "marketVolume",
    RunnerOddValue = "runnerOddValue",
    RunnerOddVolume = "runnerOddVolume",
    CryptoValue = "cryptoValue",
    PolymarketDerive = "polymarketDerive",
}

export enum DirectionEnum {
    Stable = "S",
    Up = "U",
    Down = "D",
}