# Mint Rush: the pitch

**One line:** Mint Rush is a provably fair crash game themed on Canadian bank notes. Paper sky lanterns rise and glow as the multiplier climbs, and every round can be verified in the player's own browser.

## The 2-minute script

**0:00 Hook (15s)**
> "Every crash game is a number going up and a button that says Cash out. We asked what it would look like if the Canadian Bank Note Company printed one. This is Mint Rush."

Have a round already running, with the lanterns rising.

**0:15 Play (30s)**
> "You bet, and three paper lanterns lift off. The number is painted on the big one. The higher the multiplier, the higher they float and the brighter they burn, so you feel the risk without reading anything. Gold means it's still climbing."

Cash out at about 1.5×.

> "Cash out and they flash green: you're safe. Wait too long..."

Let the next round crash.

> "...and they turn red and drop. Green is safe, gold is greed, red is loss. We chose those colours on purpose."

**0:45 Trust (25s)**
> "The question every player has is whether the game is rigged. Before you bet, we show you a hash of the server's seed. After the round we reveal the seed, and the Verify button recomputes the crash point right here in your browser."

Open My bets, press Verify, and show both checks passing.

**1:10 Backend (25s)**
> "Underneath is a real backend. The server owns every balance and keeps a full ledger. Bets and cash-outs are idempotent, so a double-click or a dropped connection can never charge you twice. There's a test for exactly that. Rounds stream to the browser live over server-sent events, and everything persists in SQLite."

**1:35 Config (15s)**
> "Every rule lives in one config file: house edge, max multiplier, speed, bet limits and currencies. Here are five wallets, from Canadian dollars to Bitcoin, all defined in config."

Open the wallet menu and switch to BTC.

**1:50 Close (10s)**
> "It's bilingual, it works on a phone, and it has a Golden Loonie bonus every tenth round. Mint Rush: a crash game you can actually trust."

Press Français on the way out.

## How it maps to the rubric

| Criterion | Points | What to show |
|---|---|---|
| Creativity and polish | 20 | Rising sky lanterns, colour states (gold, green, red), drifting embers, the Golden Loonie round, Cashed out and Crashed stamps, sound, the Night and Paper themes |
| Backend | 10 | Server-side balances and ledger, idempotent bets and cash-outs, SSE streaming, SQLite with migrations, provably fair RNG, 54 tests |
| Modularity and config | 10 | `packages/engine` is pure rules with no I/O, plus `apps/server` and `apps/web`. One `config/game.config.json` drives the edge, the curve, limits, bonus rounds and currencies |
| Presentation | 10 | This script, the README, and a demo that runs anywhere (`npm run build:demo` needs no server) |

## Numbers worth knowing

- **RTP is 99%.** For any cash-out target `t`, `P(crash ≥ t) = 0.99 / t`, so every strategy has the same expected return. The Stats tab simulates it live.
- **Golden Loonie:** every 10th round adds a 10% profit boost.
- **Curve:** it starts slow and keeps speeding up. 2× takes about 7 seconds and 10× about 17.
- **Max multiplier:** 1000×.
- **Tests:** 54, covering the engine, the economy, and the API on both the in-memory and SQLite stores.

## Likely judge questions

**"How do I know the crash point wasn't picked after I bet?"**
The server commits to `SHA-256(serverSeed)` before you bet. The crash point is `HMAC-SHA256(serverSeed, clientSeed:nonce)`, and you can change your client seed. After the round, Verify checks both in your browser with Web Crypto.

**"What happens if I click Cash out twice, or my Wi-Fi drops mid-bet?"**
Every bet and cash-out carries an `Idempotency-Key`. A retry with the same key returns the original result and never charges twice. `npm test` includes that case.

**"Can the house edge be changed?"**
Yes. Change `houseEdge` in `config/game.config.json` and restart. The Stats tab's simulated RTP follows the new value.

**"Why these colours?"**
Gold reads as reward and temptation, so it rises with the multiplier. Green reads as safe and won, and red as danger and loss. The player knows the outcome before reading the number.

**"Does it scale past one player?"**
Rounds are per player and settled on the server. The store sits behind an interface with in-memory and SQLite versions, so a shared database can be swapped in without touching game logic.

## Before you present

1. Run `npm run build && npm start` and open http://localhost:8787. Or use the static demo from `npm run build:demo`.
2. Play one round first so My bets has a row to verify.
3. Keep a terminal open with `npm test` ready for the idempotency question.
