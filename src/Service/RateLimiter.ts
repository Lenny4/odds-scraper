'use strict';

import {sleep} from "./Utils";

/**
 * Sliding window rate limiter: at most `maxRequests` calls to `acquire()` resolve per `windowMs`.
 */
export class RateLimiter {
    private readonly maxRequests: number;
    private readonly windowMs: number;
    private timestamps: number[] = [];

    constructor(maxRequests: number, windowMs: number) {
        this.maxRequests = maxRequests;
        this.windowMs = windowMs;
    }

    async acquire(): Promise<void> {
        while (true) {
            const now = Date.now();
            this.timestamps = this.timestamps.filter(t => t > now - this.windowMs);
            if (this.timestamps.length < this.maxRequests) {
                // check + push in the same tick: concurrent callers can't both take the last slot
                this.timestamps.push(now);
                return;
            }
            await sleep(this.timestamps[0] + this.windowMs - now);
        }
    }
}
