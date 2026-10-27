"use client";

import { create } from "zustand";

import {
  getRuntimePalette,
  setPaletteHex,
  type PaletteKey,
} from "./palette";

/**
 * Live tuning store for the four scenes, organised the way the dev panel shows
 * them — one group per scene, each with its geometry, colours and bloom:
 *
 *   1. Hero      — the vortex in its galaxy phase + the hero UI colours.
 *   2. Services  — the vortex burst phase + the services UI colours.
 *   3. Timeline  — the vortex maelstrom phase + the timeline UI colours.
 *   4. Logo      — the Impact particle mark.
 *
 * The vortex is one WebGL scene morphing through the first three, so its
 * per-scene sizes / glow / bloom are blended by the morph weights (`morph.ts`,
 * `Composer.ts`). UI colours apply live via CSS variables; the vortex palette and
 * particle density are baked at construction, so `applyPalette` remounts the
 * scene. `exportConfig()` serialises everything for hand-off.
 */

/* ------------------------------------------------------------- colour helpers */

export const toHex = (n: number): string =>
  `#${n.toString(16).padStart(6, "0")}`;

export const fromHex = (s: string): number =>
  parseInt(s.replace("#", ""), 16) || 0;

const rgba = (hex: string, a: number): string => {
  const n = fromHex(hex);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
};

/* --------------------------------------------------------------------- schema */

export interface Bloom {
  strength: number;
  radius: number;
  threshold: number;
}

export interface LogoConfig {
  count: number;
  markSize: number;
  thickness: number;
  spreadMin: number;
  spreadSpan: number;
  pointSize: number;
  brightness: number;
  mouseStrength: number;
  tilt: number;
  colorA: string;
  colorB: string;
  /** Background drift-mote field on the logo scene. */
  bgSpeed: number;
  bgSize: number;
  bgBright: number;
}

/**
 * Vortex geometry. Per-form sizes and glow are live uniforms (`morph.ts`);
 * `density` scales the baked buffers, so it applies on "Apply" (remount).
 */
export interface VortexConfig {
  density: number;
  galaxySize: number;
  galaxyGlow: number;
  burstSize: number;
  burstGlow: number;
  maelSize: number;
  maelGlow: number;
}

/**
 * Vortex *shape* — multipliers (1 = default) on the form-defining parameters of
 * each phase. Galaxy shape, the burst/mael scales and the spin are live uniforms;
 * the burst filament shape and the disc's radii/tightness are baked into the
 * buffers, so those take effect on "Apply" (remount). Marked below.
 */
export interface VortexShape {
  galaxyScale: number; // live
  galaxyEllipse: number; // live — flattening
  galaxyPitch: number; // live — arm sweep
  galaxyDrift: number; // live — outward speed
  burstScale: number; // live
  burstSpread: number; // baked — filament length
  burstCurl: number; // baked — how much they snake
  burstBend: number; // baked — off-ray pull
  maelInner: number; // baked — inner radius (disc size)
  maelOuter: number; // baked — outer radius (disc size)
  maelTightness: number; // baked — spiral winding
  maelFunnel: number; // baked — central depth, curls the disc into a funnel
  maelSpin: number; // live — rotation rate
}

/** Per-scene bloom. Vortex blooms blend by morph weight; logo has its own pass. */
export interface BloomSet {
  hero: Bloom;
  services: Bloom;
  timeline: Bloom;
  logo: Bloom;
}

export type BloomScene = keyof BloomSet;

export interface TokenConfig {
  brandBlue: string;
  brandLilac: string;
  ctaMid: string;
  ctaEnd: string;
  ruleBlue: string;
  ruleLilac: string;
  titleHaze: string;
  rail: string;
}

export type PaletteConfig = Record<PaletteKey, string>;

/** Structural logo keys — changing one rebuilds the particle buffers. */
export const LOGO_STRUCTURAL: (keyof LogoConfig)[] = [
  "count",
  "markSize",
  "thickness",
  "spreadMin",
  "spreadSpan",
];

/* -------------------------------------------------------------------- defaults */

const DEFAULT_LOGO: LogoConfig = {
  count: 19900,
  markSize: 10,
  thickness: 1.5,
  // Motes start out at the frame edges (a wide ring) and fly IN to the mark.
  spreadMin: 10,
  spreadSpan: 13.5,
  pointSize: 0.2,
  brightness: 3,
  mouseStrength: 0.94,
  tilt: 0.02,
  colorA: "#4977ff",
  colorB: "#d2bdff",
  bgSpeed: 1,
  bgSize: 1,
  bgBright: 1,
};

const DEFAULT_VORTEX: VortexConfig = {
  density: 0.7,
  galaxySize: 1,
  galaxyGlow: 0.75,
  burstSize: 1.55,
  burstGlow: 1.1,
  maelSize: 1.55,
  maelGlow: 0.95,
};

const DEFAULT_SHAPE: VortexShape = {
  galaxyScale: 1.2,
  galaxyEllipse: 1,
  galaxyPitch: 1.05,
  galaxyDrift: 1,
  burstScale: 0.55,
  burstSpread: 1,
  burstCurl: 0.95,
  burstBend: 1.1,
  maelInner: 1.15,
  maelOuter: 1.15,
  maelTightness: 1,
  maelFunnel: 1.05,
  maelSpin: 3,
};

/** Shape keys baked into the buffers — changing one needs "Apply" (remount). */
export const SHAPE_BAKED: (keyof VortexShape)[] = [
  "burstSpread",
  "burstCurl",
  "burstBend",
  "maelInner",
  "maelOuter",
  "maelTightness",
  "maelFunnel",
];

const DEFAULT_BLOOM: BloomSet = {
  hero: { strength: 0, radius: 0.48, threshold: 0.66 },
  services: { strength: 0.32, radius: 1.5, threshold: 0 },
  timeline: { strength: 0.42, radius: 0.98, threshold: 0.66 },
  logo: { strength: 0, radius: 0.28, threshold: 0.42 },
};

const DEFAULT_TOKENS: TokenConfig = {
  brandBlue: "#4977ff",
  brandLilac: "#d2bdff",
  ctaMid: "#331574",
  ctaEnd: "#000315",
  ruleBlue: "#4564e5",
  ruleLilac: "#cfbaff",
  titleHaze: "#c8d6ff",
  rail: "#7896ff",
};

const defaultPalette = (): PaletteConfig => {
  const runtime = getRuntimePalette();
  const out = {} as PaletteConfig;
  (Object.keys(runtime) as PaletteKey[]).forEach((k) => {
    out[k] = toHex(runtime[k]);
  });
  return out;
};

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

/* --------------------------------------------------------- CSS token application */

/** Recompute the brand gradients from token colours and set them on `:root`. */
export const applyTokensToCss = (t: TokenConfig): void => {
  if (typeof document === "undefined") return;
  const root = document.documentElement.style;
  const haze = rgba(t.titleHaze, 0.2);

  root.setProperty(
    "--gradient-hero-title",
    `linear-gradient(90deg, #ffffff 0%, ${haze} 100%)`,
  );
  root.setProperty(
    "--gradient-hero-title-inv",
    `linear-gradient(90deg, ${haze} 0%, #ffffff 100%)`,
  );
  root.setProperty(
    "--gradient-hero-cta",
    `linear-gradient(107deg, ${t.brandBlue} 0%, ${t.ctaMid} 51.442%, ${t.ctaEnd} 100%)`,
  );
  root.setProperty(
    "--gradient-hero-icon",
    `linear-gradient(120deg, ${t.brandBlue} 0%, ${t.brandLilac} 100%)`,
  );
  root.setProperty(
    "--gradient-service-rule",
    `linear-gradient(90deg, ${t.ruleBlue} 0%, ${rgba(t.ruleBlue, 0)} 100%)`,
  );
  root.setProperty(
    "--gradient-service-rule-alt",
    `linear-gradient(90deg, ${rgba(t.ruleLilac, 0)} 0%, ${t.ruleLilac} 100%)`,
  );
  root.setProperty("--timeline-rail", rgba(t.rail, 0.22));
  root.setProperty(
    "--gradient-timeline-tick",
    `linear-gradient(180deg, ${rgba(t.brandBlue, 0)} 0%, ${rgba(t.brandBlue, 0.55)} 100%)`,
  );
};

/* ---------------------------------------------------------------------- store */

interface SceneConfigState {
  logo: LogoConfig;
  vortex: VortexConfig;
  shape: VortexShape;
  bloom: BloomSet;
  tokens: TokenConfig;
  palette: PaletteConfig;
  /** Bumped by `applyPalette` to remount the vortex with new hues / density. */
  paletteVersion: number;
  setLogo: <K extends keyof LogoConfig>(key: K, value: LogoConfig[K]) => void;
  setVortex: <K extends keyof VortexConfig>(
    key: K,
    value: VortexConfig[K],
  ) => void;
  setShape: <K extends keyof VortexShape>(
    key: K,
    value: VortexShape[K],
  ) => void;
  setBloom: (scene: BloomScene, key: keyof Bloom, value: number) => void;
  setToken: (key: keyof TokenConfig, value: string) => void;
  setPaletteColor: (key: PaletteKey, hex: string) => void;
  applyPalette: () => void;
  reset: () => void;
}

export const useSceneConfig = create<SceneConfigState>((set) => ({
  logo: { ...DEFAULT_LOGO },
  vortex: { ...DEFAULT_VORTEX },
  shape: { ...DEFAULT_SHAPE },
  bloom: clone(DEFAULT_BLOOM),
  tokens: { ...DEFAULT_TOKENS },
  palette: defaultPalette(),
  paletteVersion: 0,

  setLogo: (key, value) => set((s) => ({ logo: { ...s.logo, [key]: value } })),

  setVortex: (key, value) =>
    set((s) => ({ vortex: { ...s.vortex, [key]: value } })),

  setShape: (key, value) =>
    set((s) => ({ shape: { ...s.shape, [key]: value } })),

  setBloom: (scene, key, value) =>
    set((s) => ({
      bloom: { ...s.bloom, [scene]: { ...s.bloom[scene], [key]: value } },
    })),

  setToken: (key, value) =>
    set((s) => {
      const tokens = { ...s.tokens, [key]: value };
      applyTokensToCss(tokens);
      return { tokens };
    }),

  setPaletteColor: (key, hex) => {
    // Write the runtime palette immediately so the live scene recolours without a
    // remount — the objects re-read on the next frame (see `paletteGen`).
    setPaletteHex(key, fromHex(hex));
    set((s) => ({ palette: { ...s.palette, [key]: hex } }));
  },

  applyPalette: () =>
    set((s) => {
      // Push the tuned hues into the runtime palette, then bump the version so
      // the vortex scene remounts and re-reads them (and the density) at build.
      (Object.keys(s.palette) as PaletteKey[]).forEach((k) => {
        setPaletteHex(k, fromHex(s.palette[k]));
      });
      return { paletteVersion: s.paletteVersion + 1 };
    }),

  reset: () =>
    set(() => {
      applyTokensToCss(DEFAULT_TOKENS);
      return {
        logo: { ...DEFAULT_LOGO },
        vortex: { ...DEFAULT_VORTEX },
        shape: { ...DEFAULT_SHAPE },
        bloom: clone(DEFAULT_BLOOM),
        tokens: { ...DEFAULT_TOKENS },
        palette: defaultPalette(),
      };
    }),
}));

/** Serialise the current look for copy-out. */
export const exportConfig = (): string => {
  const { logo, vortex, shape, bloom, tokens, palette } =
    useSceneConfig.getState();
  return JSON.stringify(
    { logo, vortex, shape, bloom, tokens, palette },
    null,
    2,
  );
};
