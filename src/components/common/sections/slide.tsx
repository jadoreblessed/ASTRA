"use client";

import type { ReactNode } from "react";

export interface SlideProps {
  /** Screen id — the anchor the section controller and nav resolve against. */
  id: string;
  /**
   * Slide height in viewports. Values above 1 buy scroll length for
   * intra-section animation (the Brief terrain morph runs across 2.5).
   */
  vh?: number;
  /**
   * Pin the content to the top of the viewport for the slide's whole scroll
   * range. The original did this with `.slide > * { position: sticky }`, and
   * the Sitemap opted out with `position: static`.
   */
  sticky?: boolean;
  /**
   * Classes for the anchor itself — notably the inter-slide gaps, which the
   * original set on `[data-slide-id="…"]`. They belong here rather than on the
   * section: the controller measures this element's rect, and a margin on a
   * sticky child would shift the pinned content instead of lengthening the slide.
   */
  className?: string;
  children: ReactNode;
}

/**
 * Scroll anchor for one section.
 *
 * The original helios `ControllerSlides` cloned its children to inject
 * `data-slide-id`. That pattern can't cross a Server/Client boundary — a client
 * component may not `cloneElement` server-rendered children — so the anchor is
 * an explicit wrapper instead. `SectionController` finds them by attribute.
 */
export const Slide = ({
  id,
  vh = 1,
  sticky = true,
  className = "",
  children,
}: SlideProps) => (
  <div
    data-slide-id={id}
    className={`relative min-h-screen w-full ${className}`}
    style={vh > 1 ? { minHeight: `${vh * 100}vh` } : undefined}
  >
    <div className={sticky ? "sticky top-0 h-svh w-full" : "static w-full"}>
      {children}
    </div>
  </div>
);
