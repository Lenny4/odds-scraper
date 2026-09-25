# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A Node/TypeScript scraper that collects live odds from betting exchanges (OrbitX, a Betfair white-label, and Polymarket), groups the same event across suppliers, persists finished events to MongoDB, and streams data to a Next.js dashboard over socket.io. The end goal is surebet detection between a bookmaker and an exchange (the formula is in `README.md`). Comments and the README are partly in French.

## Commands

Everything normally runs inside the `node` Docker container. `./runc <cmd>` runs a command in it from the project root; `./src/Front/React/runc <cmd>` does the same from the React app directory.

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
npm run lint --prefix src/Front/React      # front lint (the backend has no linter)
```

`npm start` runs `script/start.sh`. With `APP_ENV=prod` it compiles and runs `build/index.js` under `pm2-runtime` (`ecosystem.config.js`). Otherwise it runs `nodemon` + `ts-node` and tees output to `log/dev/`. The container entrypoint (`docker/docker-entrypoint.sh`) also installs and starts the Next.js front (`next dev`/`next start` on port 4001). If pm2 shows `0 application online, retry = 3`, check `max_memory_restart` in `ecosystem.config.js`.

## Configuration (`.env`, overridden by `.env.dev` in dev)

Key flags:
- `APP_ENV` (`prod`/dev). Discord messages are sent only in prod.
- `HEADLESS` (puppeteer).
- `USE_MONGO=1` / `GET_SOFASCORE_RESULT=1`: either one enables Mongo. Without them, groupMarkets are dropped when removed.
- `SHOW_LOG_ADD_REMOVE_EVENT=1`.
- `MARKET_ID_TO_TEST`: limits scraping to one market id (OrbitX market id, or Polymarket event id).
- `ORBITX_USERNAME/PASSWORD`, `DISCORD_WEBHOOK`, `MONGO_URL`, `ORBITX_DATABASE_NAME`.

Ports: `NEXT_PORT` 4001, `SOCKET_PORT` 4002 (Dashboard), `LIVE_PORT` 4004 (LiveSocketService).

## Architecture

`src/index.ts` creates `App`, the root object that holds all shared state. Every service and manager receives `app` in its constructor. Constructors must not open connections, because tests rely on `new App()` having no side effects; all I/O starts in `start()`. `App.stop()` runs on SIGINT/SIGTERM (pm2 `kill_timeout` is 30s) and stops suppliers first so they flush in-memory groupMarkets to Mongo.

**Data model** (`Interface/MarketInterface.ts`): a `MarketInterface` is one supplier's market (runners, odds time series, `diffs`, and the `connections` open/close history). A `GroupMarketInterface` groups markets from different suppliers that represent the same real event. `App` keeps `groupMarkets` plus an index `supplier:marketId → groupMarket` (`App.getGroupMarket` / `indexGroupMarket`). Always go through those instead of searching arrays.

**Suppliers** (`Suppliers/`): each one extends the abstract `SupplierManager`, implements `SupplierInterface`, and is registered in `App.supplierManagers`. Each has the same two long-running tasks, `ScrapEventTask` (discovers and updates markets) and `ScrapSocketTask` (live odds over websockets), created in `start()`. `SupplierManager` holds the shared logic:
- `_canScrapMarket` decides which markets to follow: match odds/moneyline, 2–3 runners, single winner, time and volume windows. `App.liveCompetitions` bypass the time rules.
- `addGroupMarket` / `findMatchingMarket` / `matchRunners` match markets across suppliers by start time (±1h) and fuzzy runner-name similarity (`string-similarity`, threshold 0.62, best permutation), filling `runner.matchings[supplier]`. Runner names must line up across suppliers (for example, the Polymarket draw runner is renamed `The Draw` to match OrbitX).
- `_removeMarkets` saves the whole groupMarket to Mongo, then removes all its markets from every supplier. `isSaving` guards against concurrent removal, and a failed save keeps the market in memory so it can be retried.
- Odds are stored as change-only series through `getCreateOdd` / `addOddValue`.
- Competitions are mapped across suppliers through `App.competitionMapping` → `CompetitionEnum`.

Both `ScrapSocketTask.handleMarkets()` implementations are re-entrant-safe (`isHandlingMarket` / `needHandleMarket`). They run after every add/remove and on a periodic timer. Incoming odds call `app.afterUpdateMarkets`, which triggers the live broadcast.

**OrbitX** (`Suppliers/Orbitx/`):
- `ScrapEventTask` logs in with Puppeteer and sniffs the `X-Csrf-Token` request headers and cookies from page responses into `orbitxManager.headers` (`connectedUntil` comes from the JWT). It then loops over sports and calls the REST API with `fetch`.
- `ScrapSocketTask` spreads followed markets across several exchange websockets (at most 15 markets per socket, plus a pool of pre-opened "waiting" sockets). To get a valid websocket URL and headers, it opens a page, captures the handshake through a CDP session, then reconnects with the `ws` library.

**Polymarket** (`Suppliers/Polymarket/`), no browser needed:
- `ScrapEventTask` pages through the public gamma API `/events/keyset` per sport (by gamma tag ids), throttled by the shared `RateLimiter` (`Service/RateLimiter.ts`) with retry and backoff.
- One Polymarket *event* becomes one `MarketInterface` (`market.id` = event id). `getMoneylineMarkets` merges either a single moneyline market whose outcomes are the teams, or one Yes/No market per result (soccer home/draw/away). Runner ids are CLOB token ids; backing a runner means buying its "Yes" token.
- `ScrapSocketTask` subscribes to token ids on the CLOB market websocket (up to 500 assets per socket, text `PING` every 10s, sockets replaced after 1h) and handles `book` / `price_change` / `market_resolved` messages.

`Service/BrowserManager` is a ref-counted singleton Puppeteer browser (`acquire`/`release`, `userDataDir` under `cache/`).

**Outputs**:
- `Front/Dashboard.ts`: socket.io on `SOCKET_PORT`. It broadcasts internal state (`details`: groupMarkets, socket distribution) every second.
- `Service/LiveSocketService.ts`: socket.io on `LIVE_PORT`. Clients request `groupMarkets` / `odds` and `join` rooms to receive pushed odds updates.
- `Front/React/`: a separate Next.js 16 + MUI app with its own `package.json`/`tsconfig` (excluded from the root `tsc`) that consumes both sockets.
- `Service/DiscordService`: errors and lifecycle events go to a Discord webhook. For errors in background loops, follow the existing `console.error` + `DiscordService.send(errorToString(e))` pattern.

## TypeScript notes

- `useDefineForClassFields: false` is required. Subclasses redeclare fields like `app!: App`, which would otherwise be reset after `super()`.
- `lib` includes `dom` for code executed inside `page.evaluate`.
- `src/**/__tests__` is excluded from the build and runs only under vitest.
