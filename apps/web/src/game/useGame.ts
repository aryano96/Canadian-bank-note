import { elapsedFor, type GameConfig } from "@mint-rush/engine";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "../api/client.ts";
import type { PlayerState, PublicRound, RoundResult } from "../api/types.ts";
import { serverNow } from "./useLiveMultiplier.ts";

export type Phase = "loading" | "idle" | "placing" | "running" | "cashing" | "watching" | "result";

export interface GameError {
  code: string;
  id: number;
}

export type GameEvent =
  | { type: "started"; round: PublicRound }
  | { type: "won"; round: PublicRound }
  | { type: "lost"; round: PublicRound }
  /** A round the player already cashed out of has now reached its crash point. */
  | { type: "playedOut"; round: PublicRound };

/**
 * Client-side round state machine. The server is the authority on money and
 * outcomes; this hook only orchestrates requests and keeps the UI in sync.
 *
 *   idle → placing → running → (cashing →) result → idle
 *
 * After a cash-out the round keeps playing to its crash point, like a shared
 * table where everyone else is still in:
 *
 *   running → (cashing →) watching → result → idle
 */
export function useGame(config: GameConfig, onEvent: (e: GameEvent) => void) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [player, setPlayer] = useState<PlayerState | null>(null);
  const [round, setRound] = useState<PublicRound | null>(null);
  const [history, setHistory] = useState<PublicRound[]>([]);
  const [error, setError] = useState<GameError | null>(null);
  /** Id of the last round that kept playing after the player cashed out. */
  const [playedOut, setPlayedOut] = useState<string | null>(null);

  const watchAbort = useRef<AbortController | null>(null);
  const resultTimer = useRef<number>();
  const watchTimer = useRef<number>();
  const settledIds = useRef(new Set<string>());
  const eventRef = useRef(onEvent);
  eventRef.current = onEvent;

  const fail = useCallback((err: unknown) => {
    const code = err instanceof ApiError ? err.code : "NETWORK";
    setError({ code, id: Date.now() });
  }, []);

  const refreshHistory = useCallback(async () => {
    try {
      setHistory(await api.history(config.ui.historySize));
    } catch {}
  }, [config.ui.historySize]);

  const settle = useCallback(
    ({ round: settled, state }: RoundResult) => {
      if (settledIds.current.has(settled.id)) return;
      settledIds.current.add(settled.id);
      watchAbort.current?.abort();
      setRound(settled);
      setPlayer(state);
      eventRef.current({ type: settled.status === "won" ? "won" : "lost", round: settled });

      const finish = () => {
        setPhase("result");
        // The crash point joins the history only once the round reaches it, so it never spoils the play-out.
        setHistory((h) => [settled, ...h.filter((r) => r.id !== settled.id)].slice(0, config.ui.historySize));
        window.clearTimeout(resultTimer.current);
        resultTimer.current = window.setTimeout(
          () => setPhase((p) => (p === "result" ? "idle" : p)),
          config.timing.resultHoldMs,
        );
      };

      const crashAt = settled.startedAt + elapsedFor(settled.crashPoint!, config);
      const playOut = config.table.playOutAfterCashOut && settled.status === "won" && settled.crashPoint! > settled.cashOutAt!;
      if (!playOut || crashAt <= serverNow()) {
        setPlayedOut(null);
        return finish();
      }
      setPlayedOut(settled.id);
      setPhase("watching");
      window.clearTimeout(watchTimer.current);
      watchTimer.current = window.setTimeout(() => {
        eventRef.current({ type: "playedOut", round: settled });
        finish();
      }, crashAt - serverNow());
    },
    [config],
  );

  const follow = useCallback(
    (r: PublicRound) => {
      watchAbort.current?.abort();
      const ctrl = new AbortController();
      watchAbort.current = ctrl;
      void api.watchRound(r.id, settle, ctrl.signal);
    },
    [settle],
  );

  // Boot: restore or create a session and resume any round in flight.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      for (;;) {
        try {
          const state = await api.session();
          if (cancelled) return;
          setPlayer(state);
          await refreshHistory();
          if (state.activeRound) {
            setRound(state.activeRound);
            setPhase("running");
            follow(state.activeRound);
          } else {
            setPhase("idle");
          }
          return;
        } catch (err) {
          fail(err);
          await new Promise((r) => setTimeout(r, 2000));
        }
      }
    })();
    return () => {
      cancelled = true;
      watchAbort.current?.abort();
      window.clearTimeout(watchTimer.current);
      window.clearTimeout(resultTimer.current);
    };
  }, [follow, refreshHistory, fail]);

  const placeBet = useCallback(
    async (wager: number, autoCashOut: number | null, currency: string) => {
      if (phase !== "idle" && phase !== "result") return;
      window.clearTimeout(resultTimer.current);
      setPhase("placing");
      try {
        const { round: r, state } = await api.placeBet(wager, autoCashOut, currency);
        setPlayer(state);
        setRound(r);
        setPhase("running");
        eventRef.current({ type: "started", round: r });
        follow(r);
      } catch (err) {
        fail(err);
        setPhase("idle");
        if (err instanceof ApiError && err.code === "ROUND_IN_PROGRESS") {
          const state = await api.me();
          setPlayer(state);
          if (state.activeRound) {
            setRound(state.activeRound);
            setPhase("running");
            follow(state.activeRound);
          }
        }
      }
    },
    [phase, follow, fail],
  );

  const cashOut = useCallback(async () => {
    if (phase !== "running" || !round) return;
    setPhase("cashing");
    try {
      settle(await api.cashOut(round.id));
    } catch (err) {
      // ROUND_OVER means we lost the race with the crash; the stream delivers the result.
      if (!(err instanceof ApiError && err.code === "ROUND_OVER")) fail(err);
      setPhase((p) => (p === "cashing" ? "running" : p));
    }
  }, [phase, round, settle, fail]);

  const deposit = useCallback(
    async (amount: number, currency: string) => {
      try {
        setPlayer((await api.deposit(amount, currency)).state);
        return true;
      } catch (err) {
        fail(err);
        return false;
      }
    },
    [fail],
  );

  const topUp = useCallback(async (currency: string) => {
    try {
      setPlayer(await api.topUp(currency));
    } catch (err) {
      fail(err);
    }
  }, [fail]);

  const setClientSeed = useCallback(
    async (seed: string) => {
      try {
        setPlayer(await api.setClientSeed(seed));
        return true;
      } catch (err) {
        fail(err);
        return false;
      }
    },
    [fail],
  );

  return {
    phase,
    player,
    round,
    history,
    playedOut,
    error,
    clearError: () => setError(null),
    placeBet,
    cashOut,
    topUp,
    deposit,
    setClientSeed,
  };
}
