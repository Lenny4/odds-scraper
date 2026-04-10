// https://khalilstemmler.com/blogs/typescript/node-starter-project/
'use strict';
import App from "./App";
import DiscordService from "./Service/DiscordService";

require('log-timestamp');

DiscordService.send("odds-scraper started !");

const app = new App();
app.start().catch((e: any) => {
    console.error(e);
    DiscordService.send("global catch: " + e.toString());
    DiscordService.send(e.stack);
});
