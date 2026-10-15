import { useEffect, useRef, useState } from "react";
import type { GameConfig } from "@mint-rush/engine";
import { computePayout } from "@mint-rush/engine";
import type { PublicRound } from "../api/types.ts";
import type { Phase } from "../game/useGame.ts";
import { useI18n } from "../i18n/index.tsx";
import { Stage } from "../stage/Stage.tsx";
import { Lanterns, type LanternTone } from "./Lanterns.tsx";

/** How far the lanterns can float up: the free space above them in the stage. */
function useLiftRoom(shown: boolean) {
  const overlay = useRef<HTMLDivElement>(null);
  const lift = useRef<HTMLDivElement>(null);
  const [room, setRoom] = useState(0);
  useEffect(() => {
    const o = overlay.current;
    const l = lift.current;
    if (!o || !l) return;
    const measure = () => setRoom(Math.max(0, l.offsetTop - 8));
    const ro = new ResizeObserver(measure);
    ro.observe(o);
    ro.observe(l);
    measure();
    return () => ro.disconnect();
  }, [shown]);
  return { overlay, lift, room };
}

interface Props {
  config: GameConfig;
  round: PublicRound | null;
  phase: Phase;
  live: number;
  theme: string;
  reducedMotion: boolean;
  onTick: (m: number) => void;
  /** Normal rounds left before the next Golden round (0: the next one is Golden). */
  roundsUntilGolden: number | null;
}

export function StagePanel({ config, round, phase, live, theme, reducedMotion, onTick, roundsUntilGolden }: Props) {
  const { t, mult, money } = useI18n();
  const running = round?.status === "running" && (phase === "running" || phase === "cashing");
  const settled = round && round.status !== "running" && phase === "result" ? round : null;
  const lastSettled = round && round.status !== "running" ? round : null;

  const finalOf = (r: PublicRound) => (r.status === "won" ? r.cashOutAt! : r.crashPoint!);
  const shown = running ? live : lastSettled && phase !== "placing" ? finalOf(lastSettled) : 100;
  const heat = running ? Math.min(1, Math.log(live / 100) / Math.log(20)) : 0;
  // Lanterns glow gold while the multiplier climbs, then turn green on a cash-out and red on a crash.
  const tone: LanternTone = running || phase === "placing" || !lastSettled ? "gold" : lastSettled.status === "won" ? "win" : "loss";
  const dim = !running && phase !== "placing" && !!lastSettled && !settled;
  // Rises fast at first so the change shows even in short rounds: about half at 2x, nearly full by 10x.
  const climb = (m: number) => Math.sqrt(Math.min(1, Math.max(0, Math.log(m / 100) / Math.log(20))));
  const glow = running ? climb(live) : 0;
  // The lanterns float up with the multiplier, stay where the round ended, and sink back for the next one.
  const rise = phase === "placing" || (!running && !lastSettled) ? 0 : climb(shown);
  const sparkle = (running && (round!.golden || live >= 500)) || settled?.status === "won";

  let status = "";
  if (phase === "placing") status = t("stage.starting");
  else if (running) status = round!.autoCashOut ? t("stage.autoArmed", { multiplier: mult(round!.autoCashOut) }) : "";
  else if (lastSettled?.status === "won") status = t("stage.cashedOut", { multiplier: mult(lastSettled.cashOutAt!) });
  else if (lastSettled?.status === "lost") status = t("stage.crashed", { multiplier: mult(lastSettled.crashPoint!) });
  else status = t("stage.idle");

  const potential = running ? computePayout(round!.wager, live, round!.golden, config).payout : 0;
  const boost = Math.round(config.bonus.goldenMultiplierBoost * 100);
  // The stage edges warm up over the last few rounds before a Golden round.
  const warmth = !running && roundsUntilGolden !== null && roundsUntilGolden <= 3 ? (4 - roundsUntilGolden) / 4 : 0;
  const goldenNext = roundsUntilGolden === 0 && phase === "idle";
  const liftRoom = useLiftRoom(!goldenNext);

  return (
    <section
      className={`stage ${round?.golden && (running || settled) ? "is-golden" : ""} ${running ? "is-running" : ""} ${
        settled?.status === "lost" ? "is-crashed" : ""
      }`}
      style={{ "--heat": heat, "--warmth": warmth } as React.CSSProperties}
      aria-label="Game"
    >
      <div className="holo-stripe" aria-hidden="true" />
      <Stage config={config} round={round} phase={phase} theme={theme} reducedMotion={reducedMotion} onTick={onTick} />

      {round?.golden && (running || settled) && <div className="golden-banner">{t("stage.goldenBanner", { boost })}</div>}

      {goldenNext ? (
        <div className="stage-overlay golden-next">
          <div className={`loonie ${reducedMotion ? "still" : ""}`} aria-hidden="true">
            <span>$1</span>
          </div>
          <div className="golden-next-title">{t("stage.goldenNextTitle")}</div>
          <div className="stage-status">{t("stage.goldenNextBody", { boost })}</div>
        </div>
      ) : (
        <div className="stage-overlay lantern-overlay" ref={liftRoom.overlay}>
          <div
            className={`lantern-lift ${running ? "is-climbing" : ""}`}
            ref={liftRoom.lift}
            // Smaller as it rises, as if drifting away.
            style={{ transform: `translateY(${-rise * liftRoom.room}px) scale(${1 - rise * 0.15})` }}
          >
            <Lanterns text={mult(shown)} tone={tone} glow={glow} dim={dim} sparkle={sparkle} resultKey={settled?.id} />
          </div>
          <div className="stage-readout">
            {status && <div className="stage-status">{status}</div>}
            {running && <div className="stage-potential mono">{t("stage.potential", { amount: money(potential) })}</div>}
            {settled?.status === "won" && (
              <div className="stage-potential mono win">
                {t("stage.profit", {
                  amount: money(settled.payout - settled.wager),
                })}
              </div>
            )}
            {settled?.status === "won" && settled.bonus > 0 && (
              <div className="bonus-chip mono">{t("stage.bonusChip", { boost, amount: money(settled.bonus) })}</div>
            )}
          </div>
        </div>
      )}

      {settled && (
        <div key={settled.id} className={`stamp ${settled.status === "won" ? "stamp-win" : "stamp-loss"}`} aria-hidden="true">
          {settled.status === "won" ? t("stage.stampWin") : t("stage.stampLoss")}
        </div>
      )}
    </section>
  );
}
