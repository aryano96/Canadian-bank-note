import type { GameConfig } from "./config.ts";
import type { Hundredths } from "./multiplier.ts";

/**
 * Simulated players who share a round with the real one. They are pure
 * decoration: they never touch a balance or the crash point. Each crowd is
 * derived from the round's committed server seed hash, so the same round
 * always shows the same players, and nothing about it hints at the crash point.
 */

export interface CrowdPlayer {
  name: string;
  /** Avatar colour. */
  color: string;
  /** Wager in the round currency's minor units. */
  wager: number;
  /** Where this player cashes out. If the round crashes first, they lose. */
  target: Hundredths;
}

const NAMES = [
  "MapleRider", "northernlights", "loonie_lord", "TimbitsTrader", "QuebecQueen", "moosemoney", "polarbear88",
  "HuardHunter", "toonie.tom", "BanffBetty", "caribou_cash", "PoutineKing", "YukonGold", "halifaxhal",
  "CanuckLuck", "aurora.ava", "Muskoka_Mike", "beavertail", "SaskSam", "the_mountie", "OttawaOlivia",
  "ice.road", "RideauRich", "prairie_pat", "Niagara_Nina", "okanagan", "VancityVic", "fundy_fern",
];

const COLORS = ["#ff8a3d", "#1475e1", "#b84dff", "#00c2a8", "#ffc800", "#ed4163", "#5dd36a", "#ff6fb1", "#7aa7ff", "#c9a46b"];

/** Popular cash-out targets, like the ones real players type in. */
const COMMON_TARGETS = [120, 150, 150, 200, 200, 200, 300, 500, 1000];

/** Small, fast PRNG (mulberry32). */
function prng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The simulated players for the round committed to by `seedHash`, in the active currency. */
export function crowdFor(seedHash: string, config: GameConfig): CrowdPlayer[] {
  const { enabled, min, max } = config.table.simulatedPlayers;
  if (!enabled || max === 0) return [];
  const rand = prng(Number.parseInt(seedHash.slice(0, 8), 16) || 1);
  const pick = <T>(list: readonly T[]) => list[Math.floor(rand() * list.length)]!;

  const count = min + Math.floor(rand() * (max - min + 1));
  const names = [...NAMES];
  const { presets, minBet, maxBet } = config.betting;
  const cap = Math.round(config.rng.maxMultiplier * 100);
  const players: CrowdPlayer[] = [];
  for (let i = 0; i < count && names.length > 0; i++) {
    const name = names.splice(Math.floor(rand() * names.length), 1)[0]!;
    // Mostly the usual bet sizes, with the odd high roller.
    const base = pick(presets) * pick([0.5, 1, 1, 1, 2, 2, 4, 10]);
    const wager = Math.max(minBet, Math.min(maxBet, Math.round(base / minBet) * minBet));
    // Half pick a round number; the rest cash out wherever their nerve gives, from the same odds the game uses.
    const target =
      rand() < 0.5
        ? pick(COMMON_TARGETS)
        : Math.min(cap, Math.max(110, Math.floor(99 / Math.max(rand(), 0.02))));
    players.push({ name, color: COLORS[i % COLORS.length]!, wager, target });
  }
  return players;
}
