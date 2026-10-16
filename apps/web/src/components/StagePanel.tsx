import { useEffect, useRef, useState } from "react";
import type { CrowdPlayer, GameConfig } from "@mint-rush/engine";
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
  /** Id of the round that kept playing after the player cashed out. */
  playedOut: string | null;
  /** The simulated players on this round, for the cash-out tags that float off the lanterns. */
  crowd: CrowdPlayer[];
}

/** Four spots off to the sides, clear of the lanterns in the middle. */
const TAG_SLOTS = [
  { left: "3%", top: "40%" },
  { right: "3%", top: "48%" },
  { left: "3%", top: "58%" },
  { right: "3%", top: "66%" },
];

/** The latest few simulated cash-outs, shown as tags that drift up and fade. */
function CrowdTags({ crowd, live }: { crowd: CrowdPlayer[]; live: number }) {
  const { t, mult } = useI18n();
  // Each player keeps one spot, and back-to-back cash-outs land in different spots.
  const order = [...crowd].sort((a, b) => a.target - b.target || a.name.localeCompare(b.name));
  const recent = order.filter((p) => p.target <= live).slice(-3);
  return (
    <div className="crowd-tags" aria-hidden="true">
      {recent.map((p) => (
        <span key={p.name} className="crowd-tag" style={TAG_SLOTS[order.indexOf(p) % TAG_SLOTS.length]}>
          {t("crowd.tag", { name: p.name, multiplier: mult(p.target) })}
        </span>
      ))}
    </div>
  );
}

export function StagePanel({ config, round, phase, live, theme, reducedMotion, onTick, roundsUntilGolden, playedOut, crowd }: Props) {
  const { t, mult, money } = useI18n();
  const running = round?.status === "running" && (phase === "running" || phase === "cashing");
  // After a cash-out the round plays on to its crash point.
  const watching = phase === "watching" && round?.status === "won";
  const climbing = running || watching;
  const settled = round && round.status !== "running" && phase === "result" ? round : null;
  const lastSettled = round && round.status !== "running" ? round : null;
  const wasPlayedOut = !!round && round.id === playedOut;

  const finalOf = (r: PublicRound) => (r.status === "won" && !wasPlayedOut ? r.cashOutAt! : r.crashPoint!);
  const shown = climbing ? live : lastSettled && phase !== "placing" ? finalOf(lastSettled) : 100;
  const heat = climbing ? Math.min(1, Math.log(live / 100) / Math.log(20)) : 0;
  // Lanterns glow gold while the multiplier climbs, then turn green on a cash-out and red on a crash.
  // A round the player left still crashes red; their win stays on the badge and the stamp.
  const tone: LanternTone =
    climbing || phase === "placing" || !lastSettled ? "gold" : lastSettled.status === "won" && !wasPlayedOut ? "win" : "loss";
  const dim = !climbing && phase !== "placing" && !!lastSettled && !settled;
  // Rises fast at first so the change shows even in short rounds: about half at 2x, nearly full by 10x.
  const climb = (m: number) => Math.sqrt(Math.min(1, Math.max(0, Math.log(m / 100) / Math.log(20))));
  const glow = climbing ? climb(live) : 0;
  // The lanterns float up with the multiplier, stay where the round ended, and sink back for the next one.
  const rise = phase === "placing" || (!climbing && !lastSettled) ? 0 : climb(shown);
  const sparkle = (climbing && (round!.golden || live >= 500)) || (settled?.status === "won" && !wasPlayedOut);
  const showBadge = wasPlayedOut && (watching || !!settled);

  let status = "";
  if (phase === "placing") status = t("stage.starting");
  else if (running) status = round!.autoCashOut ? t("stage.autoArmed", { multiplier: mult(round!.autoCashOut) }) : "";
  else if (watching) status = t("stage.stillRunning");
  else if (lastSettled?.status === "won" && wasPlayedOut) status = t("stage.crashed", { multiplier: mult(lastSettled.crashPoint!) });
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
      className={`stage ${round?.golden && (climbing || settled) ? "is-golden" : ""} ${climbing ? "is-running" : ""} ${
        settled?.status === "lost" || (settled && wasPlayedOut) ? "is-crashed" : ""
      }`}
      style={{ "--heat": heat, "--warmth": warmth } as React.CSSProperties}
      aria-label="Game"
    >
      <div className="holo-stripe" aria-hidden="true" />
      <Stage config={config} round={round} phase={phase} theme={theme} reducedMotion={reducedMotion} onTick={onTick} />

      {round?.golden && (climbing || settled) && <div className="golden-banner">{t("stage.goldenBanner", { boost })}</div>}
      {showBadge && (
        <div className={`cashout-badge ${round!.golden ? "below-banner" : ""}`} data-testid="cashout-badge">
          ✓ {t("stage.youCashedOut", { multiplier: mult(round!.cashOutAt!), amount: money(round!.payout - round!.wager) })}
        </div>
      )}
      {climbing && !reducedMotion && <CrowdTags crowd={crowd} live={live} />}

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
            className={`lantern-lift ${climbing ? "is-climbing" : ""}`}
            ref={liftRoom.lift}
            // Smaller as it rises, as if drifting away.
            style={{ transform: `translateY(${-rise * liftRoom.room}px) scale(${1 - rise * 0.15})` }}
          >
            <Lanterns text={mult(shown)} tone={tone} glow={glow} dim={dim} sparkle={sparkle} resultKey={settled?.id} />
          </div>
          <div className="stage-readout">
            {status && <div className="stage-status">{status}</div>}
            {running && <div className="stage-potential mono">{t("stage.potential", { amount: money(potential) })}</div>}
            {watching && <div className="stage-potential mono win">{t("stage.payout", { amount: money(round!.payout) })}</div>}
            {settled?.status === "won" && wasPlayedOut && (
              <div className="stage-potential mono">
                {t("stage.leftAt", { cashOut: mult(settled.cashOutAt!), crash: mult(settled.crashPoint!) })}
              </div>
            )}
            {settled?.status === "won" && !wasPlayedOut && (
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
