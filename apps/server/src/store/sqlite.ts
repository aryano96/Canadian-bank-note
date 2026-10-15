import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createRequire } from "node:module";
import type { DatabaseSync as DatabaseSyncType, StatementSync } from "node:sqlite";
import type { Account, IdempotentResponse, LedgerEntry, RoundRecord, Store } from "./types.ts";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  balance INTEGER NOT NULL CHECK (balance >= 0),
  client_seed TEXT NOT NULL,
  nonce INTEGER NOT NULL,
  next_server_seed TEXT NOT NULL,
  next_server_seed_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS rounds (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id),
  nonce INTEGER NOT NULL,
  wager INTEGER NOT NULL,
  auto_cash_out INTEGER,
  golden INTEGER NOT NULL,
  crash_point INTEGER NOT NULL,
  server_seed TEXT NOT NULL,
  server_seed_hash TEXT NOT NULL,
  client_seed TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  status TEXT NOT NULL,
  cash_out_at INTEGER,
  payout INTEGER NOT NULL,
  bonus INTEGER NOT NULL,
  settled_at INTEGER,
  UNIQUE (account_id, nonce)
);
CREATE INDEX IF NOT EXISTS rounds_running ON rounds(status) WHERE status = 'running';
CREATE TABLE IF NOT EXISTS ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id TEXT NOT NULL REFERENCES accounts(id),
  round_id TEXT,
  type TEXT NOT NULL,
  amount INTEGER NOT NULL,
  balance_after INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ledger_account ON ledger(account_id, id);
CREATE TABLE IF NOT EXISTS idempotency (
  account_id TEXT NOT NULL,
  key TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  status_code INTEGER NOT NULL,
  body TEXT NOT NULL,
  PRIMARY KEY (account_id, key)
);
`;

// Loaded via require so bundlers and test runners don't try to resolve "sqlite" as a package.
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");

type Row = Record<string, unknown>;

const toAccount = (r: Row): Account => ({
  id: r.id as string,
  tokenHash: r.token_hash as string,
  balance: Number(r.balance),
  clientSeed: r.client_seed as string,
  nonce: Number(r.nonce),
  nextServerSeed: r.next_server_seed as string,
  nextServerSeedHash: r.next_server_seed_hash as string,
  createdAt: Number(r.created_at),
});

const toRound = (r: Row): RoundRecord => ({
  id: r.id as string,
  accountId: r.account_id as string,
  nonce: Number(r.nonce),
  wager: Number(r.wager),
  autoCashOut: r.auto_cash_out === null ? null : Number(r.auto_cash_out),
  golden: Boolean(r.golden),
  crashPoint: Number(r.crash_point),
  serverSeed: r.server_seed as string,
  serverSeedHash: r.server_seed_hash as string,
  clientSeed: r.client_seed as string,
  startedAt: Number(r.started_at),
  status: r.status as RoundRecord["status"],
  cashOutAt: r.cash_out_at === null ? null : Number(r.cash_out_at),
  payout: Number(r.payout),
  bonus: Number(r.bonus),
  settledAt: r.settled_at === null ? null : Number(r.settled_at),
});

const roundParams = (r: RoundRecord) => ({
  id: r.id,
  account_id: r.accountId,
  nonce: r.nonce,
  wager: r.wager,
  auto_cash_out: r.autoCashOut,
  golden: r.golden ? 1 : 0,
  crash_point: r.crashPoint,
  server_seed: r.serverSeed,
  server_seed_hash: r.serverSeedHash,
  client_seed: r.clientSeed,
  started_at: r.startedAt,
  status: r.status,
  cash_out_at: r.cashOutAt,
  payout: r.payout,
  bonus: r.bonus,
  settled_at: r.settledAt,
});

/** Durable store on Node's built-in SQLite (no native build step needed). */
export class SqliteStore implements Store {
  private db: DatabaseSyncType;
  private stmts: Record<string, StatementSync>;
  private depth = 0;

  constructor(path: string) {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
    this.db.exec(SCHEMA);
    const p = (sql: string) => this.db.prepare(sql);
    this.stmts = {
      insertAccount: p(`INSERT INTO accounts VALUES (:id, :token_hash, :balance, :client_seed, :nonce, :next_server_seed, :next_server_seed_hash, :created_at)`),
      getAccount: p(`SELECT * FROM accounts WHERE id = ?`),
      getAccountByToken: p(`SELECT * FROM accounts WHERE token_hash = ?`),
      updateAccount: p(`UPDATE accounts SET balance = :balance, client_seed = :client_seed, nonce = :nonce, next_server_seed = :next_server_seed, next_server_seed_hash = :next_server_seed_hash WHERE id = :id`),
      insertRound: p(`INSERT INTO rounds VALUES (:id, :account_id, :nonce, :wager, :auto_cash_out, :golden, :crash_point, :server_seed, :server_seed_hash, :client_seed, :started_at, :status, :cash_out_at, :payout, :bonus, :settled_at)`),
      updateRound: p(`UPDATE rounds SET status = :status, cash_out_at = :cash_out_at, payout = :payout, bonus = :bonus, settled_at = :settled_at WHERE id = :id`),
      getRound: p(`SELECT * FROM rounds WHERE id = ?`),
      getActiveRound: p(`SELECT * FROM rounds WHERE account_id = ? AND status = 'running' LIMIT 1`),
      listRunning: p(`SELECT * FROM rounds WHERE status = 'running'`),
      listRounds: p(`SELECT * FROM rounds WHERE account_id = ? ORDER BY nonce DESC LIMIT ?`),
      addLedger: p(`INSERT INTO ledger (account_id, round_id, type, amount, balance_after, created_at) VALUES (?, ?, ?, ?, ?, ?)`),
      listLedger: p(`SELECT * FROM ledger WHERE account_id = ? ORDER BY id DESC LIMIT ?`),
      getIdem: p(`SELECT * FROM idempotency WHERE account_id = ? AND key = ?`),
      putIdem: p(`INSERT INTO idempotency VALUES (?, ?, ?, ?, ?)`),
    };
  }

  transaction<T>(fn: () => T): T {
    if (this.depth > 0) return fn();
    this.depth++;
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = fn();
      this.db.exec("COMMIT");
      return result;
    } catch (err) {
      this.db.exec("ROLLBACK");
      throw err;
    } finally {
      this.depth--;
    }
  }

  createAccount(a: Account) {
    this.stmts.insertAccount!.run({
      id: a.id,
      token_hash: a.tokenHash,
      balance: a.balance,
      client_seed: a.clientSeed,
      nonce: a.nonce,
      next_server_seed: a.nextServerSeed,
      next_server_seed_hash: a.nextServerSeedHash,
      created_at: a.createdAt,
    });
  }
  getAccount(id: string) {
    const r = this.stmts.getAccount!.get(id) as Row | undefined;
    return r && toAccount(r);
  }
  getAccountByTokenHash(tokenHash: string) {
    const r = this.stmts.getAccountByToken!.get(tokenHash) as Row | undefined;
    return r && toAccount(r);
  }
  updateAccount(a: Account) {
    this.stmts.updateAccount!.run({
      id: a.id,
      balance: a.balance,
      client_seed: a.clientSeed,
      nonce: a.nonce,
      next_server_seed: a.nextServerSeed,
      next_server_seed_hash: a.nextServerSeedHash,
    });
  }

  insertRound(r: RoundRecord) {
    this.stmts.insertRound!.run(roundParams(r));
  }
  updateRound(r: RoundRecord) {
    const { id, status, cash_out_at, payout, bonus, settled_at } = roundParams(r);
    this.stmts.updateRound!.run({ id, status, cash_out_at, payout, bonus, settled_at });
  }
  getRound(id: string) {
    const r = this.stmts.getRound!.get(id) as Row | undefined;
    return r && toRound(r);
  }
  getActiveRound(accountId: string) {
    const r = this.stmts.getActiveRound!.get(accountId) as Row | undefined;
    return r && toRound(r);
  }
  listRunningRounds() {
    return (this.stmts.listRunning!.all() as Row[]).map(toRound);
  }
  listRounds(accountId: string, limit: number) {
    return (this.stmts.listRounds!.all(accountId, limit) as Row[]).map(toRound);
  }

  addLedgerEntry(e: LedgerEntry) {
    this.stmts.addLedger!.run(e.accountId, e.roundId, e.type, e.amount, e.balanceAfter, e.createdAt);
  }
  listLedger(accountId: string, limit: number) {
    return (this.stmts.listLedger!.all(accountId, limit) as Row[]).map((r) => ({
      accountId: r.account_id as string,
      roundId: (r.round_id as string | null) ?? null,
      type: r.type as LedgerEntry["type"],
      amount: Number(r.amount),
      balanceAfter: Number(r.balance_after),
      createdAt: Number(r.created_at),
    }));
  }

  getIdempotent(accountId: string, key: string) {
    const r = this.stmts.getIdem!.get(accountId, key) as Row | undefined;
    return (
      r && {
        fingerprint: r.fingerprint as string,
        statusCode: Number(r.status_code),
        body: JSON.parse(r.body as string),
      }
    );
  }
  putIdempotent(accountId: string, key: string, res: IdempotentResponse) {
    this.stmts.putIdem!.run(accountId, key, res.fingerprint, res.statusCode, JSON.stringify(res.body));
  }

  close() {
    this.db.close();
  }
}
