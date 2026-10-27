"use client";

import { useEffect } from "react";
import { useSpring } from "@react-spring/web";
import { subscribeToTicker } from "@/lib/animation/ticker";
import { screens } from "@/lib/scene/screens";
import { scrollState } from "@/lib/scene/scroll-state";

/**
 * Fades the whole WebGL canvas out — but only once the reader is leaving the
 * Impact slide for the footer, **not** as Impact arrives.
 *
 * The starfield is the shared backdrop the logo mark assembles over, so it has to
 * persist through Impact: fading it there is exactly what made the transition
 * read as a hard cut between two separate scenes. The maelstrom itself leaves the
 * frame on its own — the camera dives through it — so only the footer needs the
 * canvas gone, and it holds the starry background the whole way through the logo
 * build.
 *
 * Driven by **scroll position** past the Impact slide's top (monotonic, reverses
 * cleanly), read on the shared ticker so the fade costs no re-renders.
 */

/** The starfield holds this many viewports past Impact's top, then fades… */
const FADE_START_VH = 1.6;
/** …over this span, into the footer. */
const FADE_SPAN_VH = 0.6;

const FADE_CONFIG = { tension: 170, friction: 34 } as const;

export const useSceneVisibility = () => {
  const [styles, api] = useSpring(() => ({
    opacity: 1,
    config: FADE_CONFIG,
  }));

  useEffect(() => {
    // An unchanged target is not re-sent each frame (see `useSceneFade`).
    let last = Number.NaN;
    const unsubscribe = subscribeToTicker(() => {
      if (scrollState.activeScreen === screens.NONE) return;

      const impact = scrollState.slideRange[screens.IMPACT];
      if (!impact) return;

      const { scrollY, vh } = scrollState;
      const past = scrollY - impact.top; // px into the Impact slide
      const t = Math.min(
        1,
        Math.max(0, (past - vh * FADE_START_VH) / (vh * FADE_SPAN_VH)),
      );

      if (t === last) return;
      last = t;
      api.start({ opacity: 1 - t });
    }, () => 0);

    return unsubscribe;
  }, [api]);

  return styles;
};
