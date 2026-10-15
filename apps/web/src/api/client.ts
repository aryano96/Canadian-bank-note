import type { GameConfig } from "@mint-rush/engine";
import type { PlayerState, PublicRound, RoundResult, Simulation, Stats } from "./types.ts";

export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

const TOKEN_KEY = "mint-rush.token";

function readToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function writeToken(token: string) {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {}
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Thin typed client. Money-moving calls carry an Idempotency-Key and are
 * retried on network failure with the same key, so a flaky connection can
 * never double-charge a bet or double-pay a cash-out.
 */
export class Api {
  private token = readToken();
  /** serverTime ≈ Date.now() + clockOffset */
  clockOffset = 0;

  async config(): Promise<GameConfig> {
    return this.request("GET", "/api/config", undefined, { auth: false });
  }

  private sessionPromise: Promise<PlayerState> | null = null;

  /** Restores the saved session or creates a guest. Concurrent callers share one request. */
  session(): Promise<PlayerState> {
    this.sessionPromise ??= this.openSession().finally(() => (this.sessionPromise = null));
    return this.sessionPromise;
  }

  private async openSession(): Promise<PlayerState> {
    if (this.token) {
      try {
        return await this.me();
      } catch (err) {
        if (!(err instanceof ApiError && err.code === "UNAUTHORIZED")) throw err;
      }
    }
    const res = await this.request<{ token: string; state: PlayerState }>("POST", "/api/session", undefined, { auth: false });
    this.token = res.token;
    writeToken(res.token);
    this.syncClock(res.state.serverNow, 0);
    return res.state;
  }

  async me(): Promise<PlayerState> {
    const sent = Date.now();
    const state = await this.request<PlayerState>("GET", "/api/me");
    this.syncClock(state.serverNow, Date.now() - sent);
    return state;
  }

  placeBet(wager: number, autoCashOut: number | null, currency: string): Promise<RoundResult> {
    return this.mutate("POST", "/api/bets", { wager, autoCashOut, currency });
  }

  cashOut(roundId: string): Promise<RoundResult> {
    return this.mutate("POST", `/api/rounds/${roundId}/cashout`);
  }

  round(id: string): Promise<PublicRound> {
    return this.request("GET", `/api/rounds/${id}`);
  }

  history(limit: number): Promise<PublicRound[]> {
    return this.request("GET", `/api/history?limit=${limit}`);
  }

  stats(currency: string): Promise<Stats> {
    return this.request("GET", `/api/stats?currency=${encodeURIComponent(currency)}`);
  }

  setClientSeed(clientSeed: string): Promise<PlayerState> {
    return this.request("PUT", "/api/seed", { clientSeed });
  }

  topUp(currency: string): Promise<PlayerState> {
    return this.request("POST", "/api/topup", { currency });
  }

  simulate(target: number, rounds: number): Promise<Simulation> {
    return this.request("GET", `/api/simulate?target=${target}&rounds=${rounds}`, undefined, { auth: false });
  }

  /**
   * Follows a round's server-sent events until it settles. Uses fetch (not
   * EventSource) so the auth header stays out of the URL.
   */
  async watchRound(id: string, onSettled: (r: RoundResult) => void, signal: AbortSignal): Promise<void> {
    while (!signal.aborted) {
      try {
        const res = await fetch(`/api/rounds/${id}/stream`, { headers: this.headers(), signal });
        if (!res.ok || !res.body) throw new Error(`stream ${res.status}`);
        const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
        let buffer = "";
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += value;
          let idx;
          while ((idx = buffer.indexOf("\n\n")) >= 0) {
            const chunk = buffer.slice(0, idx);
            buffer = buffer.slice(idx + 2);
            const event = /^event: (.*)$/m.exec(chunk)?.[1];
            const data = /^data: (.*)$/m.exec(chunk)?.[1];
            if (event === "settled" && data) return onSettled(JSON.parse(data));
            if (event === "round" && data) {
              const { round } = JSON.parse(data) as { round: PublicRound };
              if (round.status !== "running") return onSettled({ round, state: await this.me() });
            }
          }
        }
      } catch (err) {
        if (signal.aborted) return;
      }
      // Stream dropped: fall back to asking directly, then reconnect.
      await sleep(500);
      try {
        const round = await this.round(id);
        if (round.status !== "running") return onSettled({ round, state: await this.me() });
      } catch {}
    }
  }

  private syncClock(serverNow: number, rtt: number) {
    this.clockOffset = serverNow + rtt / 2 - Date.now();
  }

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    return { ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}), ...extra };
  }

  private async mutate<T>(method: string, path: string, body?: unknown): Promise<T> {
    const key = crypto.randomUUID();
    let lastError: unknown;
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const sent = Date.now();
        const result = await this.request<T>(method, path, body, { idempotencyKey: key });
        const state = (result as { state?: PlayerState }).state;
        if (state) this.syncClock(state.serverNow, Date.now() - sent);
        return result;
      } catch (err) {
        if (err instanceof ApiError) throw err; // the server answered; retrying won't change it
        lastError = err;
        await sleep(200 * 2 ** attempt);
      }
    }
    throw lastError;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    opts: { auth?: boolean; idempotencyKey?: string } = {},
  ): Promise<T> {
    const headers: Record<string, string> = opts.auth === false ? {} : this.headers();
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (opts.idempotencyKey) headers["Idempotency-Key"] = opts.idempotencyKey;
    const res = await fetch(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const e = (json as { error?: { code?: string; message?: string } }).error;
      throw new ApiError(e?.code ?? "INTERNAL", e?.message ?? res.statusText, res.status);
    }
    return json as T;
  }
}

export const api = new Api();
