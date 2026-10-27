"use client";

import { useEffect, useRef } from "react";
import { useShallow } from "zustand/react/shallow";

import { Spring } from "@/components/common/robot-spring";
import { Hover } from "@/components/common/touch-hover";
import { useSections } from "@/hooks/sections/use-sections";
import { useScroll } from "@/hooks/smooth-scroll/use-scroll";
import { scrollToSection } from "@/utils/scroll-to-section";
import { cubicBezier } from "@/utils/animation/easing";
import type { MenuContent, NavItem } from "@/data/mocks/home";

/**
 * Menu — the full-screen mobile chapter overlay.
 *
 * The original used `<CSSTransition classNames="menu" timeout={700}>` with a
 * `--i`-indexed stagger and `toggleScroll`. Here the overlay is mounted while
 * `isMenuOpen` and its enter is a set of `<Spring>`s — the stagger is a
 * per-item `delayIn`, matching the SCSS `--i * 60ms + 120ms`. Scrolling is
 * locked through the Lenis store instead of a body-class toggle.
 *
 * Resting link colours are expressed as full-opacity text at a springable
 * opacity (e.g. accent at 0.7), so hover can spring opacity → 1 the way the
 * SCSS animated the colour — react-spring can't tween the token itself.
 */

/** CSS `ease-out` — the overlay/stagger reveal curve. */
const EASE_OUT = cubicBezier(0, 0, 0.58, 1);
/** CSS `ease` — the per-element hover curve. */
const EASE = cubicBezier(0.25, 0.1, 0.25, 1);

const OVERLAY = { duration: 400, easing: EASE_OUT } as const;
const ITEM = { duration: 450, easing: EASE_OUT } as const;
const META = { duration: 400, easing: EASE_OUT } as const;
const HOVER = { duration: 300, easing: EASE } as const;

/** SCSS: `transition-delay: calc(var(--i) * 60ms + 120ms)`. */
const ITEM_STAGGER = 60;
const ITEM_BASE_DELAY = 120;
const EYEBROW_DELAY = 60;
const CTA_DELAY = 380;

interface MenuItemProps {
  item: NavItem;
  index: number;
  open: boolean;
  onSelect: () => void;
}

const MenuItem = ({ item, index, open, onSelect }: MenuItemProps) => {
  const ref = useRef<HTMLButtonElement>(null);

  return (
    <Spring
      tag="li"
      enabled={open}
      from={{ opacity: 0, y: 12 }}
      to={{ opacity: 1, y: 0 }}
      delayIn={ITEM_BASE_DELAY + index * ITEM_STAGGER}
      config={ITEM}
      className="border-b border-accent-500/14"
    >
      <button
        ref={ref}
        type="button"
        onClick={onSelect}
        className="grid w-full grid-cols-[2.75rem_1fr_auto] items-center gap-[1.125rem] px-1 py-[1.375rem] text-left text-foreground max-hero-xs:grid-cols-[2.25rem_1fr_auto] max-hero-xs:gap-[0.875rem] max-hero-xs:px-0.5 max-hero-xs:py-5 max-[360px]:px-0 max-[360px]:py-[1.125rem]"
      >
        <Hover
          tag="span"
          trigger={ref}
          from={{ opacity: 0.7 }}
          to={{ opacity: 1 }}
          config={HOVER}
          className="font-sans text-[0.6875rem] leading-none font-medium tracking-[0.28em] text-accent-500"
        >
          {String(index + 1).padStart(2, "0")}
        </Hover>
        <span className="font-lato text-[1.625rem] leading-none tracking-[0.02em] text-foreground/92 uppercase max-hero-xs:text-[1.375rem] max-[360px]:text-[1.25rem]">
          {item.label}
        </span>
        <Hover
          tag="span"
          trigger={ref}
          from={{ x: 0, opacity: 0.6 }}
          to={{ x: 4, opacity: 1 }}
          config={HOVER}
          aria-hidden="true"
          className="text-[1.125rem] text-accent-300 max-hero-xs:text-[1rem]"
        >
          →
        </Hover>
      </button>
    </Spring>
  );
};

export interface MenuProps {
  content: MenuContent;
}

export const Menu = ({ content }: MenuProps) => {
  const isMenuOpen = useSections((state) => state.isMenuOpen);
  const setIsMenuOpen = useSections((state) => state.setIsMenuOpen);
  const [start, stop] = useScroll(useShallow((s) => [s.start, s.stop]));
  const ctaRef = useRef<HTMLElement>(null);

  // Lock Lenis while the overlay is up (the original's `toggleScroll`), and
  // always release it on unmount so a lingering lock can't strand the page.
  useEffect(() => {
    if (isMenuOpen) stop();
    else start();
    return () => start();
  }, [isMenuOpen, start, stop]);

  const select = (target: string) => {
    scrollToSection(target);
    setIsMenuOpen(false);
  };

  /* The overlay stays mounted so its exit spring can play — unmounting on close
   * would snap it away, where the original crossfaded out over .35s. While
   * closed it is inert and click-through, so a transparent full-screen layer
   * can neither swallow pointer events nor trap focus. */
  return (
    <Spring
      tag="div"
      id="menu"
      enabled={isMenuOpen}
      from={{ opacity: 0 }}
      to={{ opacity: 1 }}
      config={OVERLAY}
      inert={!isMenuOpen}
      aria-hidden={!isMenuOpen}
      className={`fixed inset-0 z-[100] bg-surface-panel/55 backdrop-blur-[30px] backdrop-saturate-[1.4] min-[913px]:hidden ${
        isMenuOpen ? "" : "pointer-events-none"
      }`}
    >
      <div className="mx-auto flex h-full w-full max-w-[32.5rem] flex-col px-7 pt-[7.5rem] pb-12 max-hero-xs:px-[1.375rem] max-hero-xs:pt-24 max-hero-xs:pb-9">
        <Spring
          tag="p"
          enabled={isMenuOpen}
          from={{ opacity: 0, y: 12 }}
          to={{ opacity: 1, y: 0 }}
          delayIn={EYEBROW_DELAY}
          config={META}
          className="mb-7 font-sans text-[0.6875rem] leading-none font-medium tracking-[0.34em] text-accent-500/85 uppercase"
        >
          {content.eyebrow}
        </Spring>

        <nav aria-label={content.eyebrow}>
          <ul className="flex flex-col border-t border-accent-500/14">
            {content.links.map((item, i) => (
              <MenuItem
                key={item.target}
                item={item}
                index={i}
                open={isMenuOpen}
                onSelect={() => select(item.target)}
              />
            ))}
          </ul>
        </nav>

        <Spring
          tag="div"
          enabled={isMenuOpen}
          from={{ opacity: 0, y: 12 }}
          to={{ opacity: 1, y: 0 }}
          delayIn={CTA_DELAY}
          config={META}
          className="mt-auto"
        >
          <Hover
            tag="button"
            ref={ctaRef}
            onClick={() => setIsMenuOpen(false)}
            className="relative flex w-full items-center justify-center gap-3 rounded-full border border-accent-500/50 bg-accent-500/8 px-7 py-4 font-sans text-[0.75rem] leading-none font-semibold tracking-[0.24em] text-foreground uppercase shadow-cta"
          >
            <Hover
              tag="span"
              trigger={ctaRef}
              from={{ opacity: 0 }}
              to={{ opacity: 1 }}
              config={HOVER}
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 rounded-full border border-accent-500 bg-accent-500/16"
            />
            <span className="relative">{content.ctaLabel}</span>
            <Hover
              tag="span"
              trigger={ctaRef}
              from={{ x: 0 }}
              to={{ x: 4 }}
              config={HOVER}
              aria-hidden="true"
              className="relative text-[0.875rem] text-accent-300"
            >
              →
            </Hover>
          </Hover>
        </Spring>
      </div>
    </Spring>
  );
};
