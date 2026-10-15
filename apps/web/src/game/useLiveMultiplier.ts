import { multiplierAt, type GameConfig } from "@mint-rush/engine";
import { useEffect, useState } from "react";
import { api } from "../api/client.ts";
import type { PublicRound } from "../api/types.ts";

/** Server-synchronised multiplier for text (≈20 fps). The canvas runs its own rAF loop. */
export function serverNow(): number {
  return Date.now() + api.clockOffset;
}

export function currentMultiplier(round: PublicRound, config: GameConfig): number {
  return multiplierAt(serverNow() - round.startedAt, config);
}

export function useLiveMultiplier(round: PublicRound | null, running: boolean, config: GameConfig): number {
  const [value, setValue] = useState(100);
  useEffect(() => {
    if (!round || !running) return;
    const tick = () => setValue(currentMultiplier(round, config));
    tick();
    const id = window.setInterval(tick, 50);
    return () => window.clearInterval(id);
  }, [round, running, config]);
  return value;
}
