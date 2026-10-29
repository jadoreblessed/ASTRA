"use client";

import { useEffect, useRef } from "react";
import { useReducedMotion } from "@react-spring/web";

import { AssetLogo } from "@/components/common/asset-logo";
import { preloadIcons } from "@/components/common/coin-image";
import { TOKEN_ICONS } from "@/data/token-icons";
import { useRobot } from "@/components/common/robot-view";
import { subscribeToTicker } from "@/lib/animation/ticker";
import { screens } from "@/lib/scene/screens";
import { scrollState } from "@/lib/scene/scroll-state";
import { useSections } from "@/hooks/sections/use-sections";
import type { OrbitAsset } from "@/data/mocks/home";

/**
 * The hero's orbiting coins fly down into the Services rows as you scroll.
 *
 * Each orbit coin is tagged `data-fly-src="<symbol>"` and each Services slot
 * `data-fly-dst="<symbol>"`. While the page is between the two slides this
 * layer hides both ends and draws its own copies, measured off the real ones
 * every frame: they leave from wherever the orbit had them, arc across the
 * screen flipping like tossed coins, staggered, and land exactly on their slot —
 * then hand back to the real coins. A coin whose symbol isn't on screen in
 * Services right now (the rows keep swapping) simply drifts up and fades.
 *
 * Progress is the two slides' share of the screen (`sceneProgress`), so it
 * tracks the same crossfade the sections use, at any slide height. Imperative
 * per-frame styles off the shared ticker, like the scene; off under reduced
 * motion and in the robot form.
 */

const STAGGER = 0.035;
const ARC = 90;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

export interface CoinFlightProps {
  coins: OrbitAsset[];
}

export const CoinFlight = ({ coins }: CoinFlightProps) => {
  const reduced = Boolean(useReducedMotion());
  const robot = useRobot();
  // Never touch the sections' DOM before they have hydrated and the preloader is done.
  const isLoaded = useSections((st) => st.isLoaded);
  const layerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Every logo the page can show is fetched up front, so swaps and flights never flash a letter.
  useEffect(() => {
    preloadIcons(Object.values(TOKEN_ICONS));
  }, []);

  useEffect(() => {
    if (reduced || robot || !isLoaded) return;
    const layer = layerRef.current;
    if (!layer) return;

    let flying = false;
    let hidden = new Set<HTMLElement>();

    const restore = () => {
      hidden.forEach((el) => (el.style.visibility = ""));
      hidden = new Set();
    };
    /** Hide exactly `next`, unhiding whatever dropped out — no per-frame churn. */
    const hideOnly = (next: Set<HTMLElement>) => {
      hidden.forEach((el) => {
        if (!next.has(el)) el.style.visibility = "";
      });
      next.forEach((el) => {
        if (!hidden.has(el)) el.style.visibility = "hidden";
      });
      hidden = next;
    };

    const land = () => {
      if (!flying) return;
      flying = false;
      layer.style.display = "none";
      restore();
    };

    const unsubscribe = subscribeToTicker(() => {
      const h = scrollState.sceneProgress[screens.HERO] ?? 0;
      const s = scrollState.sceneProgress[screens.SITEMAP] ?? 0;
      const share = h + s > 0 ? s / (h + s) : 0;
      const u = clamp01((share - 0.04) / 0.92);

      if (scrollState.activeScreen === screens.NONE || u <= 0 || u >= 1) {
        land();
        return;
      }

      if (!flying) {
        flying = true;
        layer.style.display = "block";
      }

      // Read phase — every rect at once, so the browser lays out once per frame.
      const vw = window.innerWidth;
      const reads = coins.map((coin) => {
        const src = document.querySelector<HTMLElement>(`[data-fly-src="${coin.symbol}"]`);
        const dst = document.querySelector<HTMLElement>(`[data-fly-dst="${coin.symbol}"]`);
        return {
          src,
          dst,
          a: src?.getBoundingClientRect() ?? null,
          b: dst?.getBoundingClientRect() ?? null,
          aOpacity: src ? Number(src.style.opacity || 1) : 0,
        };
      });

      // Write phase.
      const next = new Set<HTMLElement>();
      reads.forEach((r, i) => {
        const node = itemRefs.current[i];
        if (!node) return;
        if (!r.src || !r.a) {
          node.style.opacity = "0";
          return;
        }
        next.add(r.src);
        if (r.dst) next.add(r.dst);
        const { a, aOpacity } = r;
        const ax = a.left + a.width / 2;
        const ay = a.top + a.height / 2;

        const local = clamp01((u - i * STAGGER) / (1 - STAGGER * (coins.length - 1)));
        const e = easeInOut(local);

        let x: number;
        let y: number;
        let w: number;
        let opacity: number;
        if (r.b) {
          const b = r.b;
          const bx = b.left + b.width / 2;
          const by = b.top + b.height / 2;
          const bend = Math.sin(e * Math.PI);
          x = ax + (bx - ax) * e + (ax < vw / 2 ? -1 : 1) * bend * ARC * 0.4;
          y = ay + (by - ay) * e - bend * ARC;
          w = a.width + (b.width - a.width) * e;
          opacity = aOpacity + (1 - aOpacity) * Math.min(1, e * 3);
        } else {
          x = ax;
          y = ay - e * 120;
          w = a.width;
          opacity = aOpacity * (1 - e);
        }

        const flip = e * 360 * (i % 2 === 0 ? 1 : -1);
        node.style.opacity = opacity.toFixed(3);
        node.style.transform = `translate(${(x - 24).toFixed(1)}px, ${(y - 24).toFixed(1)}px) scale(${(w / 48).toFixed(4)}) rotateY(${flip.toFixed(1)}deg)`;
      });
      hideOnly(next);
    }, () => 0);

    return () => {
      unsubscribe();
      restore();
    };
  }, [coins, reduced, robot, isLoaded]);

  if (reduced || robot) return null;

  return (
    <div
      ref={layerRef}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-[35]"
      style={{ display: "none", perspective: 800 }}
    >
      {coins.map((coin, i) => (
        <div
          key={coin.symbol}
          ref={(el) => {
            itemRefs.current[i] = el;
          }}
          className="absolute top-0 left-0"
          style={{ width: 48, height: 48, opacity: 0, willChange: "transform" }}
        >
          <AssetLogo symbol={coin.symbol} logo={coin.logo} mark={coin.mark} size={48} />
        </div>
      ))}
    </div>
  );
};
