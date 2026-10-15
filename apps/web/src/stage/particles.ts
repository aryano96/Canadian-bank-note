export type ParticleShape = "note" | "coin" | "star";

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vr: number;
  life: number;
  /** Life lost per frame. */
  decay: number;
  /** Downward pull per frame. */
  gravity: number;
  color: string;
  w: number;
  h: number;
  shape: ParticleShape;
}

const pick = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)]!;

/** Burst of tiny "banknote" rectangles (or coins). */
export function burst(x: number, y: number, colors: string[], count: number, power: number, shape: ParticleShape = "note"): Particle[] {
  return Array.from({ length: count }, () => {
    const a = Math.random() * Math.PI * 2;
    const s = (0.4 + Math.random()) * power;
    const size = shape === "coin" ? 7 + Math.random() * 5 : 6 + Math.random() * 8;
    return {
      x,
      y,
      vx: Math.cos(a) * s,
      vy: Math.sin(a) * s - power * 0.4,
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.3,
      life: 1,
      decay: 0.012,
      gravity: 0.25,
      color: pick(colors),
      w: size,
      h: shape === "coin" ? size : 3 + Math.random() * 4,
      shape,
    };
  });
}

/** A ring of sparkles that spreads out from a point and fades, with little gravity. */
export function sparkleRing(x: number, y: number, colors: string[], count: number, speed: number): Particle[] {
  return Array.from({ length: count }, (_, i) => {
    const a = (i / count) * Math.PI * 2 + Math.random() * 0.2;
    const s = speed * (0.8 + Math.random() * 0.4);
    const size = 5 + Math.random() * 4;
    return {
      x,
      y,
      vx: Math.cos(a) * s,
      vy: Math.sin(a) * s,
      rot: 0,
      vr: (Math.random() - 0.5) * 0.2,
      life: 1,
      decay: 0.022,
      gravity: 0.02,
      color: pick(colors),
      w: size,
      h: size,
      shape: "star",
    };
  });
}

/** One slow sparkle drifting upward, for the Golden round's ambience. */
export function driftSparkle(x: number, y: number, color: string): Particle {
  const size = 3 + Math.random() * 4;
  return {
    x,
    y,
    vx: (Math.random() - 0.5) * 0.3,
    vy: -0.3 - Math.random() * 0.4,
    rot: 0,
    vr: 0.02,
    life: 1,
    decay: 0.008 + Math.random() * 0.006,
    gravity: 0,
    color,
    w: size,
    h: size,
    shape: "star",
  };
}

function star(ctx: CanvasRenderingContext2D, r: number) {
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const d = i % 2 === 0 ? r : r * 0.28;
    ctx.lineTo(Math.cos(a) * d, Math.sin(a) * d);
  }
  ctx.closePath();
  ctx.fill();
}

export function stepParticles(ctx: CanvasRenderingContext2D, particles: Particle[], dt: number): Particle[] {
  const alive: Particle[] = [];
  for (const p of particles) {
    p.vy += p.gravity * dt;
    p.vx *= 0.99;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.rot += p.vr * dt;
    p.life -= p.decay * dt;
    if (p.life <= 0) continue;
    ctx.save();
    ctx.globalAlpha = Math.max(0, p.life);
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.fillStyle = p.color;
    if (p.shape === "note") {
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
    } else if (p.shape === "coin") {
      // A coin seen edge-on as it tumbles: squash it by its spin.
      ctx.scale(1, Math.max(0.15, Math.abs(Math.cos(p.rot * 2))));
      ctx.beginPath();
      ctx.arc(0, 0, p.w / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(90, 60, 0, 0.55)";
      ctx.lineWidth = 1.2;
      ctx.stroke();
    } else {
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 6;
      star(ctx, p.w);
    }
    ctx.restore();
    alive.push(p);
  }
  return alive;
}
