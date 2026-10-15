import { EventEmitter } from "node:events";
import {
  autoCashOutTime,
  cashOut as engineCashOut,
  computeCrashPoint,
  crashTime,
  evaluate,
  isGoldenRound,
  randomSeed,
  roundsUntilGolden,
  sha256Hex,
  type GameConfig,
  type Hundredths,
  type Outcome,
} from "@mint-rush/engine";
import { GameError } from "./errors.ts";
import type { Account, RoundRecord, Store } from "./store/types.ts";

export type Clock = () => number;

/** What a player may see about a round. Seed and crash point stay secret until it ends. */
export interface PublicRound {
  id: string;
  nonce: number;
  wager: number;
  autoCashOut: Hundredths | null;
  golden: boolean;
  startedAt: number;
  status: RoundRecord["status"];
  serverSeedHash: string;
  clientSeed: string;
  cashOutAt: Hundredths | null;
  payout: number;
  bonus: number;
  settledAt: number | null;
  crashPoint?: Hundredths;
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

export function toPublicRound(r: RoundRecord): PublicRound {
  const base: PublicRound = {
    id: r.id,
    nonce: r.nonce,
    wager: r.wager,
    autoCashOut: r.autoCashOut,
    golden: r.golden,
    startedAt: r.startedAt,
    status: r.status,
    serverSeedHash: r.serverSeedHash,
    clientSeed: r.clientSeed,
    cashOutAt: r.cashOutAt,
    payout: r.payout,
    bonus: r.bonus,
    settledAt: r.settledAt,
  };
  if (r.status === "running") return base;
  return { ...base, crashPoint: r.crashPoint, serverSeed: r.serverSeed };
}

/**
 * All game rules that touch money or state. Routes stay thin; the engine
 * stays pure; this class glues them to a Store and a clock.
 */
export class GameService {
  /** Emits `settled:<roundId>` with the PublicRound when a round ends. */
  readonly events = new EventEmitter();
  private timers = new Map<string, NodeJS.Timeout>();

  constructor(
    private store: Store,
    readonly config: GameConfig,
    private now: Clock = Date.now,
  ) {
    this.events.setMaxListeners(0);
  }

  // ---- accounts -------------------------------------------------------

  async createGuest(): Promise<{ token: string; account: Account }> {
    const token = randomSeed(24);
    const nextServerSeed = randomSeed();
    const account: Account = {
      id: crypto.randomUUID(),
      tokenHash: await sha256Hex(token),
      balance: this.config.account.startingBalance,
      clientSeed: randomSeed(8),
      nonce: 0,
      nextServerSeed,
      nextServerSeedHash: await sha256Hex(nextServerSeed),
      createdAt: this.now(),
    };
    this.store.transaction(() => {
      this.store.createAccount(account);
      this.store.addLedgerEntry({
        accountId: account.id,
        roundId: null,
        type: "topup",
        amount: account.balance,
        balanceAfter: account.balance,
        createdAt: account.createdAt,
      });
    });
    return { token, account };
  }

  async authenticate(token: string | undefined): Promise<Account> {
    if (!token) throw new GameError("UNAUTHORIZED", "Missing session token");
    const account = this.store.getAccountByTokenHash(await sha256Hex(token));
    if (!account) throw new GameError("UNAUTHORIZED", "Unknown session token");
    return account;
  }

  state(accountId: string): PlayerState {
    this.settleIfDue(accountId);
    const account = this.mustGetAccount(accountId);
    const active = this.store.getActiveRound(accountId);
    const nextNonce = account.nonce + 1;
    return {
      balance: account.balance,
      clientSeed: account.clientSeed,
      nonce: account.nonce,
      nextServerSeedHash: account.nextServerSeedHash,
      roundsUntilGolden: roundsUntilGolden(nextNonce, this.config),
      nextRoundGolden: isGoldenRound(nextNonce, this.config),
      activeRound: active ? toPublicRound(active) : null,
      serverNow: this.now(),
    };
  }

  setClientSeed(accountId: string, clientSeed: string): PlayerState {
    this.store.transaction(() => {
      if (this.store.getActiveRound(accountId)) {
        throw new GameError("SEED_LOCKED", "Finish the current round before changing seeds");
      }
      const account = this.mustGetAccount(accountId);
      this.store.updateAccount({ ...account, clientSeed });
    });
    return this.state(accountId);
  }

  topUp(accountId: string): PlayerState {
    this.settleIfDue(accountId);
    this.store.transaction(() => {
      const account = this.mustGetAccount(accountId);
      if (account.balance >= this.config.betting.minBet || this.store.getActiveRound(accountId)) {
        throw new GameError("TOP_UP_NOT_NEEDED", "Top-ups are only available when you can no longer bet");
      }
      const balance = account.balance + this.config.account.topUpAmount;
      this.store.updateAccount({ ...account, balance });
      this.store.addLedgerEntry({
        accountId,
        roundId: null,
        type: "topup",
        amount: this.config.account.topUpAmount,
        balanceAfter: balance,
        createdAt: this.now(),
      });
    });
    return this.state(accountId);
  }

  // ---- rounds ---------------------------------------------------------

  async placeBet(accountId: string, wager: number, autoCashOut: Hundredths | null): Promise<PublicRound> {
    const { betting } = this.config;
    if (wager < betting.minBet) throw new GameError("BET_TOO_SMALL", `Minimum bet is ${betting.minBet}`);
    if (wager > betting.maxBet) throw new GameError("BET_TOO_LARGE", `Maximum bet is ${betting.maxBet}`);
    const minAuto = Math.round(betting.minAutoCashOut * 100);
    const maxAuto = Math.round(this.config.rng.maxMultiplier * 100);
    if (autoCashOut !== null && (autoCashOut < minAuto || autoCashOut > maxAuto)) {
      throw new GameError("INVALID_AUTO_CASH_OUT", `Auto cash-out must be between ${minAuto / 100}x and ${maxAuto / 100}x`);
    }

    this.settleIfDue(accountId);
    const before = this.mustGetAccount(accountId);
    if (this.store.getActiveRound(accountId)) throw new GameError("ROUND_IN_PROGRESS", "A round is already running");
    if (before.balance < wager) throw new GameError("INSUFFICIENT_FUNDS", "Not enough balance for this bet");

    // Hashing is async, so do it first, then commit atomically and re-check
    // nothing moved underneath us (a concurrent bet would have bumped the nonce).
    const nonce = before.nonce + 1;
    const serverSeed = before.nextServerSeed;
    const { crashPoint } = await computeCrashPoint(serverSeed, before.clientSeed, nonce, this.config);
    const nextServerSeed = randomSeed();
    const nextServerSeedHash = await sha256Hex(nextServerSeed);

    const round = this.store.transaction(() => {
      const account = this.mustGetAccount(accountId);
      if (account.nonce !== before.nonce || account.clientSeed !== before.clientSeed) {
        throw new GameError("CONFLICT", "Account changed while placing the bet, please retry");
      }
      if (this.store.getActiveRound(accountId)) throw new GameError("ROUND_IN_PROGRESS", "A round is already running");
      if (account.balance < wager) throw new GameError("INSUFFICIENT_FUNDS", "Not enough balance for this bet");

      const startedAt = this.now();
      const round: RoundRecord = {
        id: crypto.randomUUID(),
        accountId,
        nonce,
        wager,
        autoCashOut,
        golden: isGoldenRound(nonce, this.config),
        crashPoint,
        serverSeed,
        serverSeedHash: account.nextServerSeedHash,
        clientSeed: account.clientSeed,
        startedAt,
        status: "running",
        cashOutAt: null,
        payout: 0,
        bonus: 0,
        settledAt: null,
      };
      const balance = account.balance - wager;
      this.store.updateAccount({ ...account, balance, nonce, nextServerSeed, nextServerSeedHash });
      this.store.insertRound(round);
      this.store.addLedgerEntry({ accountId, roundId: round.id, type: "bet", amount: -wager, balanceAfter: balance, createdAt: startedAt });
      return round;
    });

    this.schedule(round);
    return toPublicRound(round);
  }

  cashOut(accountId: string, roundId: string): PublicRound {
    const round = this.store.getRound(roundId);
    if (!round || round.accountId !== accountId) throw new GameError("ROUND_NOT_FOUND", "No such round");
    if (round.status !== "running") throw new GameError("ROUND_OVER", "This round has already ended");
    const settled = this.applyOutcome(round, engineCashOut(round, this.now(), this.config));
    if (settled.status === "lost") throw new GameError("ROUND_OVER", "Too late, the round crashed");
    return settled;
  }

  getRound(accountId: string, roundId: string): PublicRound {
    this.settleIfDue(accountId);
    const round = this.store.getRound(roundId);
    if (!round || round.accountId !== accountId) throw new GameError("ROUND_NOT_FOUND", "No such round");
    return toPublicRound(round);
  }

  history(accountId: string, limit: number): PublicRound[] {
    this.settleIfDue(accountId);
    return this.store.listRounds(accountId, limit).map(toPublicRound);
  }

  stats(accountId: string) {
    this.settleIfDue(accountId);
    const rounds = this.store.listRounds(accountId, 10_000).filter((r) => r.status !== "running");
    const wagered = rounds.reduce((s, r) => s + r.wager, 0);
    const returned = rounds.reduce((s, r) => s + r.payout, 0);
    const wins = rounds.filter((r) => r.status === "won");
    const ledger = this.store.listLedger(accountId, 200).reverse();
    return {
      rounds: rounds.length,
      wins: wins.length,
      winRate: rounds.length ? wins.length / rounds.length : 0,
      wagered,
      returned,
      net: returned - wagered,
      rtp: wagered ? returned / wagered : null,
      bestMultiplier: wins.reduce((m, r) => Math.max(m, r.cashOutAt ?? 0), 0) || null,
      biggestWin: wins.reduce((m, r) => Math.max(m, r.payout - r.wager), 0),
      highestCrash: rounds.reduce((m, r) => Math.max(m, r.crashPoint), 0) || null,
      balanceSeries: ledger.map((e) => ({ t: e.createdAt, balance: e.balanceAfter })),
    };
  }

  // ---- settlement -----------------------------------------------------

  /** Re-arm timers after a restart so no round is left hanging. */
  recover() {
    for (const round of this.store.listRunningRounds()) this.schedule(round);
  }

  shutdown() {
    for (const t of this.timers.values()) clearTimeout(t);
    this.timers.clear();
  }

  private schedule(round: RoundRecord) {
    const endsAt = Math.min(autoCashOutTime(round, this.config), crashTime(round, this.config));
    const delay = Math.max(0, Math.ceil(endsAt - this.now()));
    const timer = setTimeout(() => {
      this.timers.delete(round.id);
      const current = this.store.getRound(round.id);
      if (current?.status === "running") this.applyOutcome(current, evaluate(current, this.now(), this.config));
    }, delay);
    timer.unref?.();
    this.timers.set(round.id, timer);
  }

  private settleIfDue(accountId: string) {
    const round = this.store.getActiveRound(accountId);
    if (round) this.applyOutcome(round, evaluate(round, this.now(), this.config));
  }

  private applyOutcome(round: RoundRecord, outcome: Outcome): PublicRound {
    if (outcome.status === "running") return toPublicRound(round);
    const settled = this.store.transaction(() => {
      const fresh = this.store.getRound(round.id)!;
      if (fresh.status !== "running") return fresh; // someone else settled it first
      const updated: RoundRecord = {
        ...fresh,
        status: outcome.status,
        cashOutAt: outcome.status === "won" ? outcome.cashOutAt : null,
        payout: outcome.payout,
        bonus: outcome.status === "won" ? outcome.bonus : 0,
        settledAt: outcome.settledAt,
      };
      this.store.updateRound(updated);
      if (outcome.payout > 0) {
        const account = this.mustGetAccount(round.accountId);
        const balance = account.balance + outcome.payout;
        this.store.updateAccount({ ...account, balance });
        this.store.addLedgerEntry({
          accountId: account.id,
          roundId: round.id,
          type: "payout",
          amount: outcome.payout,
          balanceAfter: balance,
          createdAt: outcome.settledAt,
        });
      }
      return updated;
    });
    const timer = this.timers.get(round.id);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(round.id);
    }
    const view = toPublicRound(settled);
    this.events.emit(`settled:${round.id}`, view);
    return view;
  }

  private mustGetAccount(id: string): Account {
    const account = this.store.getAccount(id);
    if (!account) throw new GameError("UNAUTHORIZED", "Account not found");
    return account;
  }
}
