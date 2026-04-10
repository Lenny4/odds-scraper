'use strict';

import {MarketInterface, SportInterface} from "../../Interface/MarketInterface";
import App from "../../App";
import {SupplierInterface} from "../../Interface/SupplierInterface";
import ScrapEventTask from "./ScrapEventTask";

export default class OrbitxManager implements SupplierInterface {
    app: App;
    name: string = "orbitx";
    markets: MarketInterface[] = [];
    running: boolean = false;
    readonly sports: SportInterface[] = [
        {
            id: "1",
            enum: SportEnum.Soccer
        },
        {
            id: "2",
            enum: SportEnum.Tennis
        },
        {
            id: "4",
            enum: SportEnum.Cricket
        },
        {
            id: "7511",
            enum: SportEnum.Baseball,
        },
        {
            id: "7522",
            enum: SportEnum.Basketball,
        },
        {
            id: "61420",
            enum: SportEnum.AustralianRules,
        },
    ];

    scrapEventTask: ScrapEventTask | null = null;


    constructor(app: App) {
        this.app = app;
    }

    public async start() {
        this.running = true;
        this.scrapEventTask = new ScrapEventTask();
        this.scrapEventTask.start!(this.sports);
    }

    public async stop() {
        // todo
    }
}
