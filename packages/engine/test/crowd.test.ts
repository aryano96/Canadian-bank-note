import { describe, expect, it } from "vitest";
import { crowdFor, parseConfig, withCurrency } from "../src/index.ts";
import { loadConfig } from "./helpers.ts";

const config = loadConfig();
const hash = "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08";

describe("simulated players", () => {
  it("are the same for the same round", () => {
    expect(crowdFor(hash, config)).toEqual(crowdFor(hash, config));
    expect(crowdFor(hash, config)).not.toEqual(crowdFor("0123" + hash.slice(4), config));
  });

  it("stay within the configured size, the bet limits and the multiplier range", () => {
    const { min, max } = config.table.simulatedPlayers;
    for (let i = 0; i < 200; i++) {
      const seed = (i * 2654435761).toString(16).padStart(8, "0") + hash.slice(8);
      for (const code of ["CAD", "BTC"]) {
        const cfg = withCurrency(config, code);
        const crowd = crowdFor(seed, cfg);
        expect(crowd.length).toBeGreaterThanOrEqual(min);
        expect(crowd.length).toBeLessThanOrEqual(max);
        expect(new Set(crowd.map((p) => p.name)).size).toBe(crowd.length);
        for (const p of crowd) {
          expect(p.wager).toBeGreaterThanOrEqual(cfg.betting.minBet);
          expect(p.wager).toBeLessThanOrEqual(cfg.betting.maxBet);
          expect(p.target).toBeGreaterThanOrEqual(110);
          expect(p.target).toBeLessThanOrEqual(cfg.rng.maxMultiplier * 100);
        }
      }
    }
  });

  it("can be switched off in the config", () => {
    const off = loadConfig((c) => (c.table.simulatedPlayers.enabled = false));
    expect(crowdFor(hash, off)).toEqual([]);
  });

  it("fall back to sensible defaults when an older config has no table or deposit settings", () => {
    const raw = structuredClone(loadConfig()) as Record<string, unknown> & { currencies: Record<string, unknown>[] };
    delete raw.table;
    for (const c of raw.currencies) {
      delete c.depositPresets;
      delete c.maxDeposit;
    }
    const old = parseConfig(raw);
    expect(old.table).toEqual({ playOutAfterCashOut: true, simulatedPlayers: { enabled: true, min: 6, max: 12 } });
    expect(old.account.depositPresets).toEqual([old.account.topUpAmount]);
    expect(old.account.maxDeposit).toBe(old.account.topUpAmount * 10);
  });
});
