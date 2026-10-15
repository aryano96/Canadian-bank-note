export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vr: number;
  life: number;
  color: string;
  w: number;
  h: number;
}

/** Burst of tiny "banknote" rectangles. */
export function burst(x: number, y: number, colors: string[], count: number, power: number): Particle[] {
  return Array.from({ length: count }, () => {
    const a = Math.random() * Math.PI * 2;
    const s = (0.4 + Math.random()) * power;
    return {
      x,
      y,
      vx: Math.cos(a) * s,
      vy: Math.sin(a) * s - power * 0.4,
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.3,
      life: 1,
      color: colors[Math.floor(Math.random() * colors.length)]!,
      w: 6 + Math.random() * 8,
      h: 3 + Math.random() * 4,
    };
  });
}

export function stepParticles(ctx: CanvasRenderingContext2D, particles: Particle[], dt: number): Particle[] {
  const alive: Particle[] = [];
  for (const p of particles) {
    p.vy += 0.25 * dt;
    p.vx *= 0.99;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.rot += p.vr * dt;
    p.life -= 0.012 * dt;
    if (p.life <= 0) continue;
    ctx.save();
    ctx.globalAlpha = Math.max(0, p.life);
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.fillStyle = p.color;
    ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
    ctx.restore();
    alive.push(p);
  }
  return alive;
}
