'use strict';

import {DirectionEnum, OddTypeEnum} from "../Enum/MarketEnum";
import {RunnerInterface} from "./MarketInterface";

export interface AccountInterface {
    balance: number;
    currentBets: CurrentBetInterface[];
}

export interface BalanceResponseInterface {
    BALANCE: {
        balance: string;
        avBalance: string | null;
    };
}

export interface MarketRunnerBetStateInterface {
    oddValue: number | null;
    runnerId: RunnerInterface['id'];
    direction: DirectionEnum | null;
    type: OddTypeEnum;
}

export interface SumBetOddInterface {
    back: number;
    lay: number;
}

export interface PropertiesResponseInterface {
    PROPERTIES: {
        properties: {
            mobileSettings: {
                marketGraphsSimplifiedViewEnabled: boolean;
                marketGraphsEnabled: boolean;
            };
            asianViewLayEnabled: boolean;
            desktopSettings: {
                marketGraphsSimplifiedViewEnabled: boolean;
                marketGraphsEnabled: boolean;
            };
            disabledLayOddsSportIds: string[];
            marketOddsBackOnly: boolean;
        };
    };
}

export interface OpenBetsCounterResponse {
    OPEN_BETS_COUNTER: string;
}

export interface CurrentBetsResponseInterface {
    CURRENT_BETS: CurrentBetInterface[];
}

export interface BetActionInterface {
    betToCancels: CurrentBetInterface[];
    newBet: BetslipSelectionInterface | null;
}

export interface CurrentBetInterface {
    offerId: number | undefined;
    marketId: string;
    eventId: string;
    raceId: string;
    price: number; // cote
    averagePrice: number;
    averagePriceRounded: number;
    size: string | number; // montant
    selectionId: RunnerInterface['id'];
    lineSide: string | null;
    marketType: string;
    eventTypeId: number;
    side: string; // back lay
    offerState: string;
    placedDate: number;
    matchedDate: number | null;
    marketStartDate: number;
    cancelledDate: number | null;
    sizePlaced: string | number; // montant
    sizeMatched: string | number; // montant
    sizeRemaining: string | number; // montant
    sizeLapsed: string | number; // montant
    sizeCancelled: string | number; // montant
    sizeVoided: string | number; // montant
    settledDate: number | null;
    profit: string | number;
    liability: string | number;
    profitNet: string | number;
    potentialProfit: string | number;
    currency: string;
    resettled: boolean;
    handicap: string | number;
    bettingType: string;
    persistenceEnabled: boolean;
    persistenceType: string;
    eachWayDivisor: number | null;
    numberOfWinners: number | null;
    minUnitValue: number | null;
    maxUnitValue: number | null;
    interval: number | null;
    marketUnit: string | null;
    commissionType: string;
    betType: string;
    triggeredByCashOut: boolean;
    cancelledByOperator: boolean;
    alternativeBackOdds: number | null;
    alternativeBackOddsRounded: number | null;
    totalWinnings: string | number;
    pastTotalLiability: number | null;
    fancyView: boolean;
    oldOfferId: number | null;
    competitionId: string;
    disabledLayOdds: boolean;
    priceLadderDescription: PriceLadderDescriptionInterface;
    inPlay: boolean;
    oddsType: string;
    eventInPlay: boolean;
    marketProfit: number;
    marketLiability: number;
    partialCashOutEnabled: boolean;
    cashOutEnabled: boolean;
    autoCashOutEnabled: boolean;
    mainEventId: string;
    fillOrKill: boolean;
    tradingViewTickOffsetEnabled: boolean;
    tradingViewTickOffset: number;
    tradingViewStopLossEnabled: boolean;
    tradingViewStopLoss: number;
    oppositeOfferId: number;
    mainEventName: string;
    mainEventStartTime: number;
    marketNameWithParents: string;
    competitionName: string;
    marketName: string;
    eventName: string;
    raceName: string;
    groupName: string;
    selectionName: string;
    sportName: string;
    automatedBet: boolean;
    isPNLAvailable: boolean;
    isTradingView: boolean;
    isAsian: boolean;
    isOutright: boolean;
}

export interface PriceLadderDescriptionInterface {
    type: string;
}

export interface BetStatusesResponseInterface {
    BET_STATUSES: string;
}

export interface GroupBetInterface extends BetslipSelectionInterface, CurrentBetInterface {
}

export interface BetslipRequestInterface {
    [marketId: string]: BetslipSelectionInterface[];
}

export interface BetslipSelectionInterface {
    selectionId: RunnerInterface['id'];
    handicap: string | number;
    price: number; // cote
    size: number | string; // montant
    side: string; // back lay
    betUuid: string;
    betType: string;
    netPLBetslipEnabled: boolean;
    netPLMarketPageEnabled: boolean;
    quickStakesEnabled: boolean;
    confirmBetsEnabled: boolean;
    applicationType: string;
    showLayOddsEnabled: boolean;
    mobile: boolean;
    isEachWay: boolean;
    eachWayData: Record<string, unknown>;
    page: string;
    persistenceType: string;
    placedUsingEnterKey: boolean;
}

export interface PriceBySelectionInterface {
    selectionId: RunnerInterface['id'];
    revenue: number;
    bets: CurrentBetInterface[],
}

export interface RootPriceBySelectionInterface {
    [key: string]: PriceBySelectionInterface;
}