// https://khalilstemmler.com/blogs/typescript/node-starter-project/
'use strict';
import App from "./App";
import DiscordService from "./Service/DiscordService";
import {errorToString} from "./Service/Utils";

require('log-timestamp');

DiscordService.send("odds-scraper started !");

// safety net: log instead of crashing on errors thrown by background tasks / event handlers
process.on('unhandledRejection', (reason) => {
    const message = "unhandledRejection: " + errorToString(reason);
    console.error(message);
    DiscordService.send(message);
});
process.on('uncaughtException', (e) => {
    const message = "uncaughtException: " + errorToString(e);
    console.error(message);
    DiscordService.send(message);
});

const app = new App();

let stopping = false;
const shutdown = async (signal: string) => {
    if (stopping) {
        return;
    }
    stopping = true;
    console.info(`${signal} received, stopping odds-scraper ...`);
    try {
        await app.stop();
        await DiscordService.send(`odds-scraper stopped (${signal})`);
    } catch (e) {
        console.error("error while stopping", e);
    }
    process.exit(0);
};
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

app.start().catch((e: any) => {
    console.error(e);
    DiscordService.send("global catch: " + e.toString());
    DiscordService.send(e.stack);
});
