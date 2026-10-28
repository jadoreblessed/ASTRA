"use client";

import { useEffect, useRef } from "react";

import { subscribeToTicker } from "@/lib/animation/ticker";
import { clampedPixelRatio, deviceTier, frameBudgetMs, byTier } from "@/lib/scene/device";
import { BANDS, BAND_SPEED, SPOT, bandAt } from "@/lib/planet";

/**
 * The hero's planet — `$ASTRA` as a Jupiter built from a few thousand motes.
 *
 * Every mote sits on a sphere and wears its band's flat colour (`lib/planet`):
 * no gradient anywhere, the roundness comes from where the motes fall and how
 * bright the near ones are. The belts turn at slightly different speeds, as a
 * gas giant's do, so the storm drifts against its neighbours; a thin haze of
 * loose motes hangs just off the limb. On first sight the motes fly in from all
 * round and settle into the globe — every market pulled into one.
 *
 * Drawn on a 2D canvas off the shared ticker. `running` gates it to the hero;
 * `still` (reduced motion, the robot form) draws one finished frame.
 */

const TAU = Math.PI * 2;
const TILT = (-16 * Math.PI) / 180;
/** Seconds for the motes to settle into the globe. */
const ASSEMBLE = 2.2;

const HAZE = "#c8d6ff";
const PALETTE = [...BANDS.map((b) => b.color), SPOT.color, HAZE];
const SPOT_I = BANDS.length;
const HAZE_I = BANDS.length + 1;
/** Brightness steps; motes are bucketed by colour × step to keep state changes few. */
const STEPS = 5;

interface Motes {
  n: number;
  lat: Float32Array;
  lon: Float32Array;
  rad: Float32Array;
  size: Float32Array;
  col: Uint8Array;
  band: Uint8Array;
  sx: Float32Array;
  sy: Float32Array;
  seed: Float32Array;
}

const build = (globe: number, haze: number): Motes => {
  const n = globe + haze;
  const m: Motes = {
    n,
    lat: new Float32Array(n),
    lon: new Float32Array(n),
    rad: new Float32Array(n),
    size: new Float32Array(n),
    col: new Uint8Array(n),
    band: new Uint8Array(n),
    sx: new Float32Array(n),
    sy: new Float32Array(n),
    seed: new Float32Array(n),
  };
  for (let i = 0; i < n; i++) {
    const y = Math.random() * 2 - 1;
    const lat = Math.asin(y);
    const lon = Math.random() * TAU;
    m.lat[i] = lat;
    m.lon[i] = lon;
    m.seed[i] = Math.random();
    // Start scattered round the planet, out to ~2.6 radii.
    const a = Math.random() * TAU;
    const r = 1.3 + Math.random() * 1.3;
    m.sx[i] = Math.cos(a) * r;
    m.sy[i] = Math.sin(a) * r;

    if (i >= globe) {
      m.rad[i] = 1.04 + Math.random() * 0.16;
      m.size[i] = 0.7 + Math.random() * 0.6;
      m.col[i] = HAZE_I;
      m.band[i] = bandAt(y);
      continue;
    }
    m.rad[i] = 0.99 + Math.random() * 0.02;
    m.size[i] = 1 + Math.random() * Math.random() * 1.1;
    // Wavy band edges: a little longitudinal wobble on the latitude test.
    const b = y + 0.035 * Math.sin(lon * 3 + y * 9) + 0.02 * Math.sin(lon * 7 - y * 5);
    const band = bandAt(b);
    m.band[i] = band;
    let dl = lon - SPOT.lon;
    dl = Math.atan2(Math.sin(dl), Math.cos(dl));
    const inSpot = (dl / SPOT.w) ** 2 + ((y - SPOT.lat) / SPOT.h) ** 2 < 1;
    m.col[i] = inSpot ? SPOT_I : band;
  }
  return m;
};

export interface ParticlePlanetProps {
  /** Planet diameter, CSS px. The canvas is larger, to hold the haze. */
  size: number;
  running: boolean;
  still: boolean;
  className?: string;
}

export const ParticlePlanet = ({ size, running, still, className }: ParticlePlanetProps) => {
  const ref = useRef<HTMLCanvasElement>(null);
  const runningRef = useRef(running);
  useEffect(() => {
    runningRef.current = running;
  }, [running]);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const tier = deviceTier();
    const dpr = Math.min(2, clampedPixelRatio(tier));
    const box = size * 1.5;
    canvas.width = Math.round(box * dpr);
    canvas.height = Math.round(box * dpr);
    const globe = byTier(tier, { desktop: 9000, tablet: 6500, mobile: 4200 });
    const m = build(Math.round(globe * Math.min(1, size / 180)) + 600, 420);

    /* Per-bucket draw lists, reused every frame. */
    const buckets = PALETTE.length * STEPS;
    const bx = Array.from({ length: buckets }, () => new Float32Array(m.n));
    const by = Array.from({ length: buckets }, () => new Float32Array(m.n));
    const bs = Array.from({ length: buckets }, () => new Float32Array(m.n));
    const count = new Int32Array(buckets);

    const R = (size / 2) * dpr;
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const ct = Math.cos(TILT);
    const st = Math.sin(TILT);
    let start = -1;
    let frames = 0;

    /* A slow pointer lean, eased toward. */
    let lean = 0;
    let leanTo = 0;
    const onMove = (e: PointerEvent) => {
      leanTo = (e.clientY / window.innerHeight - 0.5) * -0.35;
    };
    if (!still) window.addEventListener("pointermove", onMove);

    const draw = (now: number) => {
      if (start < 0) start = now;
      const t = still ? 40 : (now - start) / 1000;
      const settle = still ? 1 : Math.min(1, t / ASSEMBLE);
      lean += (leanTo - lean) * 0.04;
      const cl = Math.cos(lean);
      const sl = Math.sin(lean);
      count.fill(0);

      for (let i = 0; i < m.n; i++) {
        // Staggered settle per mote, eased out.
        const k = Math.min(1, Math.max(0, settle * 1.5 - m.seed[i] * 0.5));
        const e = 1 - (1 - k) ** 3;

        const L = m.lon[i] + t * BAND_SPEED[m.band[i]];
        const cosLat = Math.cos(m.lat[i]);
        let x = cosLat * Math.sin(L) * m.rad[i];
        let y = Math.sin(m.lat[i]) * m.rad[i];
        let z = cosLat * Math.cos(L) * m.rad[i];
        // Lean toward the pointer (about x), then the axial tilt (in-plane).
        const y2 = y * cl - z * sl;
        z = y * sl + z * cl;
        y = y2;
        const x2 = x * ct - y * st;
        y = x * st + y * ct;
        x = x2;

        const haze = m.col[i] === HAZE_I;
        // The far side hides behind the globe once it has formed.
        const face = haze ? (z > -0.25 ? 1 : 0) : z;
        let bright = haze ? 0.25 + 0.15 * Math.sin(t * 1.3 + m.seed[i] * 20) : 0.28 + 0.72 * Math.max(0, face);
        if (face < 0) bright *= 1 - e;
        if (bright <= 0.02) continue;

        const px = cx + (m.sx[i] + (x - m.sx[i]) * e) * R;
        const py = cy - (m.sy[i] + (y - m.sy[i]) * e) * R;
        const step = Math.min(STEPS - 1, Math.floor(bright * STEPS));
        const b = m.col[i] * STEPS + step;
        const c = count[b]++;
        bx[b][c] = px;
        by[b][c] = py;
        bs[b][c] = m.size[i] * dpr * (0.7 + 0.5 * Math.max(0, z));
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (let b = 0; b < buckets; b++) {
        const c = count[b];
        if (!c) continue;
        ctx.fillStyle = PALETTE[Math.floor(b / STEPS)];
        ctx.globalAlpha = ((b % STEPS) + 1) / STEPS;
        const xs = bx[b];
        const ys = by[b];
        const ss = bs[b];
        for (let j = 0; j < c; j++) {
          const s = ss[j];
          ctx.fillRect(xs[j] - s / 2, ys[j] - s / 2, s, s);
        }
      }
      frames++;
    };

    const unsubscribe = subscribeToTicker(
      (now) => {
        if (document.hidden) return;
        if (still && frames > 0) return;
        // Nothing until the hero is on screen, so the motes fly in where seen.
        if (!runningRef.current) return;
        draw(now);
      },
      () => frameBudgetMs(tier),
    );

    return () => {
      unsubscribe();
      window.removeEventListener("pointermove", onMove);
    };
  }, [size, still]);

  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      className={className}
      style={{ width: size * 1.5, height: size * 1.5 }}
    />
  );
};
