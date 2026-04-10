// https://khalilstemmler.com/blogs/typescript/node-starter-project/
'use strict';
import App from "./App";
import {sendNotificationDiscord} from "./Service/Utils";

require('log-timestamp');

sendNotificationDiscord("odds-scraper started !");

const app = new App();
app.start().catch((e: any) => {
    console.error(e);
    sendNotificationDiscord("global catch: " + e.toString());
    sendNotificationDiscord(e.stack);
});
