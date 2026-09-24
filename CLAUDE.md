# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A Node/TypeScript scraper that collects live odds from betting exchanges (OrbitX, a Betfair white-label; Polymarket is implemented but currently disabled in `App.ts`), groups the same event across suppliers, persists finished events to MongoDB, and streams data to a Next.js dashboard over socket.io. The end goal is surebet detection between a bookmaker and an exchange (the formula is in `README.md`). Comments and README are partly in French.

## Commands

Everything normally runs inside the `node` Docker container. `./runc <cmd>` executes a command in it (root project), `./src/Front/React/runc <cmd>` does the same from the React app directory.

```bash
# dev (needs X11 for non-headless Chromium; on Ubuntu 22+ disable Wayland, see README)
xhost + && docker compose -f docker-compose.yml -f docker-compose.dev.yml up
# prod
docker compose up -d && ./runc pm2 monit

npm test                                   # vitest run (src/__tests__)
npx vitest run src/__tests__/Utils.test.ts # single file
npx vitest run -t "canScrapMarket"         # single test/describe by name
npm run typecheck                          # tsc --noEmit
npm run build                              # tsc -> build/
npm run lint --prefix src/Front/React      # front lint (no lint for the backend)
```

`npm start` runs `script/start.sh`: with `APP_ENV=prod` it compiles and runs `build/index.js` under `pm2-runtime` (`ecosystem.config.js`); otherwise `nodemon` + `ts-node` with output tee'd to `log/dev/`. The container entrypoint (`docker/docker-entrypoint.sh`) also installs and starts the Next.js front (`next dev`/`next start` on port 4001).

## Configuration (`.env`, overridden by `.env.dev` in dev)

Key flags: `APP_ENV` (`prod`/dev), `HEADLESS` (puppeteer), `USE_MONGO=1` / `GET_SOFASCORE_RESULT=1` (either enables Mongo; otherwise groupMarkets are just dropped on removal), `SHOW_LOG_ADD_REMOVE_EVENT=1`, `MARKET_ID_TO_TEST` (restrict OrbitX scraping to one market id), `ORBITX_USERNAME/PASSWORD`, `DISCORD_WEBHOOK`, `MONGO_URL`, `ORBITX_DATABASE_NAME`. Ports: `NEXT_PORT` 4001, `SOCKET_PORT` 4002 (Dashboard), `LIVE_PORT` 4004 (LiveSocketService).

## Architecture

`src/index.ts` → `App` is the root object holding all shared state; every service/manager receives `app` in its constructor. Constructors must not open connections (tests rely on `new App()` being side-effect free); all I/O starts in `start()`. `App.stop()` (on SIGINT/SIGTERM, pm2 `kill_timeout` 30s) stops suppliers first so they flush in-memory groupMarkets to Mongo.

**Data model** (`Interface/MarketInterface.ts`): a `MarketInterface` is one supplier's market (runners, odds time series, `diffs`, `connections` open/close history). A `GroupMarketInterface` groups markets from different suppliers that represent the same real event. `App` keeps `groupMarkets` plus an index `supplier:marketId → groupMarket` (`App.getGroupMarket` / `indexGroupMarket`) — always go through those, don't search arrays.

**Suppliers** (`Suppliers/`): each extends the abstract `SupplierManager` and implements `SupplierInterface`, registered in `App.supplierManagers`. `SupplierManager` holds the shared logic:
- `_canScrapMarket` — which markets to follow (match odds/moneyline, 2–3 runners, single winner, time/volume windows; `App.liveCompetitions` bypass the time rules).
- `addGroupMarket` / `findMatchingMarket` / `matchRunners` — cross-supplier matching by start time (±1h) and fuzzy runner-name similarity (`string-similarity`, threshold 0.62, best permutation), filling `runner.matchings[supplier]`.
- `_removeMarkets` — saves the whole groupMarket to Mongo then removes all its markets from every supplier; `isSaving` guards concurrent removal, and a failed save keeps the market in memory for retry.
- Odds are stored as change-only series via `getCreateOdd` / `addOddValue`.
- Competitions are mapped across suppliers through `App.competitionMapping` → `CompetitionEnum`.

**OrbitX** (`Suppliers/Orbitx/`), two long-running tasks created in `OrbitxManager.start()`:
- `ScrapEventTask` logs in with Puppeteer, sniffs the `X-Csrf-Token` request headers + cookies from page responses into `orbitxManager.headers` (and `connectedUntil` from the JWT), then loops over sports calling the REST API with `fetch` to discover/update markets.
- `ScrapSocketTask` distributes followed markets across multiple exchange websockets (max ~15 markets per socket, plus a pool of pre-opened "waiting" sockets). To get a valid websocket URL/headers it opens a page and captures the handshake via a CDP session, then reconnects with the `ws` library. `handleMarkets()` is re-entrant-safe (`isHandlingMarket` / `needHandleMarket`) and is triggered after every add/remove and every 30s. Incoming odds call `app.afterUpdateMarkets` → live broadcast.

`Service/BrowserManager` is a ref-counted singleton Puppeteer browser (`acquire`/`release`, `userDataDir` under `cache/`).

**Outputs**:
- `Front/Dashboard.ts` — socket.io on `SOCKET_PORT`, broadcasts internal state (`details`: groupMarkets, socket distribution) every second.
- `Service/LiveSocketService.ts` — socket.io on `LIVE_PORT`; clients request `groupMarkets` / `odds` and `join` rooms to receive pushed odds updates.
- `Front/React/` — separate Next.js 16 + MUI app with its own `package.json`/`tsconfig` (excluded from the root `tsc`), consuming both sockets.
- `Service/DiscordService` — errors and lifecycle events are sent to a Discord webhook; follow the existing `console.error` + `DiscordService.send` pattern for errors in background loops.

## TypeScript notes

- `useDefineForClassFields: false` is required: subclasses redeclare fields like `app!: App`, which would otherwise be reset after `super()`.
- `lib` includes `dom` for code executed inside `page.evaluate`.
