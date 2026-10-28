"use client";

import { useMemo, useRef, useState, type ReactNode } from "react";
import { animated, useSpring } from "@react-spring/web";

import { easeOutQuartic } from "@/utils/animation/easing";

/**
 * The app's charts — a sparkline, the basket area chart, and the holdings donut.
 * Each draws itself in on a spring (hard rule #1): the lines trace from left to
 * right through `strokeDashoffset`, the donut sweeps round from twelve o'clock.
 */

const UP = "#9fb8ff";
const DOWN = "#ff8fc4";

const linePath = (data: number[], w: number, h: number, pad = 2) => {
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  return data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * w;
      const y = pad + (1 - (v - min) / span) * (h - pad * 2);
      return `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
};

/* ---------------------------------------------------------------- sparkline */

export interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  delay?: number;
}

export const Sparkline = ({ data, width = 132, height = 40, delay = 0 }: SparklineProps) => {
  const up = data[data.length - 1] >= data[0];
  const tone = up ? UP : DOWN;
  const d = useMemo(() => linePath(data, width, height), [data, width, height]);
  const { t } = useSpring({
    from: { t: 1 },
    to: { t: 0 },
    delay,
    config: { duration: 1500, easing: easeOutQuartic },
  });

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} aria-hidden="true">
      <animated.path
        d={`${d} L${width},${height} L0,${height} Z`}
        fill={tone}
        style={{ opacity: t.to((v) => (1 - v) * 0.08) }}
      />
      <animated.path
        d={d}
        fill="none"
        stroke={tone}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        pathLength={1}
        strokeDasharray="1"
        strokeDashoffset={t}
      />
    </svg>
  );
};

/* --------------------------------------------------------------- area chart */

export interface AreaChartProps {
  data: number[];
  /** Formats the hovered value. */
  format: (v: number) => string;
  /** Labels for the hovered point, aligned with `data`. */
  labels: string[];
  height?: number;
}

const VB_W = 1000;

export const AreaChart = ({ data, format, labels, height = 260 }: AreaChartProps) => {
  const up = data[data.length - 1] >= data[0];
  const tone = up ? UP : DOWN;
  const d = useMemo(() => linePath(data, VB_W, height, 12), [data, height]);
  const [hover, setHover] = useState<number | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  const { t } = useSpring({
    from: { t: 1 },
    to: { t: 0 },
    config: { duration: 1300, easing: easeOutQuartic },
  });

  const min = Math.min(...data);
  const max = Math.max(...data);
  const yOf = (v: number) => 12 + (1 - (v - min) / (max - min || 1)) * (height - 24);

  const onMove = (e: React.PointerEvent) => {
    const box = boxRef.current?.getBoundingClientRect();
    if (!box) return;
    const f = Math.min(1, Math.max(0, (e.clientX - box.left) / box.width));
    setHover(Math.round(f * (data.length - 1)));
  };

  const hx = hover === null ? 0 : (hover / (data.length - 1)) * 100;
  const hy = hover === null ? 0 : (yOf(data[hover]) / height) * 100;

  return (
    <div
      ref={boxRef}
      className="relative w-full select-none"
      style={{ height }}
      onPointerMove={onMove}
      onPointerLeave={() => setHover(null)}
    >
      <svg
        viewBox={`0 0 ${VB_W} ${height}`}
        preserveAspectRatio="none"
        className="absolute inset-0 h-full w-full overflow-visible"
        aria-hidden="true"
      >
        {[0.25, 0.5, 0.75].map((g) => (
          <line
            key={g}
            x1="0"
            x2={VB_W}
            y1={height * g}
            y2={height * g}
            stroke="rgb(255 255 255 / 0.06)"
            vectorEffect="non-scaling-stroke"
          />
        ))}
        <animated.path
          d={`${d} L${VB_W},${height} L0,${height} Z`}
          fill={tone}
          style={{ opacity: t.to((v) => (1 - v) * 0.08) }}
        />
        <animated.path
          d={d}
          fill="none"
          stroke={tone}
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
          strokeLinejoin="round"
          pathLength={1}
          strokeDasharray="1"
          strokeDashoffset={t}
        />
      </svg>

      {hover !== null && (
        <>
          <span
            className="pointer-events-none absolute inset-y-0 w-px bg-white/20"
            style={{ left: `${hx}%` }}
          />
          <span
            className="pointer-events-none absolute size-[11px] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-accent-500"
            style={{ left: `${hx}%`, top: `${hy}%`, boxShadow: "0 0 18px rgb(109 139 255 / 0.9)" }}
          />
          <span
            className="pointer-events-none absolute top-0 -translate-x-1/2 -translate-y-[115%] rounded-[12px] border border-white/10 bg-background/90 px-[12px] py-[8px] text-center whitespace-nowrap backdrop-blur-md"
            style={{ left: `${Math.min(92, Math.max(8, hx))}%` }}
          >
            <span className="block font-mono text-[15px] leading-none text-white">
              {format(data[hover])}
            </span>
            <span className="mt-[5px] block font-mulish text-[12px] leading-none text-white/50">
              {labels[hover]}
            </span>
          </span>
        </>
      )}
    </div>
  );
};

/* -------------------------------------------------------------------- donut */

export interface DonutSegment {
  key: string;
  value: number;
  color: string;
}

export interface DonutProps {
  segments: DonutSegment[];
  size?: number;
  thickness?: number;
  /** Highlighted segment key, e.g. the hovered holding. */
  active?: string | null;
  children?: ReactNode;
}

export const Donut = ({ segments, size = 200, thickness = 16, active = null, children }: DonutProps) => {
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  const gap = segments.length > 1 ? 3 : 0;

  const { t } = useSpring({
    from: { t: 0 },
    to: { t: 1 },
    config: { duration: 1400, easing: easeOutQuartic },
  });

  /* Where each slice starts, as a fraction of the ring. */
  const starts = segments.map((_, i) =>
    segments.slice(0, i).reduce((s, x) => s + x.value / total, 0),
  );

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg
        viewBox={`0 0 ${size} ${size}`}
        width={size}
        height={size}
        className="-rotate-90"
        aria-hidden="true"
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="rgb(255 255 255 / 0.05)"
          strokeWidth={thickness}
        />
        {segments.map((s, i) => {
          const frac = s.value / total;
          const from = starts[i];
          const dim = active !== null && active !== s.key;
          return (
            <animated.circle
              key={s.key}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={s.color}
              strokeWidth={active === s.key ? thickness + 4 : thickness}
              strokeLinecap="butt"
              opacity={dim ? 0.35 : 1}
              strokeDasharray={t.to((v) => `${Math.max(0, c * frac * v - gap)} ${c}`)}
              strokeDashoffset={t.to((v) => -c * from * v)}
            />
          );
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        {children}
      </div>
    </div>
  );
};
