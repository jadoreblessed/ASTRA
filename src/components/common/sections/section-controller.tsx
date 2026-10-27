"use client";

import { useEffect, useRef } from "react";
import { subscribeToTicker } from "@/lib/animation/ticker";
import { screens } from "@/lib/scene/screens";
import { scrollState } from "@/lib/scene/scroll-state";
import { useSections } from "@/hooks/sections/use-sections";

/**
 * Derives, once per frame, which section is active and how visible each scene is.
 *
 * Ported from the original helios `Controller`, with one structural change: it
 * subscribes to the app-wide ticker (`@/lib/animation/ticker`) rather than
 * owning a private `requestAnimationFrame` loop, so the whole page still runs a
 * single rAF. The progress maths — triangular kernel, plateau, hysteresis,
 * mobile smoothing — is unchanged.
 *
 * Renders nothing.
 */

/**
 * Lerp factor for the mobile scroll smoothing.
 *
 * Higher = snappier and less laggy; lower = smoother but the scene visibly
 * trails your thumb. 0.08 (≈135 ms half-life) was smooth but felt disconnected
 * once the scene ran at 30 fps on mobile, because the two lags compound. 0.22
 * (≈28 ms half-life) still absorbs the discrete jumps of native momentum
 * scrolling while tracking the thumb.
 */
const SMOOTH_LERP = 0.22;
/**
 * Desktop scroll smoothing. Lenis already eases the wheel, but the scene reads
 * `scrollY` raw each frame, so steppy wheel input still shows as jitter in the
 * camera flight (the maelstrom's orbit especially). A gentle low-pass on top —
 * short enough to add no felt lag — smooths every scroll-driven value at once.
 */
const DESKTOP_LERP = 0.3;
/** Deadband around a slide boundary, as a fraction of the viewport height. */
const HYSTERESIS_RATIO = 0.06;
/** Snap rather than crawl when a jump exceeds this many viewports. */
const SNAP_THRESHOLD_VH = 1.5;

const prefersSmoothProgress = () =>
  window.innerWidth < 768 ||
  (typeof window.matchMedia === "function" &&
    window.matchMedia("(hover: none) and (pointer: coarse)").matches);

export const SectionController = () => {
  const isLoaded = useSections((state) => state.isLoaded);
  const setActive = useSections((state) => state.setActive);

  // Mirrors the store so the per-frame callback can compare without resubscribing.
  const activeRef = useRef<string>(screens.NONE);

  useEffect(() => {
    if (!isLoaded) return;

    /* On mobile Lenis leaves momentum scrolling to the OS, so the `scrollY` we
     * sample each frame arrives in discrete steps and the derived progress
     * driving the 3D scene jitters. Lerp our own scroll position toward
     * `window.scrollY` on touch / narrow viewports; every downstream value
     * inherits the easing. */
    let smoothedScrollY = window.scrollY;
    let smoothMode = prefersSmoothProgress();

    const onResize = () => {
      smoothMode = prefersSmoothProgress();
    };
    window.addEventListener("resize", onResize, { passive: true });

    const tick = () => {
      const vh = window.innerHeight;
      scrollState.vh = vh;

      const rawY = window.scrollY;
      // Snap on a page jump or anchor scroll rather than crawling to catch up;
      // otherwise low-pass toward the raw position — harder on touch, gentle on
      // desktop — so the camera flight reads smooth everywhere.
      if (Math.abs(rawY - smoothedScrollY) > vh * SNAP_THRESHOLD_VH) {
        smoothedScrollY = rawY;
      } else {
        smoothedScrollY +=
          (rawY - smoothedScrollY) * (smoothMode ? SMOOTH_LERP : DESKTOP_LERP);
      }

      scrollState.scrollY = smoothedScrollY;
      const cy = smoothedScrollY + vh * 0.5;
      // Half-fade distance of one viewport gives a smooth scene crossfade.
      const fadeBuffer = vh;

      /* Gather every slide anchor, grouped by id — inner stops share an id. */
      const slideGroups: Record<string, HTMLElement[]> = {};
      document.querySelectorAll<HTMLElement>("[data-slide-id]").forEach((el) => {
        const id = el.dataset.slideId;
        if (!id) return;
        (slideGroups[id] ??= []).push(el);
      });

      const slideRanges: Record<string, { minTop: number; maxBot: number }> = {};

      for (const id in slideGroups) {
        let minTop = Infinity;
        let maxBot = -Infinity;

        slideGroups[id].forEach((el) => {
          const rect = el.getBoundingClientRect();
          /* Use rawY, not the smoothed value, to turn the rect's current
           * viewport-relative top into a document offset — otherwise minTop
           * drifts in and out of phase with `cy`. */
          const top = rect.top + rawY;
          const bottom = top + rect.height;
          if (top < minTop) minTop = top;
          if (bottom > maxBot) maxBot = bottom;
        });

        slideRanges[id] = { minTop, maxBot };
        scrollState.slideRange[id] = { top: minTop, bottom: maxBot };

        const center = (minTop + maxBot) / 2;
        const halfH = (maxBot - minTop) / 2;
        const plateauHalf = Math.max(0, halfH - fadeBuffer / 2);
        const dist = Math.abs(cy - center);
        scrollState.sceneProgress[id] =
          dist <= plateauHalf
            ? 1
            : Math.max(0, 1 - (dist - plateauHalf) / fadeBuffer);

        /* Local progress: 0 at the slide top, 1 once we have scrolled past its
         * stuck duration (slide height minus one viewport). */
        const stuck = Math.max(1, maxBot - minTop - vh);
        scrollState.slideLocalProgress[id] = Math.max(
          0,
          Math.min(1, (smoothedScrollY - minTop) / stuck),
        );
      }

      /* Active section, with hysteresis. Without a deadband, jitter around a
       * boundary flips `active` back and forth, which restarts the entrance
       * springs in reverse and reads as a bounce. Only switch once `cy` has
       * decisively left the current slide's range. */
      const hysteresis = vh * HYSTERESIS_RATIO;
      const current = activeRef.current;
      const currentRange = slideRanges[current];
      const stillInside =
        currentRange &&
        cy >= currentRange.minTop - hysteresis &&
        cy < currentRange.maxBot + hysteresis;

      let nextActive = current;

      if (!stillInside) {
        let found: string = screens.NONE;

        for (const id in slideRanges) {
          const range = slideRanges[id];
          if (cy >= range.minTop && cy < range.maxBot) {
            found = id;
            break;
          }
        }

        if (found === screens.NONE) {
          // Past the last slide (scrollY clamps at the document bottom) — take
          // the nearest centre.
          let bestDist = Infinity;
          for (const id in slideRanges) {
            const range = slideRanges[id];
            const center = (range.minTop + range.maxBot) / 2;
            const dist = Math.abs(cy - center);
            if (dist < bestDist) {
              bestDist = dist;
              found = id;
            }
          }
        }
        nextActive = found;
      }

      scrollState.activeScreen = nextActive;

      if (nextActive !== screens.NONE && nextActive !== activeRef.current) {
        activeRef.current = nextActive;
        setActive(nextActive);
      }
    };

    const unsubscribe = subscribeToTicker(tick, () => 0);

    return () => {
      unsubscribe();
      window.removeEventListener("resize", onResize);
    };
  }, [isLoaded, setActive]);

  return null;
};
