"use client";

import { useEffect } from "react";
import { useSections } from "@/hooks/sections/use-sections";
import { scrollToSection } from "@/utils/scroll-to-section";

export interface SectionDeepLinkProps {
  /** Screen id to scroll to once the scene has loaded. */
  target: string;
}

/**
 * Scrolls to a section when the page is entered on a deep-link route.
 *
 * The original watched `useLocation()` and dispatched the matching screen. Here
 * the route segment is resolved on the server and the target handed down; the
 * scroll waits for `isLoaded` because the slide anchors have no measured height
 * until the scene's preloader finishes and the controller starts ticking.
 *
 * Renders nothing.
 */
export const SectionDeepLink = ({ target }: SectionDeepLinkProps) => {
  const isLoaded = useSections((state) => state.isLoaded);

  useEffect(() => {
    if (!isLoaded) return;
    scrollToSection(target);
  }, [isLoaded, target]);

  return null;
};
