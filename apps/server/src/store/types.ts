import type { Hundredths } from "@mint-rush/engine";

/**
 * Persistence boundary. The game service only talks to this interface, so
 * swapping SQLite for Postgres or Redis means writing one new adapter.
 * All methods are synchronous; Node runs them atomically between awaits.
 */

export interface Account {
  id: string;
  tokenHash: string;
  /** One wallet per currency code, in that currency's minor units. */
  balances: Record<string, number>;
  clientSeed: string;
  nonce: number;
  nextServerSeed: string;
  nextServerSeedHash: string;
  createdAt: number;
}

export type RoundStatus = "running" | "won" | "lost";

export interface RoundRecord {
  id: string;
  accountId: string;
  nonce: number;
  currency: string;
  wager: number;
  autoCashOut: Hundredths | null;
  golden: boolean;
  crashPoint: Hundredths;
  serverSeed: string;
  serverSeedHash: string;
  clientSeed: string;
  startedAt: number;
  status: RoundStatus;
  cashOutAt: Hundredths | null;
  payout: number;
  bonus: number;
  settledAt: number | null;
}

export type LedgerType = "bet" | "payout" | "topup" | "deposit";

export interface LedgerEntry {
  accountId: string;
  roundId: string | null;
  type: LedgerType;
  currency: string;
  amount: number;
  balanceAfter: number;
  createdAt: number;
}

export interface IdempotentResponse {
  fingerprint: string;
  statusCode: number;
  body: unknown;
}

export interface Store {
  transaction<T>(fn: () => T): T;

  createAccount(account: Account): void;
  getAccount(id: string): Account | undefined;
  getAccountByTokenHash(tokenHash: string): Account | undefined;
  updateAccount(account: Account): void;

  insertRound(round: RoundRecord): void;
  updateRound(round: RoundRecord): void;
  getRound(id: string): RoundRecord | undefined;
  getActiveRound(accountId: string): RoundRecord | undefined;
  listRunningRounds(): RoundRecord[];
  listRounds(accountId: string, limit: number): RoundRecord[];

  addLedgerEntry(entry: LedgerEntry): void;
  listLedger(accountId: string, currency: string, limit: number): LedgerEntry[];

  getIdempotent(accountId: string, key: string): IdempotentResponse | undefined;
  putIdempotent(accountId: string, key: string, response: IdempotentResponse): void;

  close(): void;
}
