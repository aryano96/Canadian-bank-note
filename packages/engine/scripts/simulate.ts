/**
 * Prints the long-run economics of the current config.
 *   npm run simulate -- [rounds] [target]
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseConfig, simulate, toHundredths } from "../src/index.ts";

const config = parseConfig(
  JSON.parse(readFileSync(fileURLToPath(new URL("../../../config/game.config.json", import.meta.url)), "utf8")),
);
const rounds = Number(process.argv[2] ?? 1_000_000);
const target = toHundredths(Number(process.argv[3] ?? 2));

const r = simulate(rounds, target, config);
const pct = (n: number) => `${(n * 100).toFixed(3)}%`;
console.log(`Mint Rush economy check: ${rounds.toLocaleString()} rounds, cash out at ${(target / 100).toFixed(2)}x`);
console.log(`  house edge          ${pct(config.rng.houseEdge)}`);
console.log(`  theoretical RTP     ${pct(r.theoreticalRtp)} (including Golden Loonie bonus)`);
console.log(`  simulated RTP       ${pct(r.rtp)}`);
console.log(`  win rate            ${pct(r.winRate)}`);
console.log(`  instant crashes     ${pct(r.instantCrashRate)}`);
console.log(`  median crash        ${(r.medianCrash / 100).toFixed(2)}x`);
for (const d of r.distribution) console.log(`  ${d.bucket.padEnd(12)} ${pct(d.share)}`);
