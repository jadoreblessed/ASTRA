"use client";

import { useHydrated } from "@/hooks/use-hydrated";

import { LoaderReadout } from "./loader-readout";

const RAIL_EMPTY = { transform: "scaleX(0)" };

/**
 * The served HTML's stand-in for the warp loader (people only).
 *
 * Until hydration there is no canvas, so the first screen a visitor can see is
 * the page background, the vignette and the readout at 0 %. This curtain draws
 * exactly that — opaque, above the content — so the hero copy underneath can be
 * served **at rest**: Chrome records an element's LCP at its first paint, and
 * the copy now paints with the HTML instead of 1.8 s later at the end of the
 * warp. The moment hydration ends the curtain is gone and, in the same render,
 * the hero switches to its entrance's start pose (`useHydrated`), so nobody ever
 * sees it at rest: the live warp and its readout take over the frame, and the
 * hero plays the same entrance as before when loading ends.
 */
export const LoaderCurtain = () => {
  const hydrated = useHydrated();
  if (hydrated) return null;
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-[150] h-lvh w-lvw bg-background"
    >
      <div className="scene-overlay" />
      <LoaderReadout percent={0} rail={RAIL_EMPTY} />
    </div>
  );
};
