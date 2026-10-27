"use client";

import { useEffect, useState } from "react";

import { useWindowSize } from "@/hooks/use-window-size";

/**
 * Uniform-scale layout for the getLayers hero (Figma 665:1694).
 *
 * The redesign is a single fixed 1440×800 composition that must keep its exact
 * internal proportions at every viewport — the brief was "scale the layout,
 * preserving the mockup's composition". So rather than reflow, the hero renders
 * its children at their literal design pixels and scales the whole frame by one
 * factor: `min(vw/1440, vh/800)` (a `contain` fit — the frame never overflows
 * the viewport, and its 1.8 aspect is preserved with the live vortex filling any
 * letterbox behind it).
 *
 * `navTop` pins the fixed nav to the *top of the viewport* with a constant inset,
 * the mockup's 10px nav gap scaled by the frame factor — not to the centred
 * frame's top edge. Centring on the frame let a tall viewport's top letterbox
 * push the nav down (its offset grew with the screen height); pinning to the
 * viewport keeps the same gap at every height, which is what the bar wants as a
 * `position: fixed` element.
 *
 * SSR / first paint returns a stable `scale: 1` so server and client markup
 * match; the real measurement lands in a mount effect, one frame later.
 */

/** Design-frame dimensions the composition is authored against. */
export const HERO_BASE_WIDTH = 1440;
export const HERO_BASE_HEIGHT = 800;
/** The nav's top inset within the design frame (Figma y=10). */
const NAV_INSET = 10;

/**
 * How the frame is fitted to the viewport:
 * - `contain` (default): `min(vw/1440, vh/800)` — the whole 800-tall frame is
 *   always visible; wider-than-1.8 viewports letterbox at the sides.
 * - `width`: `vw/1440` — the frame always spans the full viewport width, so a
 *   design-pixel side inset (e.g. the services grid's 50px) stays proportional
 *   to the mockup on every screen. Trades a small vertical clip on ultrawide.
 */
export type HeroFit = "contain" | "width";

export interface HeroLayout {
  /** Uniform scale applied to the 1440×800 frame. */
  scale: number;
  /** Fixed-nav top offset in CSS px, tracking the centred composition. */
  navTop: number;
  /** False during SSR and until the first client measurement. */
  ready: boolean;
}

export const useHeroLayout = (fit: HeroFit = "contain"): HeroLayout => {
  const { width, height } = useWindowSize();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted || !width || !height) {
    return { scale: 1, navTop: NAV_INSET, ready: false };
  }

  const contain = Math.min(width / HERO_BASE_WIDTH, height / HERO_BASE_HEIGHT);
  const scale = fit === "width" ? width / HERO_BASE_WIDTH : contain;
  /* Pin to the top of the viewport with the design's nav gap scaled by the
   * `contain` frame — a constant inset at every height, so the bar keeps the same
   * offset instead of drifting down as a tall viewport's top letterbox grows.
   * Scaled (not raw px) so the gap stays proportional to the scaled nav pill. */
  const navTop = NAV_INSET * contain;

  return { scale, navTop, ready: true };
};
