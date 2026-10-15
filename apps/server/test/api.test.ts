import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { elapsedFor, parseConfig, sha256Hex, verifyRound } from "@mint-rush/engine";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.ts";
import { MemoryStore } from "../src/store/memory.ts";
import { SqliteStore } from "../src/store/sqlite.ts";
import type { Store } from "../src/store/types.ts";

const config = parseConfig(
  JSON.parse(readFileSync(fileURLToPath(new URL("../../../config/game.config.json", import.meta.url)), "utf8")),
);

const stores: [string, () => Store][] = [
  ["memory", () => new MemoryStore()],
  ["sqlite", () => new SqliteStore(":memory:")],
];

describe.each(stores)("API with %s store", (_, makeStore) => {
  let now = 1_700_000_000_000;
  let app: Awaited<ReturnType<typeof buildApp>>["app"];
  let token: string;
  let key = 0;

  const call = async (method: "GET" | "POST" | "PUT", url: string, payload?: unknown, headers: Record<string, string> = {}) => {
    const res = await app.inject({
      method,
      url,
      payload: payload as object,
      headers: { authorization: `Bearer ${token}`, ...headers },
    });
    return { status: res.statusCode, body: res.json(), headers: res.headers };
  };
  const idem = () => ({ "idempotency-key": `test-key-${++key}` });

  beforeEach(async () => {
    now = 1_700_000_000_000;
    ({ app } = await buildApp({ config, store: makeStore(), clock: () => now }));
    const res = await app.inject({ method: "POST", url: "/api/session" });
    token = res.json().token;
  });
  afterEach(() => app.close());

  it("creates a guest with the starting balance and a seed commitment", async () => {
    const me = await call("GET", "/api/me");
    expect(me.body.balance).toBe(config.account.startingBalance);
    expect(me.body.nextServerSeedHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("rejects requests without a valid token", async () => {
    const res = await app.inject({ method: "GET", url: "/api/me" });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("UNAUTHORIZED");
  });

  it("deducts the wager, pays wager x multiplier on cash-out", async () => {
    const bet = await call("POST", "/api/bets", { wager: 1000 }, idem());
    expect(bet.status).toBe(200);
    expect(bet.body.state.balance).toBe(config.account.startingBalance - 1000);
    expect(bet.body.round.crashPoint).toBeUndefined(); // secret while running

    const round = bet.body.round;
    // Peek at the server's own record to pick a safe cash-out time.
    const full = await call("GET", `/api/rounds/${round.id}`);
    expect(full.body.status).toBe("running");

    now += 1; // cash out almost instantly: 1.00x, unless it was an instant crash
    const out = await call("POST", `/api/rounds/${round.id}/cashout`, undefined, idem());
    if (out.status === 200) {
      expect(out.body.round.status).toBe("won");
      expect(out.body.state.balance).toBe(config.account.startingBalance - 1000 + out.body.round.payout);
    } else {
      expect(out.body.error.code).toBe("ROUND_OVER");
    }
  });

  it("settles losses lazily and reveals a verifiable seed", async () => {
    const before = await call("GET", "/api/me");
    const bet = await call("POST", "/api/bets", { wager: 500 }, idem());
    expect(bet.body.round.serverSeedHash).toBe(before.body.nextServerSeedHash);

    now += 10 * 60_000; // long after any realistic crash
    const round = (await call("GET", `/api/rounds/${bet.body.round.id}`)).body;
    expect(round.status).toBe("lost");
    expect(await sha256Hex(round.serverSeed)).toBe(round.serverSeedHash);

    const check = await verifyRound(round, config);
    expect(check.hashMatches && check.crashMatches).toBe(true);

    const late = await call("POST", `/api/rounds/${round.id}/cashout`, undefined, idem());
    expect(late.body.error.code).toBe("ROUND_OVER");
  });

  it("honours auto cash-out", async () => {
    // Play until a round crashes above 1.01x so the auto cash-out can win.
    for (let i = 0; i < 20; i++) {
      const bet = await call("POST", "/api/bets", { wager: 100, autoCashOut: 1.01 }, idem());
      now += 10 * 60_000;
      const round = (await call("GET", `/api/rounds/${bet.body.round.id}`)).body;
      if (round.crashPoint >= 101) {
        expect(round).toMatchObject({ status: "won", cashOutAt: 101 });
        expect(round.payout).toBeGreaterThanOrEqual(101);
        return;
      }
      expect(round.status).toBe("lost");
    }
    throw new Error("no winnable round in 20 tries");
  });

  it("is idempotent: retrying a bet with the same key does not double charge", async () => {
    const headers = idem();
    const a = await call("POST", "/api/bets", { wager: 1000 }, headers);
    const b = await call("POST", "/api/bets", { wager: 1000 }, headers);
    expect(b.status).toBe(200);
    expect(b.headers["idempotent-replayed"]).toBe("true");
    expect(b.body.round.id).toBe(a.body.round.id);
    const history = await call("GET", "/api/history");
    expect(history.body).toHaveLength(1);

    const reused = await call("POST", "/api/bets", { wager: 2000 }, headers);
    expect(reused.body.error.code).toBe("IDEMPOTENCY_KEY_REUSED");
  });

  it("handles concurrent duplicate requests as one", async () => {
    const headers = idem();
    const [a, b] = await Promise.all([
      call("POST", "/api/bets", { wager: 1000 }, headers),
      call("POST", "/api/bets", { wager: 1000 }, headers),
    ]);
    expect(a.body.round.id).toBe(b.body.round.id);
  });

  it("requires an idempotency key on money-moving calls", async () => {
    const res = await call("POST", "/api/bets", { wager: 1000 });
    expect(res.body.error.code).toBe("IDEMPOTENCY_KEY_REQUIRED");
  });

  it("enforces bet limits, balance and one round at a time", async () => {
    expect((await call("POST", "/api/bets", { wager: 1 }, idem())).body.error.code).toBe("BET_TOO_SMALL");
    expect((await call("POST", "/api/bets", { wager: 10_000_000 }, idem())).body.error.code).toBe("BET_TOO_LARGE");
    expect((await call("POST", "/api/bets", { wager: 100, autoCashOut: 1.0 }, idem())).body.error.code).toBe("INVALID_AUTO_CASH_OUT");
    expect((await call("POST", "/api/bets", { wager: -5 }, idem())).body.error.code).toBe("VALIDATION_FAILED");

    await call("POST", "/api/bets", { wager: 100 }, idem());
    const active = (await call("GET", "/api/me")).body.activeRound;
    if (active) {
      expect((await call("POST", "/api/bets", { wager: 100 }, idem())).body.error.code).toBe("ROUND_IN_PROGRESS");
      expect((await call("PUT", "/api/seed", { clientSeed: "new" })).body.error.code).toBe("SEED_LOCKED");
    }
  });

  it("never lets the balance go negative", async () => {
    now += 10 * 60_000;
    const spend = config.account.startingBalance;
    const bet = await call("POST", "/api/bets", { wager: spend }, idem());
    expect(bet.status).toBe(200);
    expect((await call("POST", "/api/bets", { wager: 10 }, idem())).body.error.code).toMatch(/ROUND_IN_PROGRESS|INSUFFICIENT_FUNDS/);
  });

  it("offers a top-up only when broke", async () => {
    expect((await call("POST", "/api/topup")).body.error.code).toBe("TOP_UP_NOT_NEEDED");
  });

  it("keeps history and stats consistent with the ledger", async () => {
    for (let i = 0; i < 5; i++) {
      await call("POST", "/api/bets", { wager: 100, autoCashOut: 2 }, idem());
      now += elapsedFor(100_000, config) + 1;
    }
    const history = (await call("GET", "/api/history")).body;
    expect(history).toHaveLength(5);
    const stats = (await call("GET", "/api/stats")).body;
    expect(stats.rounds).toBe(5);
    expect(stats.wagered).toBe(500);
    const me = (await call("GET", "/api/me")).body;
    expect(me.balance).toBe(config.account.startingBalance - 500 + stats.returned);
  });
});
