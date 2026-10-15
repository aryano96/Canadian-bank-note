import { multiplierAt, type GameConfig } from "@mint-rush/engine";
import { useEffect, useRef } from "react";
import type { PublicRound } from "../api/types.ts";
import { serverNow } from "../game/useLiveMultiplier.ts";
import type { Phase } from "../game/useGame.ts";
import { drawGuilloche } from "./guilloche.ts";
import { readPalette, type StagePalette } from "./palette.ts";
import { burst, driftSparkle, sparkleRing, stepParticles, type Particle } from "./particles.ts";

interface Props {
  config: GameConfig;
  round: PublicRound | null;
  phase: Phase;
  theme: string;
  reducedMotion: boolean;
  onTick?: (multiplier: number) => void;
}

interface Mote {
  x: number;
  y: number;
  r: number;
  depth: number;
  lantern: boolean;
}

function makeMotes(width: number, height: number): Mote[] {
  return Array.from({ length: 36 }, (_, i) => ({
    x: Math.random() * width,
    y: Math.random() * height,
    r: 1 + Math.random() * 2,
    depth: 0.35 + Math.random() * 0.9,
    lantern: i % 6 === 0,
  }));
}

function drawMote(ctx: CanvasRenderingContext2D, m: Mote, p: StagePalette) {
  ctx.save();
  if (m.lantern) {
    // A tiny far-off sky lantern: a warm body with a soft glow around it.
    const w = 5 * m.depth + 3;
    const h = w * 1.3;
    const glow = ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, w * 2.4);
    glow.addColorStop(0, "rgba(255, 170, 60, 0.35)");
    glow.addColorStop(1, "rgba(255, 170, 60, 0)");
    ctx.fillStyle = glow;
    ctx.fillRect(m.x - w * 2.4, m.y - w * 2.4, w * 4.8, w * 4.8);
    ctx.globalAlpha = 0.45 + m.depth * 0.35;
    ctx.fillStyle = "#ffb347";
    ctx.beginPath();
    ctx.roundRect(m.x - w / 2, m.y - h / 2, w, h, [w * 0.45, w * 0.45, w * 0.2, w * 0.2]);
    ctx.fill();
  } else {
    ctx.globalAlpha = 0.25 + m.depth * 0.35;
    ctx.fillStyle = m.depth > 0.8 ? "#ffd27a" : p.gold;
    ctx.beginPath();
    ctx.arc(m.x, m.y, m.r * m.depth, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** Middle of the big lantern in canvas coordinates, so bursts come from the lantern itself. */
function lanternCentre(canvas: HTMLCanvasElement, width: number, height: number) {
  const svg = canvas.parentElement?.querySelector(".lanterns svg");
  if (!svg) return { x: width / 2, y: height * 0.42 };
  const c = canvas.getBoundingClientRect();
  const r = svg.getBoundingClientRect();
  // The main lantern sits at (200, 120) in the viewBox, which spans y 20 to 268.
  return { x: r.left - c.left + r.width * 0.5, y: r.top - c.top + r.height * (100 / 248) };
}

/**
 * The printing-press stage: a canvas with the engraved guilloché backdrop and the
 * sparks, coins and shakes around the lanterns. Runs its own requestAnimationFrame loop and
 * reads props through refs so React re-renders never interrupt the animation.
 */
export function Stage({ config, round, phase, theme, reducedMotion, onTick }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const live = useRef({ round, phase, reducedMotion, onTick });
  live.current = { round, phase, reducedMotion, onTick };

  const particles = useRef<Particle[]>([]);
  const shake = useRef(0);
  const palette = useRef<StagePalette | null>(null);
  const bg = useRef<HTMLCanvasElement | null>(null);
  const motes = useRef<Mote[]>([]);

  // Re-read colours and redraw the engraving when the theme changes.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // The parent applies data-theme in its own effect, which runs after ours; read on the next frame.
    const id = requestAnimationFrame(() => {
      palette.current = readPalette(canvas);
      bg.current = null;
    });
    return () => cancelAnimationFrame(id);
  }, [theme]);

  // Celebrate or shatter when a round settles.
  const settledKey = round && round.status !== "running" ? `${round.id}:${round.status}` : null;
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!settledKey || !round || !palette.current || !canvas || reducedMotion) return;
    const p = palette.current;
    const { x, y } = lanternCentre(canvas, canvas.clientWidth, canvas.clientHeight);
    if (round.status === "lost") {
      particles.current.push(...burst(x, y, [p.loss, p.ink, p.holoA], 50, 6));
      shake.current = 8;
    } else if (round.golden) {
      // Golden cash-out: a shower of loonies with sparkles.
      particles.current.push(...burst(x, y, [p.gold, p.holoC], 45, 7, "coin"));
      particles.current.push(...sparkleRing(x, y, [p.gold, "#fff8e1", p.holoC], 28, 4));
      particles.current.push(...burst(x, y, [p.gold, "#fff"], 50, 5));
    } else if (round.payout > round.wager) {
      particles.current.push(...sparkleRing(x, y, [p.win, "#eaffea"], 22, 3.2));
      particles.current.push(...burst(x, y, [p.win, p.holoA, p.holoB, p.holoC], 60, 6));
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
      motes.current = [];
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

      // Report the live multiplier; the lanterns draw it, the canvas only adds the backdrop and effects.
      const running = round && (phase === "running" || phase === "cashing" || phase === "placing") && round.status === "running";
      let lift = 0;
      if (round && running) {
        const m = multiplierAt(Math.max(0, serverNow() - round.startedAt), config);
        onTick?.(m);
        lift = Math.sqrt(Math.min(1, Math.log(m / 100) / Math.log(20)));
      }

      // Embers and far-off lanterns slide down past the trio while it climbs, faster as the multiplier grows,
      // and drift gently upward between rounds.
      if (motes.current.length === 0 && width > 0) motes.current = makeMotes(width, height);
      const speed = reducedMotion ? 0 : running ? (0.6 + lift * 5) * dt : -0.15 * dt;
      for (const m of motes.current) {
        m.y += speed * m.depth;
        if (m.y > height + 20) m.y -= height + 40;
        if (m.y < -20) m.y += height + 40;
        drawMote(ctx, m, p);
      }

      // A few slow sparkles drift up through a running Golden round.
      if (round?.golden && running && !reducedMotion && Math.random() < 0.12 * dt) {
        const sx0 = width * (0.1 + Math.random() * 0.8);
        const sy0 = height * (0.35 + Math.random() * 0.6);
        particles.current.push(driftSparkle(sx0, sy0, Math.random() < 0.7 ? p.gold : "#fff8e1"));
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
