# Mint Rush 🍁

**A provably fair crash game themed on Canadian banknote security printing.**
Built for the ThunderHacks 2026 Canadian Bank Note sponsor challenge.

Place a wager and the press starts printing. The multiplier climbs along an engraved guilloché curve. Cash out before the press jams to win wager × multiplier. If it jams first, the stamp reads **COUNTERFEIT DETECTED** and the wager is lost.

![Round in progress](docs/screenshots/running.png)

| Cashed out | Crashed | Autobet |
|---|---|---|
| ![Cashed out](docs/screenshots/cashed-out.png) | ![Crashed](docs/screenshots/crashed.png) | ![Autobet](docs/screenshots/autobet.png) |

| Verified in the browser | Stats and house check | Français | Mobile |
|---|---|---|---|
| ![Verify](docs/screenshots/verify.png) | ![Stats](docs/screenshots/stats.png) | ![French](docs/screenshots/french.png) | ![Mobile](docs/screenshots/mobile.png) |

## Quick start

Requires Node 22.13 or newer. There are no native modules: storage uses Node's built-in SQLite.

```bash
npm install
npm run dev        # server on :8787, web on http://localhost:5173
```

To run in production on one port:

```bash
npm run build && npm start      # http://localhost:8787
# or
docker build -t mint-rush . && docker run -p 8787:8787 -v mint-data:/data mint-rush
```

Other commands:

```bash
npm test                         # 48 tests: engine, economy, API on both stores
npm run typecheck
npm run simulate -- 1000000 2    # long-run economics of the current config
```

## What's in it

**MVP requirements**
- Bet and Cash out controls in a casino-style sidebar, with keyboard support (Space).
- Balance, wager, and a live multiplier with a potential-payout readout.
- Server-side account balance with a full ledger.
- A random crash point between 1.00x and the configured maximum, settled by the server.

**Optional enhancements built**
- Auto cash-out ("Cashout At") with a live "Profit on Win" preview.
- Autobet mode: number of bets, increase or reset the wager on a win or loss, and stop on a profit or loss limit.
- Configurable bets: presets, ½ / 2× / Max, min/max limits.
- Session history and a "My bets" table.
- Golden Loonie bonus rounds: every 10th round boosts profit by 10%.
- Stats tab with a balance chart and a live RTP simulation.
- Accessibility: screen-reader announcements, reduced-motion support, focus styles and forced-colors support.
- Full English and French localization.
- Two visual themes: Night (dark slate with a green bet button, the default) and Paper (light, engraved).
- Synthesized sound effects.
- **Provably fair** rounds that any player can verify in their own browser.

## Architecture

```mermaid
flowchart LR
  subgraph Browser["apps/web (React + Canvas)"]
    UI[Components] --> Hook[useGame state machine]
    Stage[Canvas stage<br/>guilloché + curve] --> Hook
    Hook --> Client[API client<br/>idempotency keys + retry]
    Verify[Verify panel] --> Engine1[engine]
  end
  subgraph Server["apps/server (Fastify)"]
    Routes[Routes + rate limit] --> Idem[Idempotency layer]
    Idem --> Game[GameService]
    Game --> Engine2[engine]
    Game --> Store[(Store interface)]
    Store --> SQLite[SqliteStore]
    Store --> Memory[MemoryStore]
  end
  Client -- REST --> Routes
  Client -- SSE round stream --> Routes
  Config[[config/game.config.json]] --> Engine2
  Config --> Routes
```

```
config/game.config.json   every gameplay rule in one validated file
packages/engine           pure TypeScript: RNG, curve, settlement, payouts, simulation (no I/O)
apps/server               Fastify API, GameService, idempotency, Store adapters
apps/web                  React UI, canvas stage, i18n catalogs, themes
```

### Design decisions

- **The server is the authority, the client is a renderer.** The client never learns the crash point while a round is running. The multiplier is a pure function of time (`m(t) = e^(rate·t)`), so the client animates locally from a synced clock. The server pushes the exact settlement moment over Server-Sent Events.
- **The engine is pure.** Settlement takes `(round, time, config)` and returns an outcome. There are no clocks, randomness or I/O, so every rule is unit-tested. The server and the browser verifier import the *same* code.
- **Money is integers.** All amounts are minor units (cents) and multipliers are integer hundredths. Payouts always round down, so floating-point error never touches a balance.
- **Server idempotence.** `POST /api/bets` and `POST /api/rounds/:id/cashout` require an `Idempotency-Key`. Retries replay the stored response, and concurrent duplicates share one execution. The client retries network failures with the same key, so a double-click or a flaky connection can never double-charge.
- **Lazy plus scheduled settlement.** A timer settles each round at its crash or auto-cash-out moment. Any read also settles a round that is overdue, and running rounds are re-armed after a restart. No round is ever stuck.
- **Pluggable storage.** `GameService` only knows the `Store` interface. SQLite (durable, transactional) and in-memory adapters ship. The whole API test suite runs against both.

## Provably fair RNG

1. Before you bet, the server shows `SHA-256(serverSeed)` for your next round.
2. The crash point is `HMAC-SHA256(serverSeed, "clientSeed:nonce")`. You can change your client seed at any time between rounds.
3. The first 52 bits give a uniform `r ∈ [0,1)`, and `crash = floor(100 × (1 − edge) / (1 − r)) / 100`, clamped to `[1.00, max]`.
4. After the round, the seed is revealed. The **Verify** button recomputes both the hash and the crash point in your browser with Web Crypto.

**Why the maths is fair:** for any target `t`, `P(crash ≥ t) = (1 − edge) / t`. Every cash-out strategy therefore has the same expected return, `RTP = 1 − edge` (99% by default). Golden rounds add `(1/N) × boost × (t−1)/t` on top. The Stats tab runs a fresh simulation on the server to show this, and `test/economy.test.ts` asserts it.

## Configuration

Everything is in [`config/game.config.json`](config/game.config.json). It is validated with zod at startup, and a bad value produces a readable error. The UI reads the same config from `GET /api/config`.

| Key | Default | Effect |
|---|---|---|
| `rng.houseEdge` | `0.01` | RTP = 1 − edge |
| `rng.maxMultiplier` | `1000` | Highest possible crash point |
| `timing.growthRatePerSecond` | `0.06` | Curve speed (2x at ≈11.5 s) |
| `betting.minBet` / `maxBet` / `presets` | cents | Bet limits and quick picks |
| `betting.minAutoCashOut` | `1.01` | Lowest auto target |
| `bonus.goldenRoundEvery` / `goldenMultiplierBoost` | `10` / `0.1` | Golden Loonie rounds |
| `account.startingBalance` / `topUpAmount` | cents | Demo credits |
| `ui.locales` / `defaultLocale` / `theme` | `en, fr` / `en` / `night` | Presentation |

Environment variables: `PORT`, `STORE=memory|sqlite`, `DB_PATH`, `CONFIG_PATH`, `STATIC_DIR`.

**To add a language,** add `apps/web/src/i18n/<code>.ts` typed as `Record<MessageKey, string>`. The compiler then rejects any missing string. Register the file in `i18n/index.tsx` and list the code in `ui.locales`.

## API

| Method | Path | Notes |
|---|---|---|
| `POST` | `/api/session` | Creates a guest account and returns a bearer token |
| `GET` | `/api/me` | Balance, seeds, active round, server time |
| `POST` | `/api/bets` | `{ wager, autoCashOut? }`, requires `Idempotency-Key` |
| `POST` | `/api/rounds/:id/cashout` | Requires `Idempotency-Key` |
| `GET` | `/api/rounds/:id/stream` | SSE: `round`, then `settled` |
| `GET` | `/api/rounds/:id`, `/api/history`, `/api/stats` | Seeds are revealed only after settlement |
| `PUT` | `/api/seed` | `{ clientSeed }`, between rounds only |
| `POST` | `/api/topup` | Only when the balance is below the minimum bet |
| `GET` | `/api/simulate?target=2&rounds=200000` | Monte Carlo house check |
| `GET` | `/api/config`, `/api/health` | |

Errors always look like `{ "error": { "code": "INSUFFICIENT_FUNDS", "message": "…" } }`. The UI translates the stable `code`.

## Demo script (2 minutes)

1. **Play:** bet $5 and cash out around 1.5x. Point out the payout readout, the AUTHENTIC stamp, and the dashed line showing where it would have crashed.
2. **Lose one:** let a round run until COUNTERFEIT DETECTED appears.
3. **Fairness:** open My bets, press Verify, and show both checks passing in the browser.
4. **Idempotence:** run `npm test` and show the "retrying a bet with the same key does not double charge" test.
5. **Autobet:** switch to Auto, set 5 bets at 1.50×, and start it.
6. **Bilingual and themes:** press Français, then Paper.
7. **Economy:** open Stats. The simulated RTP sits on the expected RTP. Change `houseEdge` to `0.05`, restart, and show that it follows.

---

Demo credits only. No real money is involved.
