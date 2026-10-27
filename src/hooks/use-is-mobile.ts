"use client";

import { useSyncExternalStore } from "react";

import { useMobileHint } from "@/components/common/device-hint";
import { getWindowSize, subscribeWindowSize } from "@/hooks/use-window-size";

/**
 * Below this width the sections stop scaling their 1440×800 desktop composition
 * and reflow into their native mobile layout instead (stacked, readable copy,
 * a burger nav). It sits one pixel above the `hero-md` design breakpoint so the
 * scaled composition is only ever used on genuinely wide viewports.
 */
export const MOBILE_MAX = 856;

/**
 * Are we rendering the mobile reflow rather than the scaled desktop composition?
 *
 * The server and the hydration render answer with the server's device hint
 * (`useMobileHint` — the proxy served the phone form), so a phone's first HTML
 * is already the mobile composition and hydrates as it is. After hydration the
 * measured width decides; the store yields a boolean, so a correct hint costs
 * no re-render at all, and a wrong one (a narrow desktop window, a phone with a
 * desktop UA) flips once — the sections sit behind the preloader then.
 */
export const useIsMobile = (): boolean => {
  const hint = useMobileHint();
  return useSyncExternalStore(
    subscribeWindowSize,
    () => {
      const { width } = getWindowSize();
      return width > 0 ? width < MOBILE_MAX : hint;
    },
    () => hint,
  );
};
