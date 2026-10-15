// Mirrors apps/server/src/game.ts response shapes.
export interface PublicRound {
  id: string;
  nonce: number;
  wager: number;
  autoCashOut: number | null;
  golden: boolean;
  startedAt: number;
  status: "running" | "won" | "lost";
  serverSeedHash: string;
  clientSeed: string;
  cashOutAt: number | null;
  payout: number;
  bonus: number;
  settledAt: number | null;
  crashPoint?: number;
  serverSeed?: string;
}

export interface PlayerState {
  balance: number;
  clientSeed: string;
  nonce: number;
  nextServerSeedHash: string;
  roundsUntilGolden: number | null;
  nextRoundGolden: boolean;
  activeRound: PublicRound | null;
  serverNow: number;
}

export interface Stats {
  rounds: number;
  wins: number;
  winRate: number;
  wagered: number;
  returned: number;
  net: number;
  rtp: number | null;
  bestMultiplier: number | null;
  biggestWin: number;
  highestCrash: number | null;
  balanceSeries: { t: number; balance: number }[];
}

export interface Simulation {
  rounds: number;
  target: number;
  wins: number;
  winRate: number;
  rtp: number;
  theoreticalRtp: number;
  instantCrashRate: number;
  medianCrash: number;
  distribution: { bucket: string; share: number }[];
}

export interface RoundResult {
  round: PublicRound;
  state: PlayerState;
}
