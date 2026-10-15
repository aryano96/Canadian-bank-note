import type { GameConfig } from "./config.ts";
import { ONE_X, type Hundredths } from "./multiplier.ts";

/**
 * Provably fair crash points.
 *
 * Before a round the server commits to SHA-256(serverSeed). The crash point is
 * derived from HMAC-SHA256(serverSeed, `${clientSeed}:${nonce}`). After the
 * round the seed is revealed, so anyone can recompute both values.
 *
 * Uses the Web Crypto API, which exists in browsers and Node 20+, so the server
 * and the in-browser verifier run the exact same code.
 */

const encoder = new TextEncoder();

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function sha256Hex(message: string): Promise<string> {
  return toHex(await crypto.subtle.digest("SHA-256", encoder.encode(message)));
}

export async function hmacSha256Hex(key: string, message: string): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return toHex(await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(message)));
}

export function randomSeed(bytes = 32): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Maps a uniform value r in [0, 1) to a crash point.
 *
 * crash = floor(100 * (1 - edge) / (1 - r)) / 100, clamped to [1.00, max].
 * For any target t, P(crash >= t) = (1 - edge) / t, so every cash-out
 * strategy has the same expected return: RTP = 1 - edge.
 */
export function crashPointFromUniform(r: number, config: GameConfig): Hundredths {
  const raw = (100 * (1 - config.rng.houseEdge)) / (1 - r);
  const crash = Math.floor(raw + 1e-9);
  const max = Math.round(config.rng.maxMultiplier * 100);
  return Math.min(max, Math.max(ONE_X, crash));
}

/** Uses the first 52 bits of the digest, the most a double holds exactly. */
export function uniformFromHex(hex: string): number {
  const int = Number.parseInt(hex.slice(0, 13), 16);
  return int / 2 ** 52;
}

export async function computeCrashPoint(
  serverSeed: string,
  clientSeed: string,
  nonce: number,
  config: GameConfig,
): Promise<{ crashPoint: Hundredths; digest: string }> {
  const digest = await hmacSha256Hex(serverSeed, `${clientSeed}:${nonce}`);
  return { crashPoint: crashPointFromUniform(uniformFromHex(digest), config), digest };
}

export interface VerificationInput {
  serverSeed: string;
  serverSeedHash: string;
  clientSeed: string;
  nonce: number;
  crashPoint: Hundredths;
}

export interface VerificationResult {
  hashMatches: boolean;
  computedCrashPoint: Hundredths;
  crashMatches: boolean;
  digest: string;
}

export async function verifyRound(
  input: VerificationInput,
  config: GameConfig,
): Promise<VerificationResult> {
  const hash = await sha256Hex(input.serverSeed);
  const { crashPoint, digest } = await computeCrashPoint(
    input.serverSeed,
    input.clientSeed,
    input.nonce,
    config,
  );
  return {
    hashMatches: hash === input.serverSeedHash,
    computedCrashPoint: crashPoint,
    crashMatches: crashPoint === input.crashPoint,
    digest,
  };
}
