'use strict';

import App from "../App";
import {Db, MongoClient, ServerApiVersion} from "mongodb";
import {MarketInterface} from "../Interface/MarketInterface";
import DiscordService from "./DiscordService";

export default class MongoService {
    public app: App;
    public orbitxDb: Db | null = null;
    public connected: boolean = false;
    public marketCollectionName = 'markets';
    public sofascoreCollectionName = 'sofascore';

    constructor(app: App) {
        this.app = app;
        this.start();
    }

    public async start() {
        if (process.env.USE_MONGO === "1" || process.env.GET_SOFASCORE_RESULT === "1") {
            await this.initMongoDb();
        } else {
            console.log("skipping initMongoDb because " + process.env.APP_ENV);
        }
    }

    public async saveMarket(market: MarketInterface) {
        if (!this.connected) {
            const message = "Mongo DB not connected";
            console.error(message);
            DiscordService.send(message);
            return;
        }
        const now = Date.now();
        if (process.env.USE_MONGO === "1" || process.env.GET_SOFASCORE_RESULT === "1") {
            const nbAttempt = 3;
            for (let attempt = 0; attempt <= nbAttempt; attempt++) {
                try {
                    await this.orbitxDb!.collection(this.marketCollectionName).insertOne(market);
                    break;
                } catch (e: any) {
                    const errorMessage = e.toString();
                    if (
                        attempt === nbAttempt ||
                        !errorMessage.includes('Error: read ECONNRESET')
                    ) {
                        const message = "collection insertOne " + JSON.stringify({
                            marketId: market.id,
                            error: errorMessage,
                        });
                        console.error(message);
                        DiscordService.send(message);
                        break;
                    }
                    await new Promise(resolve => setTimeout(resolve, 1_000));
                }
            }
        }
    }

    public async stop() {
        // todo
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
        const admin = client.db("admin");
        const result = await admin.command({listDatabases: 1, nameOnly: true});
        this.orbitxDb = client.db(process.env.ORBITX_DATABASE_NAME);
        if (result.databases.find((x: any) => x.name === process.env.ORBITX_DATABASE_NAME) === undefined) {
            // Unless you create a collection you can not see your database in mongodb
            await this.orbitxDb.createCollection(this.marketCollectionName)
            await this.orbitxDb.createCollection(this.sofascoreCollectionName)
        }
        this.connected = true;
        console.log("Connected to MongoDb !");
    }
}
