import { useId, type ReactElement } from "react";

/**
 * The multiplier, painted on a round paper lantern with a smaller lantern on each side.
 * Colours come from CSS (`.lanterns.tone-*`), and the light inside grows with `--heat` on the stage.
 */
export type LanternTone = "gold" | "win" | "loss";

interface Props {
  text: string;
  tone: LanternTone;
  /** Shown after the round has settled and the next one hasn't started. */
  dim?: boolean;
  /** Bumps on every new result so the cash-out pop and crash swing replay. */
  resultKey?: string | number;
  sparkle?: boolean;
  /** How brightly the lanterns glow while rising, 0 to 1. */
  glow?: number;
}

const SETTLED_GLOW: Record<LanternTone, number | null> = {
  gold: null,
  win: 0.85,
  loss: 0.55,
};

interface Shape {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
}

const W = 400;
const H = 268;
const MAIN: Shape = { cx: 200, cy: 120, rx: 84, ry: 80 };
const LEFT: Shape = { cx: 56, cy: 94, rx: 40, ry: 38 };
const RIGHT: Shape = { cx: 344, cy: 94, rx: 40, ry: 38 };

const MAPLE =
  "M0-1L.12-.72.32-.8.25-.36.62-.62.55-.42.85-.36.68-.15.8.02.42.12.48.3.06.24.06.62-.06.62-.06.24-.48.3-.42.12-.8.02-.68-.15-.85-.36-.55-.42-.62-.62-.25-.36-.32-.8-.12-.72Z";

function blossom(x: number, y: number, r: number, key: string): ReactElement {
  const petals = Array.from({ length: 5 }, (_, i) => {
    const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
    return <circle key={i} cx={x + Math.cos(a) * r * 0.62} cy={y + Math.sin(a) * r * 0.62} r={r * 0.52} />;
  });
  return (
    <g key={key}>
      <g className="lan-flower">{petals}</g>
      <circle className="lan-flower-center" cx={x} cy={y} r={r * 0.28} />
    </g>
  );
}

function maple(x: number, y: number, r: number, rot: number, key: string): ReactElement {
  return <path key={key} className="lan-flower" d={MAPLE} transform={`translate(${x} ${y}) rotate(${rot}) scale(${r})`} />;
}

/** A painted branch sweeping across the top (side 1) or bottom (side -1), clear of the number in the middle. */
function branch({ cx, cy, rx, ry }: Shape, side: 1 | -1): ReactElement {
  const top = side > 0;
  const away = top ? -1 : 1;
  const p = (fx: number, fy: number): [number, number] => [cx + rx * fx * side, cy + ry * fy * away];
  const pts = [p(1.05, 0.35), p(0.7, 0.5), p(0.3, 0.62), p(-0.1, 0.6), p(-0.45, 0.72), p(-0.7, 0.9)];
  let d = `M${pts[0]![0]} ${pts[0]![1]}`;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1]!;
    const [x1, y1] = pts[i]!;
    d += ` Q${(x0 + x1) / 2} ${(y0 + y1) / 2 + ry * 0.06 * away} ${x1} ${y1}`;
  }
  const parts: ReactElement[] = [<path key="b" className="lan-ink" d={d} strokeWidth={rx * 0.045} />];
  pts.slice(1).forEach(([x, y], i) => {
    const x2 = x + rx * 0.12 * (i % 2 ? 1 : -1) * side;
    const y2 = y + ry * 0.2 * away;
    parts.push(
      <path
        key={`t${i}`}
        className="lan-ink"
        d={`M${x} ${y} Q${(x + x2) / 2 + rx * 0.03} ${(y + y2) / 2} ${x2} ${y2}`}
        strokeWidth={rx * 0.022}
      />,
    );
    parts.push(i % 2 ? maple(x2, y2, rx * 0.07, side * 20, `m${i}`) : blossom(x2, y2, rx * 0.07, `f${i}`));
    parts.push(blossom(x + rx * 0.02, y + ry * 0.03 * away, rx * 0.055, `g${i}`));
  });
  return <g key={side}>{parts}</g>;
}

function ribs({ cx, cy, rx, ry }: Shape): ReactElement[] {
  const out: ReactElement[] = [];
  for (let i = -6; i <= 6; i++) {
    const y = cy + (i * ry) / 7;
    const w = rx * Math.sqrt(Math.max(0, 1 - (i / 7) ** 2));
    out.push(<path key={i} d={`M${cx - w} ${y} Q${cx} ${y + ry * 0.05} ${cx + w} ${y}`} />);
  }
  return out;
}

function Lantern({ shape, ids, kind }: { shape: Shape; ids: { paper: string; core: string; clip: string }; kind: "main" | "side" }) {
  const { cx, cy, rx, ry } = shape;
  const cap = Math.max(8, rx * 0.15);
  return (
    <g
      className={`lan lan-${kind}`}
      style={
        {
          transformOrigin: `${cx}px 0px`,
          "--lan-delay": kind === "main" ? "-2.2s" : cx < W / 2 ? "0s" : "-1.6s",
        } as React.CSSProperties
      }
    >
      <line className="lan-string" x1={cx} y1={0} x2={cx} y2={cy - ry - cap + 2} />
      <rect className="lan-cap" x={cx - rx * 0.32} y={cy - ry - cap + 2} width={rx * 0.64} height={cap} rx={cap * 0.3} />
      <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill={`url(#${ids.paper})`} />
      <g clipPath={`url(#${ids.clip})`}>
        <ellipse className="lan-core" cx={cx} cy={cy} rx={rx} ry={ry} fill={`url(#${ids.core})`} />
        <g className="lan-ribs">{ribs(shape)}</g>
        {branch(shape, -1)}
        {branch(shape, 1)}
      </g>
      <rect className="lan-cap" x={cx - rx * 0.32} y={cy + ry - 2} width={rx * 0.64} height={cap} rx={cap * 0.3} />
      <line className="lan-tassel-cord" x1={cx} y1={cy + ry + cap - 2} x2={cx} y2={cy + ry + cap + rx * 0.22} />
      <path
        className="lan-tassel"
        d={`M${cx - rx * 0.08} ${cy + ry + cap + rx * 0.22} L${cx + rx * 0.08} ${cy + ry + cap + rx * 0.22} L${cx + rx * 0.05} ${
          cy + ry + cap + rx * 0.5
        } L${cx - rx * 0.05} ${cy + ry + cap + rx * 0.5}Z`}
      />
    </g>
  );
}

function star(x: number, y: number, r: number) {
  return `M${x} ${y - r * 2}L${x + r * 0.5} ${y - r * 0.5}L${x + r * 2} ${y}L${x + r * 0.5} ${y + r * 0.5}L${x} ${y + r * 2}L${x - r * 0.5} ${
    y + r * 0.5
  }L${x - r * 2} ${y}L${x - r * 0.5} ${y - r * 0.5}Z`;
}
const SPARKS: [number, number, number][] = [
  [92, 40, 3.5],
  [300, 30, 4],
  [128, 196, 3],
  [282, 182, 3.5],
  [356, 160, 2.5],
  [44, 166, 2.5],
  [250, 22, 2.5],
  [158, 18, 2],
];

export function Lanterns({ text, tone, dim, resultKey, sparkle, glow = 0 }: Props) {
  const uid = useId().replace(/:/g, "");
  const id = (n: string) => `${uid}-${n}`;
  const mainIds = { paper: id("pm"), core: id("cm"), clip: id("km") };
  const sideIds = (k: string) => ({
    paper: id("ps"),
    core: id("cs"),
    clip: id(`k${k}`),
  });
  const fontSize = Math.min(32, 140 / Math.max(5, text.length) / 0.6);
  const rays = Array.from({ length: 14 }, (_, i) => {
    const a = (i / 14) * Math.PI * 2;
    const { cx, cy, rx, ry } = MAIN;
    return (
      <line
        key={i}
        x1={cx + Math.cos(a) * rx * 1.15}
        y1={cy + Math.sin(a) * ry * 1.15}
        x2={cx + Math.cos(a) * rx * 1.65}
        y2={cy + Math.sin(a) * ry * 1.65}
      />
    );
  });

  return (
    <div
      className={`lanterns tone-${tone} ${dim ? "dim" : ""} ${sparkle ? "sparkle" : ""}`}
      style={{ "--lan-glow": SETTLED_GLOW[tone] ?? glow } as React.CSSProperties}
      data-testid="multiplier"
    >
      <svg key={resultKey} viewBox={`0 0 ${W} ${H}`} aria-hidden="true" overflow="visible">
        <defs>
          {[
            [mainIds.paper, "main"],
            [id("ps"), "side"],
          ].map(([gid, k]) => (
            <radialGradient key={gid} id={gid} cx="50%" cy="50%" r="55%">
              <stop offset="0" style={{ stopColor: `var(--lan-${k}-light)` }} />
              <stop offset="0.55" style={{ stopColor: `var(--lan-${k}-paper)` }} />
              <stop offset="1" style={{ stopColor: `var(--lan-${k}-edge)` }} />
            </radialGradient>
          ))}
          {[mainIds.core, id("cs")].map((gid) => (
            <radialGradient key={gid} id={gid} cx="50%" cy="50%" r="50%">
              <stop offset="0" style={{ stopColor: "var(--lan-core)", stopOpacity: 1 }} />
              <stop offset="0.7" style={{ stopColor: "var(--lan-core)", stopOpacity: 0.6 }} />
              <stop offset="1" style={{ stopColor: "var(--lan-core)", stopOpacity: 0 }} />
            </radialGradient>
          ))}
          <radialGradient id={id("halo")} cx="50%" cy="50%" r="50%">
            <stop offset="0" style={{ stopColor: "var(--lan-halo)", stopOpacity: 0.75 }} />
            <stop offset="0.45" style={{ stopColor: "var(--lan-halo)", stopOpacity: 0.3 }} />
            <stop offset="1" style={{ stopColor: "var(--lan-halo)", stopOpacity: 0 }} />
          </radialGradient>
          {[
            [mainIds.clip, MAIN],
            [id("kl"), LEFT],
            [id("kr"), RIGHT],
          ].map(([cid, s]) => {
            const { cx, cy, rx, ry } = s as Shape;
            return (
              <clipPath key={cid as string} id={cid as string}>
                <ellipse cx={cx} cy={cy} rx={rx} ry={ry} />
              </clipPath>
            );
          })}
        </defs>

        <ellipse className="lan-halo" cx={MAIN.cx} cy={MAIN.cy} rx={MAIN.rx * 2.1} ry={MAIN.ry * 2} fill={`url(#${id("halo")})`} />
        <ellipse className="lan-halo side" cx={LEFT.cx} cy={LEFT.cy} rx={LEFT.rx * 2} ry={LEFT.ry * 2} fill={`url(#${id("halo")})`} />
        <ellipse className="lan-halo side" cx={RIGHT.cx} cy={RIGHT.cy} rx={RIGHT.rx * 2} ry={RIGHT.ry * 2} fill={`url(#${id("halo")})`} />
        <g className="lan-rays">{rays}</g>

        <Lantern shape={LEFT} ids={sideIds("l")} kind="side" />
        <Lantern shape={RIGHT} ids={sideIds("r")} kind="side" />
        <g className="lan-main-wrap">
          <Lantern shape={MAIN} ids={mainIds} kind="main" />
          <path
            className="lan-crack"
            d={`M${MAIN.cx + 10} ${MAIN.cy - 58} L${MAIN.cx + 22} ${MAIN.cy - 24} L${MAIN.cx + 6} ${MAIN.cy + 2} L${MAIN.cx + 26} ${MAIN.cy + 30}`}
          />
          <text className="lan-num" x={MAIN.cx} y={MAIN.cy + fontSize * 0.36} fontSize={fontSize} textAnchor="middle">
            {text}
          </text>
        </g>
        <path
          className="lan-smoke"
          d={`M${MAIN.cx} ${MAIN.cy - MAIN.ry - 14} C${MAIN.cx - 18} ${MAIN.cy - MAIN.ry - 34} ${MAIN.cx + 18} ${MAIN.cy - MAIN.ry - 50} ${MAIN.cx} ${
            MAIN.cy - MAIN.ry - 70
          }`}
        />
        <g className="lan-sparks">
          {SPARKS.map(([x, y, r], i) => (
            <path key={i} d={star(x, y, r)} style={{ animationDelay: `${(i * 0.37) % 1.6}s` }} />
          ))}
        </g>
      </svg>
    </div>
  );
}
