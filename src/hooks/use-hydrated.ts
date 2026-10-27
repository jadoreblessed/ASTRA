"use client";

import { useSyncExternalStore } from "react";

/**
 * `false` through the server render, hydration and until the browser reports
 * that the served HTML has been **presented** (a `paint` timing entry); `true`
 * from then on. What a first screen served at rest under the loader's curtain
 * switches on (`hero.tsx`, `loader-curtain.tsx`).
 *
 * Not "hydrated": under load, hydration (and even two animation frames) can
 * run before the first frame goes out — the copy would then switch to its
 * hidden start pose without ever having been painted at rest, and the LCP
 * would land at the reveal again (seen on kimi, 2026-10-02). A paint entry is
 * the browser saying that frame was shown.
 */
let painted = false;
let observer: PerformanceObserver | null = null;
const listeners = new Set<() => void>();

const markPainted = () => {
  if (painted) return;
  painted = true;
  observer?.disconnect();
  listeners.forEach((listener) => listener());
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  if (!observer && !painted) {
    // A backstop: never hold the curtain over the live warp for long if no
    // entry ever arrives.
    setTimeout(markPainted, 2000);
    try {
      observer = new PerformanceObserver(markPainted);
      observer.observe({ type: "paint", buffered: true });
    } catch {
      // No paint timing: fall back to two frames after hydration.
      requestAnimationFrame(() => requestAnimationFrame(markPainted));
    }
  }
  return () => {
    listeners.delete(listener);
  };
};

export const useHydrated = (): boolean =>
  useSyncExternalStore(
    subscribe,
    () => painted,
    () => false,
  );
