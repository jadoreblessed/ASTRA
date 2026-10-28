"use client";

import { animated, useReducedMotion, useSpring } from "@react-spring/web";

import { useRobot } from "@/components/common/robot-view";

/**
 * ASTRA's brand mark — the A in orbit. An "A" drawn in two strokes, a tipped
 * orbit ring through it (the back of the ring behind the letter, the front of
 * it over), and a pink moon on the ring: one token with every market circling
 * it. Flat colours only; it is also the X avatar and the favicon.
 *
 * `live` sets the moon travelling round the ring — slow, continuous, passing
 * behind the letter on the far side. Still under reduced motion and in the
 * robot form.
 */

const ICE = "#e8edff";
const LILAC = "#d2bdff";
const PINK = "#ff5fa8";

/** The ring: centred at (0, RY0), radii RX × RY, tipped by TILT degrees. */
const RX = 32;
const RY = 8;
const CY = 8;
const TILT = (-12 * Math.PI) / 180;

/** The moon's resting place, a little past the right end of the ring. */
const REST = -0.35;

const moonAt = (t: number) => {
  const x = RX * Math.cos(t);
  const y = RY * Math.sin(t);
  return {
    x: x * Math.cos(TILT) - y * Math.sin(TILT),
    y: CY + x * Math.sin(TILT) + y * Math.cos(TILT),
    front: Math.sin(t) > 0,
  };
};

const Ring = ({ half }: { half: "back" | "front" }) => (
  <g transform={`rotate(-12 0 ${CY})`}>
    {half === "back" ? (
      <path d={`M${-RX} ${CY} A${RX} ${RY} 0 0 1 ${RX} ${CY}`} fill="none" stroke={LILAC} strokeWidth="3.5" strokeLinecap="round" />
    ) : (
      <path d={`M${-RX} ${CY} A${RX} ${RY} 0 0 0 ${RX} ${CY}`} fill="none" stroke={LILAC} strokeWidth="3.5" strokeLinecap="round" />
    )}
  </g>
);

const Letter = () => (
  <polyline
    points="-22,26 0,-28 22,26"
    fill="none"
    stroke={ICE}
    strokeWidth="7"
    strokeLinecap="round"
    strokeLinejoin="round"
  />
);

export interface AstraMarkProps {
  size?: number;
  className?: string;
  /** The moon travels round the ring. */
  live?: boolean;
}

export const AstraMark = ({ size = 24, className, live = false }: AstraMarkProps) => {
  const reduced = Boolean(useReducedMotion());
  const robot = useRobot();
  const moving = live && !reduced && !robot;
  const { t } = useSpring({
    from: { t: REST },
    to: { t: moving ? REST + Math.PI * 2 : REST },
    loop: moving,
    config: { duration: 7_000, easing: (v: number) => v },
  });

  const rest = moonAt(REST);
  const moon = (layer: "back" | "front") =>
    moving ? (
      <animated.circle
        r="4.5"
        fill={PINK}
        cx={t.to((v) => moonAt(v).x.toFixed(2))}
        cy={t.to((v) => moonAt(v).y.toFixed(2))}
        opacity={t.to((v) => ((moonAt(v).front ? "front" : "back") === layer ? 1 : 0))}
      />
    ) : layer === "front" ? (
      <circle cx={rest.x} cy={rest.y} r="4.5" fill={PINK} />
    ) : null;

  return (
    <svg viewBox="-36 -36 72 72" width={size} height={size} aria-hidden="true" className={className}>
      <Ring half="back" />
      {moon("back")}
      <Letter />
      <Ring half="front" />
      {moon("front")}
    </svg>
  );
};
