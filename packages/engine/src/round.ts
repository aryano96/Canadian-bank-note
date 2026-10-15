import type { GameConfig } from "./config.ts";
import { elapsedFor, multiplierAt, type Hundredths } from "./multiplier.ts";
import { computePayout } from "./payout.ts";

/**
 * Pure round settlement. Given what the server knows about a round and a
 * point in time, decide whether it is still running, won or lost. No I/O,
 * no clocks: callers pass `at` explicitly, which keeps this fully testable.
 */

export interface RoundState {
  wager: number;
  crashPoint: Hundredths;
  startedAt: number;
  autoCashOut: Hundredths | null;
  golden: boolean;
}

export type Outcome =
  | { status: "running"; multiplier: Hundredths }
  | { status: "won"; cashOutAt: Hundredths; payout: number; bonus: number; settledAt: number }
  | { status: "lost"; payout: 0; settledAt: number };

export function crashTime(round: RoundState, config: GameConfig): number {
  return round.startedAt + elapsedFor(round.crashPoint, config);
}

/** When the auto cash-out fires, or Infinity if it never does. Ties go to the player. */
export function autoCashOutTime(round: RoundState, config: GameConfig): number {
  if (round.autoCashOut === null || round.autoCashOut > round.crashPoint) return Infinity;
  return round.startedAt + elapsedFor(round.autoCashOut, config);
}

function won(round: RoundState, cashOutAt: Hundredths, settledAt: number, config: GameConfig): Outcome {
  const { payout, bonus } = computePayout(round.wager, cashOutAt, round.golden, config);
  return { status: "won", cashOutAt, payout, bonus, settledAt };
}

/** State of the round at time `at` with no player action. */
export function evaluate(round: RoundState, at: number, config: GameConfig): Outcome {
  const autoAt = autoCashOutTime(round, config);
  const crashAt = crashTime(round, config);
  if (autoAt <= at) return won(round, round.autoCashOut!, Math.round(autoAt), config);
  if (at >= crashAt) return { status: "lost", payout: 0, settledAt: Math.round(crashAt) };
  return { status: "running", multiplier: multiplierAt(at - round.startedAt, config) };
}

/** The player asks to cash out at time `at`. */
export function cashOut(round: RoundState, at: number, config: GameConfig): Outcome {
  const state = evaluate(round, at, config);
  if (state.status !== "running") return state;
  return won(round, state.multiplier, at, config);
}
