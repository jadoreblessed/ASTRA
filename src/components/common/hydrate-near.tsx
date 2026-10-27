"use client";

import { use, type ReactNode } from "react";

import { useRobot } from "./robot-view";

/**
 * Hydrate a server-rendered block only once the visitor nears it (from relay,
 * where it was first measured — see the pipeline's Fix Catalog).
 *
 * Put it inside a `<Suspense>`, around the block: the component suspends while
 * React hydrates, and React keeps the server HTML in place for a boundary that
 * suspends during hydration — then hydrates it, in place (no remount, nothing
 * re-created), once the gate opens. Here the blocks are the slides below the
 * hero: fixed panels the server already serves hidden (`useSceneFade` starts
 * them at opacity 0), each hydrating its headings, text engines and reveals in
 * the page's one hydration commit — the load's longest task on a phone.
 *
 * The gate opens when the block (`id`) is on screen — or, from the visitor's
 * first gesture toward moving the page, within 1.5 viewports of it. `scroll`
 * also counts as that gesture, so a deep link's scroll opens the gates around
 * its target. On a client render that is not hydration the element is not in
 * the document yet, so its gate is open. The robot form (D-016) hydrates
 * everything at once, as before.
 */
const LOOKAHEAD = "150% 0px 150% 0px";
const ENGAGE_EVENTS = [
  "pointerdown",
  "touchstart",
  "wheel",
  "keydown",
  "scroll",
] as const;

let engaged = false;
const engageWaiters = new Set<() => void>();
const engage = () => {
  if (engaged) return;
  engaged = true;
  for (const type of ENGAGE_EVENTS)
    window.removeEventListener(type, engage, true);
  for (const wake of engageWaiters) wake();
  engageWaiters.clear();
};
const onEngaged = (wake: () => void) => {
  if (engaged) {
    wake();
    return;
  }
  if (engageWaiters.size === 0) {
    for (const type of ENGAGE_EVENTS) {
      window.addEventListener(type, engage, { capture: true, passive: true });
    }
  }
  engageWaiters.add(wake);
};

const gates = new Map<string, Promise<void>>();

const gateFor = (id: string): Promise<void> => {
  const known = gates.get(id);
  if (known) return known;
  const gate = new Promise<void>((open) => {
    const el = document.getElementById(id);
    if (!el) {
      open();
      return;
    }
    let io: IntersectionObserver | null = null;
    const watch = (rootMargin: string) => {
      io?.disconnect();
      io = new IntersectionObserver(
        (entries) => {
          if (!entries.some((entry) => entry.isIntersecting)) return;
          io?.disconnect();
          open();
        },
        { rootMargin },
      );
      io.observe(el);
    };
    watch("0px");
    onEngaged(() => watch(LOOKAHEAD));
  });
  gates.set(id, gate);
  return gate;
};

export const HydrateNear = ({
  id,
  children,
}: {
  /** The block's root element id — what the gate watches. */
  id: string;
  children: ReactNode;
}) => {
  const robot = useRobot();
  if (!robot && typeof window !== "undefined") use(gateFor(id));
  return children;
};
