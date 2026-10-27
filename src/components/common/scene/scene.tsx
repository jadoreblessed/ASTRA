"use client";

import { useEffect, useRef, useState } from "react";
import { animated, useSpring } from "@react-spring/web";

import Canvas from "./three";
import { events } from "./three/constants";
import { LoaderReadout } from "./loader-readout";
import { subscribeToTicker } from "@/lib/animation/ticker";
import { subscribeMouse } from "@/lib/scene/mouse";
import { frameBudgetMs, sceneShouldFreeze } from "@/lib/scene/device";
import { isSceneVisible } from "@/lib/scene/scroll-state";
import { useSceneConfig } from "@/lib/scene/scene-config";
import { useSections } from "@/hooks/sections/use-sections";
import { useSceneVisibility } from "@/hooks/sections/use-scene-visibility";

/** Loader percentage above which the scene is considered ready. */
const LOADED_AT = 98;

/**
 * How long after the loader hands off to keep drawing before freezing, when the
 * scene is in its reduced-motion / energy-saver path. Long enough for the galaxy
 * to settle into the frozen frame; short enough that the phone stops working soon
 * after the entrance.
 */
const FREEZE_SETTLE_MS = 900;

/** The preloader emits a rounded integer. */
interface LoadingEventDetail {
  percent: number | string;
}

/**
 * The persistent WebGL backdrop.
 *
 * Client leaf: it owns the canvas, the Three.js `Canvas` instance, and the
 * pointer subscription. Unlike the original — which pushed `animation.render`
 * into a bespoke renderer registry — the scene subscribes to the app-wide
 * ticker, so it shares one `requestAnimationFrame` with every spring on the
 * page. It reads scroll progress from `@/lib/scene/scroll-state`, written each
 * frame by `SectionController`.
 *
 * `h-lvh`/`w-lvw`: iOS Safari's address bar changes the dynamic viewport, so
 * the canvas is sized against the *largest* viewport and always fills the
 * screen. `transform-gpu` + `backface-hidden` promote the wrapper to its own
 * compositor layer — without it, a neighbouring fixed element repainting during
 * scroll invalidates the WebGL composite on WebKit and the whole scene flickers.
 */
export const Scene = () => {
  const [percent, setPercent] = useState(0);
  const parentRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  /* Read inside the ticker closure to know when the loader has handed off, so the
   * reduced-motion freeze settles on a fully-formed frame. A ref, not state, so
   * flipping it never re-runs the scene effect. */
  const loadedRef = useRef(false);
  const visibility = useSceneVisibility();

  /* The load rail. The preloader emits whole percents, so the raw value steps —
   * the spring is what turns those steps back into a rail that fills. Scale, not
   * width: it composites instead of laying the bar out again ten times a second. */
  const rail = useSpring({
    transform: `scaleX(${percent / 100})`,
    config: { tension: 180, friction: 30 },
  });

  const isLoaded = useSections((state) => state.isLoaded);
  const setIsLoaded = useSections((state) => state.setIsLoaded);

  /* Fade the load readout out rather than yanking it: a hard unmount at the
   * instant the bar completes flashed the (near-full, glowing) rail for a frame
   * as a horizontal stripe. Fade to nothing, then drop it from the tree. */
  const [loaderGone, setLoaderGone] = useState(false);
  const loaderFade = useSpring({
    opacity: isLoaded ? 0 : 1,
    config: { tension: 210, friction: 30 },
    onRest: () => {
      if (isLoaded) setLoaderGone(true);
    },
  });
  // Bumped by the dev panel's "Apply" — remounts the scene so its objects
  // re-read the tuned palette at construction.
  const paletteVersion = useSceneConfig((state) => state.paletteVersion);

  useEffect(() => {
    const parent = parentRef.current;
    const canvas = canvasRef.current;
    if (!parent || !canvas) return;

    /* The scene starts a task after hydration rather than inside it: creating
     * the WebGL renderer is a long call on a phone, and in the hydration commit
     * it lengthened the load's longest task. `Canvas` builds the rest in steps. */
    let animation: Canvas | null = null;
    const start = setTimeout(() => {
      animation = new Canvas(parent, canvas);
    }, 0);
    const unsubscribeMouse = subscribeMouse();

    /* Render on demand. The scene is fill-bound, so the cheapest win is not
     * drawing when nobody can see it — the canvas is faded out below the
     * roadmap, and a hidden tab paints nothing. Phones and desktops draw at the
     * display rate (a phone cap read as choppy — see `frameBudgetMs`); the
     * ticker throttles each subscriber independently. */
    const budget = frameBudgetMs();

    /* Reduced-motion / energy-saver path: play the entrance once, then stop
     * drawing entirely. WebGL keeps whatever was last rendered on the canvas, so
     * the scene settles to a still frame that costs nothing on scroll or idle —
     * the continuous flight is exactly what drags a constrained phone down. We
     * keep rendering until the loader hands off (`loadedRef`) plus a short settle
     * window, so the galaxy is fully formed in the frame we freeze on. */
    const freeze = sceneShouldFreeze();
    let frozen = false;
    let settleStart = 0;
    const unsubscribeTicker = subscribeToTicker(
      (time) => {
        if (!animation || frozen || !isSceneVisible()) return;
        animation.render(time);
        if (freeze && loadedRef.current) {
          const now = performance.now();
          if (settleStart === 0) settleStart = now;
          else if (now - settleStart > FREEZE_SETTLE_MS) frozen = true;
        }
      },
      () => budget,
    );

    const markLoaded = () => {
      loadedRef.current = true;
      setIsLoaded(true);
    };

    const onLoading = (event: Event) => {
      const detail = (event as CustomEvent<LoadingEventDetail>).detail;
      const percent = Number(detail.percent);
      if (Number.isNaN(percent)) return;
      setPercent(percent);
      if (percent > LOADED_AT) markLoaded();
    };
    const onLoaderDestroy = () => markLoaded();

    document.addEventListener(events.LOADING, onLoading);
    document.addEventListener(events.LOADER_DESTROY, onLoaderDestroy);

    return () => {
      document.removeEventListener(events.LOADING, onLoading);
      document.removeEventListener(events.LOADER_DESTROY, onLoaderDestroy);
      unsubscribeTicker();
      unsubscribeMouse();
      clearTimeout(start);
      animation?.unmount();
    };
  }, [setIsLoaded, paletteVersion]);

  return (
    <animated.div
      ref={parentRef}
      style={visibility}
      className="pointer-events-none fixed inset-0 h-lvh w-lvw transform-gpu backface-hidden will-change-transform"
    >
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className="pointer-events-none h-full w-full transform-gpu"
      />
      {/* Vignette: darkens the top band for header readability and the bottom
          for CTA contrast. Inside this wrapper so it fades with the canvas. */}
      <div className="scene-overlay" aria-hidden="true" />
      {/* The load readout (`LoaderReadout` — the served HTML's curtain draws
          the same one at 0 % until hydration). */}
      {!loaderGone && (
        <LoaderReadout percent={percent} rail={rail} style={loaderFade} />
      )}
    </animated.div>
  );
};
