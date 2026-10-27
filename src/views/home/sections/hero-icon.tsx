"use client";

import { useEffect, useState } from "react";
import { animated, useReducedMotion, useSpring } from "@react-spring/web";

import { useRobot } from "@/components/common/robot-view";
import type { OrbitTicker } from "@/data/mocks/home";

/**
 * The hero's centre — every market in orbit around one token.
 *
 * A coin reads `$ASTRA` at the middle; the assets it holds ride the hairline
 * track around it as mono chips, each with a live % that drifts every couple of
 * seconds. The track turns slowly (one lap every minute and a half) while each
 * chip counter-rotates so it always reads upright; the coin's dashed inner rim
 * turns the other way.
 *
 * Motion is `@react-spring/web` loops (hard rule #1); reduced motion and the
 * robot form hold everything still and stop the ticks.
 */

const LAP_MS = 90_000;
const RIM_MS = 40_000;
const TICK_MS = 1_800;

/**
 * Reduced motion, known on the **first** render — a looping spring under
 * react-spring's global `skipAnimation` ends each lap instantly and restarts it
 * in the same tick. `useReducedMotion()` reports it a render too late.
 */
const reducedAtStart = (): boolean =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** A steady, linear, looping turn to `deg` — still when motion is off. */
const turn = (ms: number, still: boolean, deg: number) => ({
  from: { r: 0 },
  to: { r: still ? 0 : deg },
  loop: !still,
  config: { duration: ms, easing: (t: number) => t },
});

/** Nudge two tickers by a few basis points — a market that's awake. */
const drift = (list: OrbitTicker[]): OrbitTicker[] => {
  const next = list.slice();
  for (let k = 0; k < 2; k++) {
    const i = Math.floor(Math.random() * next.length);
    const step = (Math.random() - 0.48) * 0.6;
    next[i] = {
      ...next[i],
      change: Math.max(-9.9, Math.min(9.9, next[i].change + step)),
    };
  }
  return next;
};

export interface HeroIconProps {
  className?: string;
  token: { symbol: string; caption: string };
  tickers: OrbitTicker[];
  /** Radius of the track the chips ride, in px. */
  radius: number;
  /** Phone size: fewer, smaller chips. */
  compact?: boolean;
}

export const HeroIcon = ({
  className,
  token,
  tickers,
  radius,
  compact = false,
}: HeroIconProps) => {
  const [reducedFirst] = useState(reducedAtStart);
  const reduced = Boolean(useReducedMotion());
  const robot = useRobot();
  const still = reducedFirst || reduced || robot;

  const lap = useSpring(turn(LAP_MS, still, 360));
  const rim = useSpring(turn(RIM_MS, still, -360));

  const [live, setLive] = useState(tickers);
  useEffect(() => {
    if (still) return;
    const id = window.setInterval(() => setLive(drift), TICK_MS);
    return () => window.clearInterval(id);
  }, [still]);

  const shown = compact ? live.slice(0, 6) : live;
  const count = shown.length;

  return (
    <div className={className}>
      {/* The coin. */}
      <svg
        viewBox="-62 -62 124 124"
        aria-hidden="true"
        className="absolute inset-0 size-full overflow-visible"
      >
        <defs>
          <linearGradient id="coin-edge" x1="-52" y1="-52" x2="52" y2="52" gradientUnits="userSpaceOnUse">
            <stop stopColor="#4977FF" />
            <stop offset="1" stopColor="#D2BDFF" />
          </linearGradient>
        </defs>
        <circle r="52" fill="rgb(0 0 0 / 0.6)" stroke="url(#coin-edge)" strokeWidth="1" />
        <animated.g transform={rim.r.to((r) => `rotate(${r})`)}>
          <circle
            r="44"
            fill="none"
            stroke="#9fb8ff"
            strokeOpacity="0.5"
            strokeWidth="0.8"
            strokeDasharray="1.5 4.5"
          />
        </animated.g>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-[5px]">
        <span
          className={`font-mono leading-none text-white ${compact ? "text-[12px]" : "text-[15px]"}`}
        >
          {token.symbol}
        </span>
        <span className="font-mono text-[8px] leading-none tracking-[0.3em] text-white/45 uppercase">
          {token.caption}
        </span>
      </div>

      {/* The orbit — chips ride the track, counter-rotating to stay upright. */}
      <animated.div
        aria-hidden="true"
        className="absolute top-1/2 left-1/2 size-0"
        style={{ transform: lap.r.to((r) => `rotate(${r}deg)`) }}
      >
        {shown.map((t, i) => {
          const angle = (i / count) * 360;
          const up = t.change >= 0;
          return (
            <div
              key={t.symbol}
              className="absolute top-0 left-0 size-0"
              style={{ transform: `rotate(${angle}deg) translateY(${-radius}px)` }}
            >
              <animated.div
                className={`absolute top-0 left-0 flex items-center whitespace-nowrap rounded-full border border-white/12 bg-black/75 font-mono leading-none text-white/90 ${
                  compact
                    ? "gap-[4px] px-[7px] py-[3px] text-[9px]"
                    : "gap-[6px] px-[9px] py-[5px] text-[11px]"
                }`}
                style={{
                  transform: lap.r.to(
                    (r) => `translate(-50%, -50%) rotate(${-angle - r}deg)`,
                  ),
                }}
              >
                <span
                  className={`size-[4px] rounded-full ${up ? "bg-accent-300" : "bg-signal-ring"}`}
                />
                {t.symbol}
                <span className={up ? "text-accent-300" : "text-signal-ring"}>
                  {up ? "+" : "−"}
                  {Math.abs(t.change).toFixed(1)}%
                </span>
              </animated.div>
            </div>
          );
        })}
      </animated.div>
    </div>
  );
};
