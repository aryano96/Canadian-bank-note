import { describe, expect, it } from "vitest";
import {
  computeCrashPoint,
  crashPointFromUniform,
  hmacSha256Hex,
  sha256Hex,
  uniformFromHex,
  verifyRound,
} from "../src/index.ts";
import { loadConfig } from "./helpers.ts";

const config = loadConfig();

describe("hashing", () => {
  it("matches known SHA-256 and HMAC-SHA256 vectors", async () => {
    expect(await sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
    // RFC 4231 test case 2
    expect(await hmacSha256Hex("Jefe", "what do ya want for nothing?")).toBe(
      "5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843",
    );
  });
});

describe("crashPointFromUniform", () => {
  it("clamps to 1.00x at the bottom and maxMultiplier at the top", () => {
    expect(crashPointFromUniform(0, config)).toBe(100);
    expect(crashPointFromUniform(0.999999999999, config)).toBe(config.rng.maxMultiplier * 100);
  });

  it("is monotonic in r", () => {
    let prev = 0;
    for (let r = 0; r < 0.999; r += 0.001) {
      const c = crashPointFromUniform(r, config);
      expect(c).toBeGreaterThanOrEqual(prev);
      prev = c;
    }
  });

  it("gives P(crash >= 2x) = (1 - edge) / 2", () => {
    // crash >= 200 exactly when r >= 1 - 0.99/2 = 0.505
    expect(crashPointFromUniform(0.505, config)).toBe(200);
    expect(crashPointFromUniform(0.5049, config)).toBe(199);
  });
});

describe("provably fair rounds", () => {
  it("is deterministic for the same seeds and nonce", async () => {
    const a = await computeCrashPoint("server-seed", "client-seed", 7, config);
    const b = await computeCrashPoint("server-seed", "client-seed", 7, config);
    const c = await computeCrashPoint("server-seed", "client-seed", 8, config);
    expect(a).toEqual(b);
    expect(a.digest).not.toBe(c.digest);
    expect(uniformFromHex(a.digest)).toBeLessThan(1);
  });

  it("verifies an honest round and rejects a tampered one", async () => {
    const serverSeed = "a".repeat(64);
    const serverSeedHash = await sha256Hex(serverSeed);
    const { crashPoint } = await computeCrashPoint(serverSeed, "lucky", 1, config);

    const ok = await verifyRound({ serverSeed, serverSeedHash, clientSeed: "lucky", nonce: 1, crashPoint }, config);
    expect(ok.hashMatches && ok.crashMatches).toBe(true);

    const tampered = await verifyRound(
      { serverSeed, serverSeedHash, clientSeed: "lucky", nonce: 1, crashPoint: crashPoint + 1 },
      config,
    );
    expect(tampered.crashMatches).toBe(false);

    const wrongSeed = await verifyRound(
      { serverSeed: "b".repeat(64), serverSeedHash, clientSeed: "lucky", nonce: 1, crashPoint },
      config,
    );
    expect(wrongSeed.hashMatches).toBe(false);
  });
});
