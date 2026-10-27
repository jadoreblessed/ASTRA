import * as THREE from "three";

/**
 * Scene colours, as GPU-ready vectors.
 *
 * Shaders can't read CSS custom properties, so the palette is mirrored here.
 * Every value below is one of the design tokens in `globals.css` — keep the two
 * in step. Named by token, not by usage, so a scene can pick its own ramp.
 */

const hexToVec3 = (hex: number): THREE.Vector3 =>
  new THREE.Vector3(
    ((hex >> 16) & 255) / 255,
    ((hex >> 8) & 255) / 255,
    (hex & 255) / 255,
  );

/** Raw hex defaults, mirroring `:root` in `src/app/globals.css`. */
export const paletteHex = {
  accent900: 0x0037ff,
  accent800: 0x00eeff,
  accent700: 0x12266b,
  accent600: 0x2340b8,
  accent500: 0x3a5cff,
  accent400: 0x6d8bff,
  accent300: 0x9fb8ff,
  accent200: 0xd6e2ff,
  signalGlow: 0x6799fe,
  signalRing: 0x00ffaa,
  foreground: 0xffffff,
} as const;

export type PaletteKey = keyof typeof paletteHex;

/**
 * Runtime copy the settings panel can override. `color()` reads from here, so a
 * scene rebuilt after an override picks up the new hues. The frozen `paletteHex`
 * above stays the reset baseline.
 */
const runtimeHex: Record<PaletteKey, number> = { ...paletteHex };

/**
 * Bumped on every override. Scene objects read colours from `color()` and cache
 * this generation, re-reading their colour uniforms only when it changes — so the
 * panel recolours the live scene each frame, no remount needed.
 */
let paletteGeneration = 0;

/** Override one palette entry (used by the dev settings panel). */
export const setPaletteHex = (key: PaletteKey, hex: number): void => {
  runtimeHex[key] = hex;
  paletteGeneration += 1;
};

/** Current palette generation — compare against a cached copy to detect changes. */
export const paletteGen = (): number => paletteGeneration;

/** Current runtime palette, for export / the panel's initial values. */
export const getRuntimePalette = (): Record<PaletteKey, number> => ({
  ...runtimeHex,
});

/** A fresh `Vector3` per call — uniforms mutate theirs, so never share one. */
export const color = (key: PaletteKey): THREE.Vector3 =>
  hexToVec3(runtimeHex[key]);
