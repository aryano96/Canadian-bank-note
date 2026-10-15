/**
 * Guilloché: the interlaced engraved line patterns printed on banknotes to
 * defeat counterfeiters. Drawn once per resize into an offscreen canvas.
 */
export function drawGuilloche(ctx: CanvasRenderingContext2D, w: number, h: number, ink: string) {
  ctx.clearRect(0, 0, w, h);
  ctx.strokeStyle = ink;
  ctx.lineWidth = 0.6;

  // Rosette (hypotrochoid) anchored bottom-right, like a note's corner seal.
  const cx = w * 0.82;
  const cy = h * 0.62;
  const scale = Math.min(w, h) * 0.34;
  for (let layer = 0; layer < 3; layer++) {
    const R = 1;
    const r = 0.27 + layer * 0.06;
    const d = 0.55 - layer * 0.08;
    ctx.globalAlpha = 0.55 - layer * 0.12;
    ctx.beginPath();
    for (let i = 0; i <= 2400; i++) {
      const t = (i / 2400) * Math.PI * 2 * 27;
      const x = (R - r) * Math.cos(t) + d * Math.cos(((R - r) / r) * t);
      const y = (R - r) * Math.sin(t) - d * Math.sin(((R - r) / r) * t);
      const px = cx + x * scale * (1 - layer * 0.18);
      const py = cy + y * scale * (1 - layer * 0.18);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
  }

  // Faint maple-leaf watermark in the seal's centre.
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(scale * 0.2, scale * 0.2);
  mapleLeaf(ctx);
  ctx.globalAlpha = 0.5;
  ctx.fillStyle = ink;
  ctx.fill();
  ctx.restore();

  // Wave bands across the top and bottom, like the border of a note.
  ctx.globalAlpha = 0.35;
  for (const [baseY, amp] of [
    [h * 0.12, 8],
    [h * 0.92, 6],
  ] as const) {
    for (let k = 0; k < 9; k++) {
      ctx.beginPath();
      for (let x = 0; x <= w; x += 4) {
        const y = baseY + Math.sin(x / 28 + k * 0.7) * amp + Math.sin(x / 9 + k) * 1.5 + (k - 4) * 2.2;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
}

/** A simplified 11-point maple leaf centred on (0, 0), roughly 2 units tall. */
export function mapleLeaf(ctx: CanvasRenderingContext2D) {
  const pts: [number, number][] = [
    [0, -1], [0.12, -0.72], [0.32, -0.8], [0.25, -0.36], [0.62, -0.62], [0.55, -0.42],
    [0.85, -0.36], [0.68, -0.15], [0.8, 0.02], [0.42, 0.12], [0.48, 0.3], [0.06, 0.24],
    [0.06, 0.62], [-0.06, 0.62], [-0.06, 0.24], [-0.48, 0.3], [-0.42, 0.12], [-0.8, 0.02],
    [-0.68, -0.15], [-0.85, -0.36], [-0.55, -0.42], [-0.62, -0.62], [-0.25, -0.36], [-0.32, -0.8],
    [-0.12, -0.72],
  ];
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
}
