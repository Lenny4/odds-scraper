'use strict';

import puppeteer, {Browser, PuppeteerLaunchOptions} from 'puppeteer';
import * as fs from "fs";
import path from "path";

class BrowserManager {
    private static browser: Browser | null = null;
    private static refCount = 0;
    private static launchPromise: Promise<Browser> | null = null;
    private static closePromise: Promise<void> | null = null;

    static async acquire(cache: string | null = null): Promise<Browser> {
        if (BrowserManager.closePromise) {
            await BrowserManager.closePromise;
        }

        BrowserManager.refCount++;

        if (BrowserManager.browser) {
            return BrowserManager.browser;
        }

        if (BrowserManager.launchPromise) {
            return BrowserManager.launchPromise;
        }

        // https://peter.sh/experiments/chromium-command-line-switches/
        const args = [
            '--no-sandbox',
            // Disables Chrome's security sandbox, which isolates browser processes. Required in Docker and CI environments
            // where sandboxing isn't supported. WARNING: Reduces browser security. Use only in trusted environments.

            '--disable-setuid-sandbox',
            // Prevents the browser from using the setuid sandbox (a secondary layer of sandboxing).
            // Necessary when --no-sandbox is used, especially in Docker.

            '--disable-dev-shm-usage',
            // Forces Chrome to use /tmp for temporary files instead of /dev/shm (shared memory).
            // Fixes issues in Docker where /dev/shm is small and can cause crashes. May slightly reduce performance.

            '--disable-blink-features=AutomationControlled',
            // Disables Chrome's automation detection features. Specifically hides `navigator.webdriver` and other hints
            // that the browser is being automated, making Puppeteer harder to detect.

            '--disable-web-security',
            // Disables same-origin policy and other security features. Useful for testing across domains,
            // but insecure. Avoid using in production environments.

            '--disable-features=IsolateOrigins,site-per-process',
            // Disables Chrome's strict site isolation features, which can interfere with automation involving
            // multiple domains or iframes. May reduce security but improves compatibility.

            '--start-maximized',
            // Starts the browser window maximized. Combined with `defaultViewport: { width: 0, height: 0 }`,
            // this makes the viewport fill the screen (like a real user would see).

            '--disable-notifications',
            // Disables browser pop-up notifications, which can interfere with scraping or automation.

            '--disk-cache-size=0',
            // Disables disk-based HTTP cache. Useful for ensuring fresh content or saving disk I/O in short-lived
            // sessions (like in scraping). May increase bandwidth and reduce speed if resources are refetched often.
        ];
        if (cache === null) {
            args.push('--incognito')
        }
        const options: PuppeteerLaunchOptions | undefined = {
            headless: process.env.HEADLESS !== 'false',
            defaultViewport: {width: 0, height: 0},
            args: args,
            ...(cache && {
                userDataDir: cache,
            }),
        };
        if (cache) {
            try {
                fs.unlinkSync(cache + '/Default/Preferences'); // prevent Chromium to display "Restore Pages?"
            } catch (err) {
                // nothing
            }
            try {
                // https://github.com/puppeteer/puppeteer/issues/4860
                const files = fs.readdirSync(cache);
                for (const file of files) {
                    if (file.match('Singleton')) {
                        const filePath = path.join(cache, file)
                        fs.unlinkSync(filePath)
                    }
                }
            } catch (err) {
                // nothing
            }
        }

        BrowserManager.launchPromise = puppeteer.launch(options).then((browser) => {
            BrowserManager.browser = browser;
            BrowserManager.launchPromise = null;
            return browser;
        });

        return BrowserManager.launchPromise;
    }

    static async release(): Promise<void> {
        BrowserManager.refCount--;

        if (BrowserManager.refCount === 0 && BrowserManager.browser) {
            const browserToClose = BrowserManager.browser;
            BrowserManager.browser = null;

            BrowserManager.closePromise = browserToClose.close().finally(() => {
                BrowserManager.closePromise = null;
            });

            await BrowserManager.closePromise;
        }
    }
}