"use client";

import { animated, type SpringValue } from "@react-spring/web";
import type { CSSProperties } from "react";

/**
 * The warp loader's readout — the percentage and its rail.
 *
 * It sits low and centred rather than dead centre: the warp's vanishing point is
 * the middle of the frame, and a numeral parked on top of it fights the one
 * thing the tunnel is drawing the eye toward. The counter is set in the
 * wordmark's face, so the loader reads as the first frame of the site rather
 * than as a spinner in front of it.
 *
 * Drawn twice with the same markup: by the scene (live, from the preloader's
 * events) and by the curtain the served HTML carries until hydration (at 0 %),
 * so the hand-over between the two is invisible.
 */
export interface LoaderReadoutProps {
  percent: number;
  /** The rail's fill as a `scaleX` transform (a spring on the live readout). */
  rail: { transform: string | SpringValue<string> };
  /** The readout's own fade (the live readout fades out when loading ends). */
  style?: CSSProperties | Record<string, SpringValue<number>>;
}

export const LoaderReadout = ({ percent, rail, style }: LoaderReadoutProps) => (
  <animated.div
    style={style}
    className="absolute inset-x-0 bottom-[14vh] flex flex-col items-center gap-[1.375rem] px-6"
    role="status"
    aria-live="polite"
  >
    {/* Set in the site's heading face and size (Mulish 56/light), so the
        readout reads as the first line of the site, not a spinner. */}
    <p className="m-0 flex items-start font-mulish text-[56px] leading-none font-light text-foreground tabular-nums">
      {percent}
      <span className="mt-[0.15em] ml-[0.08em] font-mulish text-[0.42em] leading-none font-light tracking-[0.1em] text-accent-300/70">
        %
      </span>
    </p>

    <span
      aria-hidden="true"
      className="relative block h-px w-[min(20rem,56vw)] overflow-hidden bg-foreground/12"
    >
      <animated.span
        style={rail}
        className="absolute inset-0 origin-left bg-accent-500 shadow-[var(--shadow-loader-rail)]"
      />
    </span>
  </animated.div>
);
