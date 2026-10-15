import type { Account, IdempotentResponse, LedgerEntry, RoundRecord, Store } from "./types.ts";

/** In-memory store for tests and zero-setup demos. */
export class MemoryStore implements Store {
  private accounts = new Map<string, Account>();
  private rounds = new Map<string, RoundRecord>();
  private ledger: LedgerEntry[] = [];
  private idempotency = new Map<string, IdempotentResponse>();

  transaction<T>(fn: () => T): T {
    // Snapshot so a throw rolls back, matching the SQLite adapter.
    const snapshot = {
      accounts: new Map([...this.accounts].map(([k, v]) => [k, { ...v }])),
      rounds: new Map([...this.rounds].map(([k, v]) => [k, { ...v }])),
      ledger: this.ledger.length,
      idempotency: new Map(this.idempotency),
    };
    try {
      return fn();
    } catch (err) {
      this.accounts = snapshot.accounts;
      this.rounds = snapshot.rounds;
      this.ledger.length = snapshot.ledger;
      this.idempotency = snapshot.idempotency;
      throw err;
    }
  }

  createAccount(account: Account) {
    this.accounts.set(account.id, { ...account });
  }
  getAccount(id: string) {
    const a = this.accounts.get(id);
    return a && { ...a };
  }
  getAccountByTokenHash(tokenHash: string) {
    for (const a of this.accounts.values()) if (a.tokenHash === tokenHash) return { ...a };
    return undefined;
  }
  updateAccount(account: Account) {
    this.accounts.set(account.id, { ...account });
  }

  insertRound(round: RoundRecord) {
    this.rounds.set(round.id, { ...round });
  }
  updateRound(round: RoundRecord) {
    this.rounds.set(round.id, { ...round });
  }
  getRound(id: string) {
    const r = this.rounds.get(id);
    return r && { ...r };
  }
  getActiveRound(accountId: string) {
    for (const r of this.rounds.values()) {
      if (r.accountId === accountId && r.status === "running") return { ...r };
    }
    return undefined;
  }
  listRunningRounds() {
    return [...this.rounds.values()].filter((r) => r.status === "running").map((r) => ({ ...r }));
  }
  listRounds(accountId: string, limit: number) {
    return [...this.rounds.values()]
      .filter((r) => r.accountId === accountId)
      .sort((a, b) => b.nonce - a.nonce)
      .slice(0, limit)
      .map((r) => ({ ...r }));
  }

  addLedgerEntry(entry: LedgerEntry) {
    this.ledger.push({ ...entry });
  }
  listLedger(accountId: string, limit: number) {
    return this.ledger.filter((e) => e.accountId === accountId).slice(-limit).reverse();
  }

  getIdempotent(accountId: string, key: string) {
    return this.idempotency.get(`${accountId}:${key}`);
  }
  putIdempotent(accountId: string, key: string, response: IdempotentResponse) {
    this.idempotency.set(`${accountId}:${key}`, response);
  }

  close() {}
}
