'use strict';

import App from "../App";
import {Db, MongoClient, ServerApiVersion} from "mongodb";
import {GroupMarketInterface} from "../Interface/MarketInterface";
import DiscordService from "./DiscordService";
import {sleep} from "./Utils";

export default class MongoService {
    public app: App;
    public orbitxDb: Db | null = null;
    private client: MongoClient | null = null;
    public connected: boolean = false;
    public marketCollectionName = 'groupMarkets';
    public sofascoreCollectionName = 'sofascore';
    public bitcoinCollectionName = 'bitcoin';

    constructor(app: App) {
        this.app = app;
    }

    public isEnabled(): boolean {
        return process.env.USE_MONGO === "1" || process.env.GET_SOFASCORE_RESULT === "1";
    }

    public async start() {
        if (this.isEnabled()) {
            await this.initMongoDb();
        } else {
            console.log("skipping initMongoDb because " + process.env.APP_ENV);
        }
    }

    /**
     * @return true if the groupMarket can be removed from memory (saved, or Mongo disabled)
     */
    public async saveGroupMarket(groupMarket: GroupMarketInterface, time: number): Promise<boolean> {
        if (!this.isEnabled()) {
            return true;
        }
        if (!this.connected) {
            const message = "Mongo DB not connected";
            console.error(message);
            DiscordService.send(message);
            return false;
        }
        const nbAttempt = 3;
        for (let attempt = 0; attempt <= nbAttempt; attempt++) {
            try {
                for (const market of groupMarket.markets) {
                    market.modificationsOnMarket = [];
                    market.deleted = time;
                }
                await this.orbitxDb!.collection(this.marketCollectionName).insertOne(groupMarket);
                return true;
            } catch (e: any) {
                const errorMessage = e.toString();
                if (
                    attempt === nbAttempt ||
                    !errorMessage.includes('Error: read ECONNRESET')
                ) {
                    const message = "collection insertOne " + JSON.stringify({
                        id: groupMarket.id,
                        error: errorMessage,
                    });
                    console.error(message);
                    DiscordService.send(message);
                    break;
                }
                await sleep(1_000);
            }
        }
        for (const market of groupMarket.markets) {
            market.deleted = null;
        }
        return false;
    }

    public async stop() {
        await this.client?.close();
        this.client = null;
        this.connected = false;
    }

    private async initMongoDb() {
        console.log("Connecting to MongoDb ...");
        const uri = process.env.MONGO_URL ?? "";
        const client = new MongoClient(uri, {
            serverApi: {
                version: ServerApiVersion.v1,
                strict: true,
                deprecationErrors: true,
            }
        });
        await client.connect();
        this.client = client;
        const admin = client.db("admin");
        const result = await admin.command({listDatabases: 1, nameOnly: true});
        this.orbitxDb = client.db(process.env.ORBITX_DATABASE_NAME);
        if (result.databases.find((x: any) => x.name === process.env.ORBITX_DATABASE_NAME) === undefined) {
            // Unless you create a collection you can not see your database in mongodb
            await this.orbitxDb.createCollection(this.marketCollectionName)
            await this.orbitxDb.createCollection(this.sofascoreCollectionName)
            await this.orbitxDb.createCollection(this.bitcoinCollectionName)
        }
        this.connected = true;
        console.log("Connected to MongoDb !");
    }
}
