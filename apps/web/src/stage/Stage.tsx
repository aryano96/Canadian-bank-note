import { elapsedFor, multiplierAt, type GameConfig } from "@mint-rush/engine";
import { useEffect, useRef } from "react";
import type { PublicRound } from "../api/types.ts";
import { serverNow } from "../game/useLiveMultiplier.ts";
import type { Phase } from "../game/useGame.ts";
import { drawGuilloche, mapleLeaf } from "./guilloche.ts";
import { readPalette, type StagePalette } from "./palette.ts";
import { burst, stepParticles, type Particle } from "./particles.ts";

interface Props {
  config: GameConfig;
  round: PublicRound | null;
  phase: Phase;
  theme: string;
  reducedMotion: boolean;
  onTick?: (multiplier: number) => void;
}

const PAD = { left: 52, right: 24, top: 24, bottom: 32 };

function niceStep(range: number): number {
  const raw = range / 4;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const n = raw / pow;
  return (n < 1.5 ? 1 : n < 3.5 ? 2 : n < 7.5 ? 5 : 10) * pow;
}

/**
 * The printing-press stage: a canvas drawing the multiplier curve over an
 * engraved guilloché backdrop. Runs its own requestAnimationFrame loop and
 * reads props through refs so React re-renders never interrupt the animation.
 */
export function Stage({ config, round, phase, theme, reducedMotion, onTick }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const live = useRef({ round, phase, reducedMotion, onTick });
  live.current = { round, phase, reducedMotion, onTick };

  const particles = useRef<Particle[]>([]);
  const shake = useRef(0);
  const tip = useRef({ x: 0, y: 0 });
  const palette = useRef<StagePalette | null>(null);
  const bg = useRef<HTMLCanvasElement | null>(null);
  const scale = useRef({ x: 8000, y: 200 });

  // Re-read colours and redraw the engraving when the theme changes.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    palette.current = readPalette(canvas);
    bg.current = null;
  }, [theme]);

  // Celebrate or shatter when a round settles.
  const settledKey = round && round.status !== "running" ? `${round.id}:${round.status}` : null;
  useEffect(() => {
    if (!settledKey || !round || !palette.current || reducedMotion) return;
    const p = palette.current;
    const { x, y } = tip.current;
    if (round.status === "lost") {
      particles.current.push(...burst(x, y, [p.loss, p.ink, p.holoA], 70, 7));
      shake.current = 14;
    } else if (round.payout > round.wager) {
      const colors = round.golden ? [p.gold, p.holoC, "#fff"] : [p.win, p.holoA, p.holoB, p.holoC];
      particles.current.push(...burst(x, y, colors, round.golden ? 120 : 80, 6));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settledKey]);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    let raf = 0;
    let last = performance.now();
    let width = 0;
    let height = 0;
    let dpr = 1;

    const resize = () => {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      bg.current = null;
    };
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(3, (now - last) / 16.67);
      last = now;
      const p = (palette.current ??= readPalette(canvas));
      const { round, phase, reducedMotion, onTick } = live.current;

      if (!bg.current && width > 0) {
        const off = document.createElement("canvas");
        off.width = width * dpr;
        off.height = height * dpr;
        const octx = off.getContext("2d")!;
        octx.scale(dpr, dpr);
        drawGuilloche(octx, width, height, p.ink);
        bg.current = off;
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      ctx.save();
      if (shake.current > 0.2) {
        ctx.translate((Math.random() - 0.5) * shake.current, (Math.random() - 0.5) * shake.current);
        shake.current *= 0.86;
      }
      if (bg.current) ctx.drawImage(bg.current, 0, 0, width, height);

      // What portion of the curve to draw.
      const running = round && (phase === "running" || phase === "cashing" || phase === "placing") && round.status === "running";
      let endMs = 0;
      let endM = 100;
      let ghostToM: number | null = null;
      if (round && running) {
        endMs = Math.max(0, serverNow() - round.startedAt);
        endM = multiplierAt(endMs, config);
        onTick?.(endM);
      } else if (round && round.status !== "running") {
        const final = round.status === "won" ? round.cashOutAt! : round.crashPoint ?? 100;
        endM = final;
        endMs = elapsedFor(final, config);
        if (round.status === "won" && round.crashPoint && round.crashPoint > final) ghostToM = round.crashPoint;
      }
      const ghostMs = ghostToM ? elapsedFor(ghostToM, config) : 0;

      // Smoothly re-scale the axes so the curve always has headroom.
      const targetX = Math.max(8000, Math.max(endMs, ghostMs) * 1.18);
      const targetY = Math.max(200, Math.max(endM, ghostToM ?? 0) * 1.18);
      const ease = reducedMotion ? 1 : 0.12 * dt;
      scale.current.x += (targetX - scale.current.x) * Math.min(1, ease);
      scale.current.y += (targetY - scale.current.y) * Math.min(1, ease);

      const plotW = width - PAD.left - PAD.right;
      const plotH = height - PAD.top - PAD.bottom;
      const sx = (ms: number) => PAD.left + (ms / scale.current.x) * plotW;
      const sy = (m: number) => PAD.top + plotH - ((m - 100) / (scale.current.y - 100)) * plotH;

      // Grid and axis labels.
      ctx.font = "500 11px 'JetBrains Mono', ui-monospace, monospace";
      ctx.fillStyle = p.text;
      ctx.strokeStyle = p.grid;
      ctx.lineWidth = 1;
      const yStep = niceStep(scale.current.y - 100);
      for (let m = 100; m <= scale.current.y; m += yStep) {
        const y = Math.round(sy(m)) + 0.5;
        ctx.beginPath();
        ctx.moveTo(PAD.left, y);
        ctx.lineTo(width - PAD.right, y);
        ctx.stroke();
        ctx.textAlign = "right";
        ctx.textBaseline = "middle";
        ctx.fillText(`${(m / 100).toFixed(m % 100 === 0 ? 0 : 1)}x`, PAD.left - 8, y);
      }
      const xStep = niceStep(scale.current.x / 1000) * 1000;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      for (let ms = 0; ms <= scale.current.x; ms += xStep) {
        ctx.fillText(`${Math.round(ms / 1000)}s`, sx(ms), height - PAD.bottom + 10);
      }

      if (round && endMs > 0) {
        const golden = round.golden;
        const lost = round.status === "lost";
        const grad = ctx.createLinearGradient(PAD.left, 0, width - PAD.right, 0);
        if (lost) {
          grad.addColorStop(0, p.loss);
          grad.addColorStop(1, p.loss);
        } else if (golden) {
          grad.addColorStop(0, p.gold);
          grad.addColorStop(1, p.holoC);
        } else {
          grad.addColorStop(0, p.holoA);
          grad.addColorStop(0.55, p.holoB);
          grad.addColorStop(1, p.holoC);
        }

        const steps = 140;
        const pts: [number, number][] = [];
        for (let i = 0; i <= steps; i++) {
          const ms = (endMs * i) / steps;
          pts.push([sx(ms), sy(Math.max(100, Math.exp((config.timing.growthRatePerSecond * ms) / 1000) * 100))]);
        }
        const [tx, ty] = pts[pts.length - 1]!;
        tip.current = { x: tx, y: ty };

        // Filled area with engraved micro-lines.
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(PAD.left, sy(100));
        pts.forEach(([x, y]) => ctx.lineTo(x, y));
        ctx.lineTo(tx, sy(100));
        ctx.closePath();
        ctx.clip();
        const fill = ctx.createLinearGradient(0, ty, 0, sy(100));
        fill.addColorStop(0, lost ? p.loss : golden ? p.gold : p.holoB);
        fill.addColorStop(1, "transparent");
        ctx.globalAlpha = 0.22;
        ctx.fillStyle = fill;
        ctx.fillRect(PAD.left, ty, tx - PAD.left, sy(100) - ty);
        ctx.globalAlpha = 0.18;
        ctx.strokeStyle = lost ? p.loss : golden ? p.gold : p.holoA;
        ctx.lineWidth = 0.7;
        for (let x = PAD.left - plotH; x < tx; x += 6) {
          ctx.beginPath();
          ctx.moveTo(x, sy(100));
          ctx.lineTo(x + plotH, sy(100) - plotH);
          ctx.stroke();
        }
        ctx.restore();

        // The curve itself, with a soft glow.
        ctx.save();
        ctx.lineJoin = "round";
        ctx.lineCap = "round";
        ctx.strokeStyle = grad;
        ctx.shadowColor = lost ? p.loss : golden ? p.gold : p.holoB;
        ctx.shadowBlur = 18;
        ctx.lineWidth = 4;
        ctx.beginPath();
        pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.stroke();
        ctx.restore();

        // Where the round would have crashed after a cash-out.
        if (ghostToM) {
          ctx.save();
          ctx.setLineDash([4, 6]);
          ctx.strokeStyle = p.text;
          ctx.globalAlpha = 0.6;
          ctx.lineWidth = 2;
          ctx.beginPath();
          for (let i = 0; i <= 60; i++) {
            const ms = endMs + ((ghostMs - endMs) * i) / 60;
            const x = sx(ms);
            const y = sy(Math.exp((config.timing.growthRatePerSecond * ms) / 1000) * 100);
            if (i) ctx.lineTo(x, y);
            else ctx.moveTo(x, y);
          }
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.fillStyle = p.loss;
          ctx.beginPath();
          ctx.arc(sx(ghostMs), sy(ghostToM), 4, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }

        // Maple leaf riding the tip, tilted along the curve.
        if (!lost) {
          const [px, py] = pts[pts.length - 2] ?? [tx - 1, ty];
          const angle = Math.atan2(ty - py, tx - px);
          ctx.save();
          ctx.translate(tx, ty);
          ctx.rotate(angle + Math.PI / 2);
          const size = 13 + (running && !reducedMotion ? Math.sin(now / 120) * 1.5 : 0);
          ctx.scale(size, size);
          mapleLeaf(ctx);
          ctx.shadowColor = golden ? p.gold : p.loss;
          ctx.shadowBlur = 16 / size;
          ctx.fillStyle = round.status === "won" ? p.win : golden ? p.gold : "#e0303f";
          ctx.fill();
          ctx.restore();
        }
      }

      if (particles.current.length) particles.current = stepParticles(ctx, particles.current, dt);
      ctx.restore();
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [config]);

  return <canvas ref={canvasRef} className="stage-canvas" aria-hidden="true" />;
}
