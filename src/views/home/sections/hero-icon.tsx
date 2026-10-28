"use client";

import { useEffect, useState } from "react";
import {
  animated,
  to,
  useReducedMotion,
  useSpring,
  type SpringValue,
} from "@react-spring/web";

import { AssetLogo } from "@/components/common/asset-logo";
import { useRobot } from "@/components/common/robot-view";
import { useSections } from "@/hooks/sections/use-sections";
import { screens } from "@/lib/scene/screens";
import type { OrbitAsset } from "@/data/mocks/home";

import { ParticlePlanet } from "./particle-planet";

/**
 * The hero's centre — every market, in orbit around one token.
 *
 * `$ASTRA` is the planet at the middle — a Jupiter of particles
 * (`ParticlePlanet`); the companies and coins it can hold circle it like moons on
 * two tilted orbits, passing in front of the globe and behind it — nearer logos
 * larger and brighter, farther ones smaller and dimmer, so the plane reads in
 * depth without a single drawn orbit line. The whole system tilts a few degrees
 * toward the pointer.
 *
 * Motion is `@react-spring/web` loops (hard rule #1); reduced motion and the
 * robot form hold everything still.
 */

const TAU = Math.PI * 2;

interface Ring {
  rx: number;
  ry: number;
  /** In-plane tilt of the orbit, degrees. */
  tilt: number;
  size: number;
  /** One lap, ms. */
  ms: number;
  dir: 1 | -1;
}

const DESKTOP: { outer: Ring; inner: Ring; planet: number } = {
  outer: { rx: 320, ry: 92, tilt: -6, size: 48, ms: 52_000, dir: 1 },
  inner: { rx: 212, ry: 62, tilt: 5, size: 36, ms: 34_000, dir: -1 },
  planet: 178,
};

const COMPACT: { outer: Ring; inner: Ring; planet: number } = {
  outer: { rx: 158, ry: 48, tilt: -6, size: 32, ms: 52_000, dir: 1 },
  inner: { rx: 104, ry: 32, tilt: 5, size: 25, ms: 34_000, dir: -1 },
  planet: 112,
};

/** Reduced motion, known on the first render (see the scene's other loops). */
const reducedAtStart = (): boolean =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const lap = (ms: number, still: boolean) => ({
  from: { a: 0 },
  to: { a: still ? 0 : 1 },
  loop: !still,
  config: { duration: ms, easing: (t: number) => t },
});

/** Where a logo sits on its ring at loop phase `v`, and how near it is (0–1). */
const place = (v: number, i: number, n: number, ring: Ring) => {
  const theta = (ring.dir * v + i / n) * TAU;
  const x = ring.rx * Math.cos(theta);
  const y = ring.ry * Math.sin(theta);
  const t = (ring.tilt * Math.PI) / 180;
  const depth = (Math.sin(theta) + 1) / 2;
  return {
    x: x * Math.cos(t) - y * Math.sin(t),
    y: x * Math.sin(t) + y * Math.cos(t),
    depth,
  };
};

interface OrbitProps {
  items: OrbitAsset[];
  ring: Ring;
  a: SpringValue<number>;
  /** Planet radius: a logo passing behind the globe is eclipsed by it. */
  shadow: number;
}

/** How visible a logo is: dimmer far off, and gone while the globe hides it. */
const seen = (p: ReturnType<typeof place>, shadow: number) => {
  const base = 0.32 + 0.68 * p.depth;
  const d = Math.hypot(p.x, p.y);
  const v = p.depth > 0.5 ? base : base * Math.min(1, Math.max(0, (d - shadow * 0.85) / (shadow * 0.35)));
  // Rounded so the server's and the client's first frames print the same value.
  return Math.round(v * 1000) / 1000;
};

const Orbit = ({ items, ring, a, shadow }: OrbitProps) => (
  <>
    {items.map((item, i) => (
      <animated.div
        key={item.symbol}
        data-fly-src={item.symbol}
        className="absolute top-1/2 left-1/2"
        style={{
          transform: a.to((v) => {
            const p = place(v, i, items.length, ring);
            const s = 0.62 + 0.48 * p.depth;
            return `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px) translate(-50%, -50%) scale(${s.toFixed(3)})`;
          }),
          opacity: a.to((v) => seen(place(v, i, items.length, ring), shadow)),
          zIndex: a.to((v) => (place(v, i, items.length, ring).depth > 0.5 ? 30 : 5)),
        }}
      >
        <AssetLogo symbol={item.symbol} logo={item.logo} mark={item.mark} size={ring.size} />
      </animated.div>
    ))}
  </>
);

export interface HeroIconProps {
  className?: string;
  outer: OrbitAsset[];
  inner: OrbitAsset[];
  /** Phone size: tighter rings, smaller logos. */
  compact?: boolean;
}

export const HeroIcon = ({ className, outer, inner, compact = false }: HeroIconProps) => {
  const [reducedFirst] = useState(reducedAtStart);
  const reduced = Boolean(useReducedMotion());
  const robot = useRobot();
  const still = reducedFirst || reduced || robot;
  const isLoaded = useSections((state) => state.isLoaded);
  const active = useSections((state) => state.active);
  const running = isLoaded && active === screens.HERO;
  const geo = compact ? COMPACT : DESKTOP;

  const outerLap = useSpring(lap(geo.outer.ms, still));
  const innerLap = useSpring(lap(geo.inner.ms, still));

  /* The planet breathes up and down. */
  const float = useSpring({
    from: { y: -4 },
    to: { y: still ? -4 : 4 },
    loop: still ? false : { reverse: true },
    config: { duration: 3200, easing: (t: number) => 0.5 - Math.cos(t * Math.PI) / 2 },
  });

  /* Pointer tilt — only where there is a pointer to follow. */
  const [tilt, tiltApi] = useSpring(() => ({ rx: 0, ry: 0, config: { tension: 120, friction: 26 } }));
  useEffect(() => {
    if (still || !window.matchMedia("(hover: hover)").matches) return;
    const onMove = (e: PointerEvent) => {
      const mx = e.clientX / window.innerWidth - 0.5;
      const my = e.clientY / window.innerHeight - 0.5;
      tiltApi.start({ rx: -my * 9, ry: mx * 12 });
    };
    window.addEventListener("pointermove", onMove);
    return () => window.removeEventListener("pointermove", onMove);
  }, [still, tiltApi]);

  return (
    <div className={className} style={{ perspective: 900 }}>
      <animated.div
        className="absolute inset-0"
        style={{
          transform: to(
            [tilt.rx, tilt.ry],
            (rx: number, ry: number) =>
              `rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg)`,
          ),
        }}
      >

        <Orbit items={inner} ring={geo.inner} a={innerLap.a} shadow={geo.planet / 2} />
        <Orbit items={outer} ring={geo.outer} a={outerLap.a} shadow={geo.planet / 2} />

        {/* The planet. */}
        <animated.div
          className="pointer-events-none absolute top-1/2 left-1/2 z-10"
          style={{ transform: float.y.to((y) => `translate(-50%, calc(-50% + ${y.toFixed(2)}px))`) }}
        >
          <ParticlePlanet size={geo.planet} running={running} still={still} className="block" />
        </animated.div>
      </animated.div>
    </div>
  );
};
