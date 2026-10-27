"use client";

import { useEffect } from "react";
import { useSpring } from "@react-spring/web";

import { subscribeToTicker } from "@/lib/animation/ticker";
import { scrollState } from "@/lib/scene/scroll-state";

/**
 * A spring that follows a slide's local scroll progress (0 at its top, 1 once
 * its stuck range is exhausted). Reads `scrollState.slideLocalProgress` on the
 * shared ticker — the value never enters React — and eases it through a spring,
 * exactly the pattern `useSceneFade` uses for the scene fade.
 *
 * The timeline section uses it to drive its right-to-left horizontal travel from
 * the 2.5-viewport vertical scroll of the roadmap slide.
 */

/** Matches the scene fade's easing feel — smooth, no visible lag. */
const CONFIG = { tension: 190, friction: 34 } as const;

export const useSlideProgress = (id: string) => {
  const [{ progress }, api] = useSpring(() => ({
    progress: 0,
    config: CONFIG,
  }));

  useEffect(() => {
    // An unchanged target is not re-sent each frame (see `useSceneFade`).
    let last = Number.NaN;
    const unsubscribe = subscribeToTicker(
      () => {
        const next = scrollState.slideLocalProgress[id] ?? 0;
        if (next === last) return;
        last = next;
        api.start({ progress: next });
      },
      () => 0,
    );

    return unsubscribe;
  }, [id, api]);

  return progress;
};
