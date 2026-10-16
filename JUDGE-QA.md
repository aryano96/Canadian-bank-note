# Mint Rush: judge questions and short answers

Grouped by the four rubric categories. Each answer is short enough to say out loud.

---

## 1. Presentation Layer (10)
*UI quality, responsiveness, theme consistency, usability, gameplay feedback*

**Q: Walk me through what the player sees in one round.**
A: You set a bet and press Bet. Three paper lanterns lift off with the multiplier on the big one. They rise higher and glow brighter gold as it climbs. Cash out and they flash green with a "Cashed out" stamp; if it crashes they turn red and drop.

**Q: How does the player know what's happening without reading numbers?**
A: Colour and motion. Gold means climbing, green means you're safe, red means you lost. Height and glow track the multiplier, plus sound effects and toasts for every event.

**Q: Does it work on a phone?**
A: Yes. The layout collapses at 1180, 900, 700 and 560 pixels, and on a phone the Bet button sits right under the lanterns. I can show it in the device view.

**Q: Why no graph like other crash games?**
A: Everyone has a line graph. The lanterns give the same feeling of "higher means riskier" but fit the paper and bank-note theme, and they're easier to read at a glance.

**Q: How is the theme kept consistent?**
A: All colours are CSS tokens. There's a Night theme (default) and a Paper theme, and every component reads the same tokens, so switching themes changes everything at once.

**Q: What happens after I cash out?**
A: The round keeps playing so you can see where it would have crashed, and you can watch the Live bets panel settle. That's the "did I leave too early?" moment that keeps people playing.

**Q: Is it accessible?**
A: It respects reduced-motion and high-contrast (forced colours) settings, uses real buttons with labels, and never relies on colour alone: there's always a stamp and a number too.

**Q: Can I bet automatically?**
A: Yes. Manual and Auto tabs. Auto sets a cash-out target and a number of rounds, like real crash sites.

---

## 2. Backend Layer (10)
*Game logic, account management, RNG, security, reliability*

**Q: How is the crash point generated?**
A: HMAC-SHA256 of the server seed with your client seed and a round number. We take the first 52 bits as a number between 0 and 1 and map it to a crash point with a 1% house edge, capped at 1000×.

**Q: How do I know you didn't pick the crash point after I bet?**
A: Before you bet we show you the SHA-256 hash of the server seed. After the round we reveal the seed, and the Verify button recomputes both the hash and the crash point in your browser using the same code the server runs.

**Q: Why is it fair, mathematically?**
A: For any target t, the chance of reaching it is 0.99 divided by t. So every cash-out strategy has the same 99% return. The Stats tab simulates 200,000 rounds live to prove it.

**Q: Can the player cheat the cash-out by lying about the time?**
A: No. The server owns the clock. When you press Cash out, the server works out the multiplier from its own time, not from anything the browser sends. Auto cash-out is also settled on the server.

**Q: What if I double-click Bet, or my Wi-Fi drops mid-bet?**
A: Every bet, cash-out and deposit carries an Idempotency-Key. A retry with the same key gets the original answer and is never charged twice. There's a test for exactly that.

**Q: How are accounts and balances handled?**
A: Each player gets a guest account with a random token. We only store a hash of the token. Balances live on the server, one wallet per currency, and every change writes a ledger row with the balance after it.

**Q: How do you keep balances consistent?**
A: Every money move runs inside a database transaction (SQLite BEGIN IMMEDIATE), so a bet and its debit either both happen or neither does. Amounts are integers in the smallest unit, so no floating-point rounding.

**Q: What if the server crashes mid-round?**
A: On restart it finds rounds that were still running and settles them using the stored start time and the committed crash point. Nobody's money is lost in limbo.

**Q: What security did you add?**
A: Input validation with Zod on every route, rate limiting (stricter on session creation and simulation), hashed tokens, server-side balances and timing, and errors that never leak internals.

**Q: How do rounds reach the browser in real time?**
A: Server-sent events. It's simpler than WebSockets for one-way updates and reconnects automatically.

**Q: How do you know it works?**
A: 64 automated tests covering the engine, the economy and the API, run against both the in-memory and the SQLite store. `npm test` runs them.

**Q (weak spot): Is this real money? How does Deposit work?**
A: It's play money. Deposit is a real, idempotent API with per-currency limits from config, but there's no payment provider behind it. Plugging one in would only change that one endpoint.

**Q (weak spot): Are the other players in Live bets real?**
A: No, they're simulated, and we say so. They're generated from the round's committed seed hash, so they never affect your balance or reveal the crash point. They make the table feel alive. A real multiplayer table would reuse the same panel, fed from the server.

**Q (weak spot): Does it scale past one player?**
A: Rounds are per player today. The store sits behind an interface, so swapping SQLite for Postgres and adding a shared round loop wouldn't touch the game rules.

**Q (weak spot): Is there real login?**
A: Guest accounts only, to keep the demo frictionless. The account model already has a token hash, so adding email or OAuth sign-in is an add-on, not a rewrite.

---

## 3. Modularity & Configurability (10)
*Code quality, maintainability, extensibility, localization, ease of enhancement*

**Q: How is the code organised?**
A: Three parts. `packages/engine` is pure game rules and RNG with no I/O. `apps/server` is the Fastify API and database. `apps/web` is the React front end. The engine is shared, so server and browser verifier run identical code.

**Q: What can I change without touching code?**
A: Everything in `config/game.config.json`: house edge, max multiplier, curve speed, bet limits, currencies, deposit presets, the Golden Loonie bonus, simulated players, play-on after cash-out, default language and theme. Change it, restart, and the server, UI and simulator all follow.

**Q: Show me adding a currency.**
A: Add one object to the `currencies` list with its symbol, decimals, limits and presets. It appears in the wallet menu with its own balance. Old databases migrate automatically.

**Q: How does localisation work?**
A: All text lives in `i18n/en.ts` and `i18n/fr.ts`. The French file must have every English key, or TypeScript fails the build. Adding a language is one new file and one config entry.

**Q: How would you add a new feature, like a new bonus round?**
A: Add the rule to the engine as a pure function with a test, add its settings to config, and the server and UI pick it up. Nothing else needs to know.

**Q: How do you swap the database?**
A: Implement the `Store` interface. There are already two versions, in-memory and SQLite, and the same test suite runs against both.

**Q: How do you keep code quality up?**
A: TypeScript everywhere, Zod for request validation, small single-purpose files, typed errors with codes, and tests for every money path.

---

## 4. Creativity & Polish (20)
*Innovation, visual appeal, player engagement, overall impact*

**Q: How does this connect to the Canadian Bank Note theme?**
A: It's styled like security print: guilloche patterns, paper textures, engraved type and stamps. The multiplier rides on paper sky lanterns, the bonus is a Golden Loonie, and the simulated players have Canadian names.

**Q: What's the most original thing here?**
A: Two things. The lanterns, which make risk something you feel rather than read. And trust you can check yourself: one click verifies the round in your own browser.

**Q: What keeps players engaged?**
A: The Golden Loonie round every 10th round with a 10% boost and a meter counting down to it, the Live bets table, watching the round play on after you cash out, autobet, history chips, and your own stats.

**Q: Why bilingual?**
A: It's a Canadian theme, and Canada is officially bilingual. Every screen is in English and French, switchable instantly.

**Q: What would you build next?**
A: A real shared multiplayer round, sign-in, a leaderboard, and more lantern themes for holidays like Canada Day.

**Q: If you had to pick one reason we should pick you, what is it?**
A: It looks like a product, it's provably fair, and the backend is built like real money is on the line: idempotent, transactional and tested.

---

## Quick numbers to remember
- RTP 99% (house edge 1%), max 1000×
- 2× takes about 7 seconds, 10× about 17
- Golden Loonie every 10th round, +10% profit
- 5 currencies: CAD, USD, GBP, BTC, ETH
- 64 tests, 2 stores (memory + SQLite), 2 languages, 2 themes
- Live demo: https://aryano96.github.io/Canadian-bank-note/
