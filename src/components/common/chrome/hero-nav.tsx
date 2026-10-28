"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { animated, useSpring } from "@react-spring/web";

import { Spring } from "@/components/common/robot-spring";
import { Hover } from "@/components/common/touch-hover";
import { AstraMark } from "@/components/ui/astra-mark";
import { useSections } from "@/hooks/sections/use-sections";
import { useScroll } from "@/hooks/smooth-scroll/use-scroll";
import { useHeroLayout } from "@/hooks/use-hero-scale";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { scrollToSection } from "@/utils/scroll-to-section";
import { screens } from "@/lib/scene/screens";
import { easeReveal } from "@/utils/animation/easing";
import type { HeroNavContent } from "@/data/mocks/home";
import { FancyButton } from "@/components/ui/fancy-button";

import { HeroNavMenu, type MenuOrigin } from "./hero-nav-menu";

/**
 * Fixed top navigation for the getLayers hero redesign (Figma node 666:1817).
 *
 * Two layouts share one component:
 *  - **Desktop** (`≥ hero-md`): three frosted pills — logo, link row, gradient
 *    CTA — laid out at their literal design pixels and scaled as one by the
 *    shared `useHeroLayout` factor, so the bar keeps the mockup's proportions.
 *    Each pill gets a spring hover (`<Hover>`, auto-off on touch).
 *  - **Mobile** (`< hero-md`): the pills don't scale down to nothing — the bar
 *    reflows to a logo + a burger that opens a full-screen menu
 *    (`hero-nav-menu.tsx`, D-036) of the chapters and the CTA.
 *
 * The scaling wrapper and the fixed/centring wrapper are separate elements: a
 * transform on the scaling node would otherwise become the containing block for
 * the fixed one and break the pin.
 */

const NAV_REVEAL = { duration: 1000, easing: easeReveal } as const;
const HOVER = { tension: 320, friction: 22 } as const;
/** A chapter tap waits for the menu to clear before gliding (ms). */
const NAV_AFTER_CLOSE = 280;

const PILL =
  "rounded-[32px] border border-[color:var(--hero-glass-border)] bg-[var(--hero-glass)] backdrop-blur-[8px]";

export interface HeroNavProps {
  content: HeroNavContent;
}

export const HeroNav = ({ content }: HeroNavProps) => {
  const isMobile = useIsMobile();
  return isMobile ? (
    <HeroNavMobile content={content} />
  ) : (
    <HeroNavDesktop content={content} />
  );
};

/* ------------------------------------------------------------------ desktop */

const HeroNavDesktop = ({ content }: HeroNavProps) => {
  const isLoaded = useSections((state) => state.isLoaded);
  const { scale, navTop } = useHeroLayout();

  return (
    <nav
      aria-label="Primary"
      className="fixed left-1/2 z-[120] -translate-x-1/2"
      style={{ top: navTop }}
    >
      <div style={{ transform: `scale(${scale})`, transformOrigin: "top center" }}>
        <div className="flex items-center gap-1">
          {/* Logo pill — scrolls back to the top, so a real button. */}
          <Spring
            tag="div"
            enabled={isLoaded}
            from={{ opacity: 0, y: -10, filter: "blur(6px)" }}
            to={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            delayIn={120}
            config={NAV_REVEAL}
          >
            <Hover tag="div" from={{ scale: 1 }} to={{ scale: 1.04 }} config={HOVER}>
              <button
                type="button"
                onClick={() => scrollToSection(screens.HERO)}
                aria-label={content.wordmark}
                className={`flex h-[43px] items-center px-[24px] py-[12px] ${PILL}`}
              >
                <span className="flex items-center gap-[10px]">
                  <AstraMark size={24} live className="shrink-0" />
                  <span className="font-mulish text-[18px] leading-none font-normal tracking-[0.04em] text-white">
                    ASTRA
                  </span>
                </span>
              </button>
            </Hover>
          </Spring>

          {/* Link row. */}
          <Spring
            tag="div"
            enabled={isLoaded}
            from={{ opacity: 0, y: -10, filter: "blur(6px)" }}
            to={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            delayIn={220}
            config={NAV_REVEAL}
            className={`flex items-center px-[32px] py-[12px] ${PILL}`}
          >
            <ul className="flex items-center gap-[32px] font-mulish text-[16px] leading-[1.2] font-normal text-white">
              {content.links.map((link) => (
                <NavLink key={link.label} label={link.label} onClick={() => scrollToSection(link.target)} />
              ))}
            </ul>
          </Spring>

          {/* The CTA. */}
          <Spring
            tag="div"
            enabled={isLoaded}
            from={{ opacity: 0, y: -10, filter: "blur(6px)" }}
            to={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            delayIn={320}
            config={NAV_REVEAL}
          >
            <FancyButton href="/app" size="sm" icon="none">
              {content.ctaLabel}
            </FancyButton>
          </Spring>
        </div>
      </div>
    </nav>
  );
};

/* ------------------------------------------------------------------ links */

/** A nav link: brightens and rises on hover while a hairline draws in under it. */
const NavLink = ({ label, onClick }: { label: string; onClick: () => void }) => {
  const [st, api] = useSpring(() => ({ t: 0, config: HOVER }));
  return (
    <li
      className="relative"
      onPointerEnter={() => api.start({ t: 1 })}
      onPointerLeave={() => api.start({ t: 0 })}
    >
      <animated.button
        type="button"
        onClick={onClick}
        className="whitespace-nowrap"
        style={{
          opacity: st.t.to((v) => 0.68 + 0.32 * v),
          transform: st.t.to((v) => `translateY(${(-v * 1.5).toFixed(2)}px)`),
        }}
      >
        {label}
      </animated.button>
      <animated.span
        aria-hidden="true"
        className="absolute -bottom-[5px] left-0 h-px w-full origin-left bg-accent-200"
        style={{ transform: st.t.to((v) => `scaleX(${v.toFixed(3)})`) }}
      />
    </li>
  );
};

/* ------------------------------------------------------------------- mobile */

const HeroNavMobile = ({ content }: HeroNavProps) => {
  const isLoaded = useSections((state) => state.isLoaded);
  const [open, setOpen] = useState(false);
  const [origin, setOrigin] = useState<MenuOrigin>({ x: 0, y: 0, radius: 0 });
  const menuId = useId();
  const toggleRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  /** Whether closing should hand focus back to the burger. */
  const restoreFocus = useRef(false);

  /* Burger → X, driven by `open`. */
  const t = useSpring({ t: open ? 1 : 0, config: { tension: 320, friction: 26 } });

  const close = useCallback((returnFocus: boolean) => {
    restoreFocus.current = returnFocus;
    setOpen(false);
  }, []);

  const toggle = () => {
    if (open) {
      close(true);
      return;
    }
    const button = toggleRef.current;
    if (button) {
      const rect = button.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      // Far enough to reach the furthest corner from the burger.
      const radius = Math.hypot(
        Math.max(x, window.innerWidth - x),
        Math.max(y, window.innerHeight - y),
      );
      setOrigin({ x, y, radius });
    }
    setOpen(true);
  };

  // Scroll lock, Escape, the focus loop, and `inert` on the page behind.
  useEffect(() => {
    if (!open) return;
    const { stop, start } = useScroll.getState();
    stop();
    const root = document.documentElement;
    const previousOverflow = root.style.overflow;
    root.style.overflow = "hidden";
    const main = document.querySelector("main");
    main?.setAttribute("inert", "");
    const toggleButton = toggleRef.current;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        close(true);
        return;
      }
      if (event.key !== "Tab") return;
      const panel = panelRef.current;
      if (!panel || !toggleButton) return;
      const focusables = [
        toggleButton,
        ...panel.querySelectorAll<HTMLElement>("button, a[href]"),
      ];
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);

    // The panel mounted in this same commit, so focus can move in now.
    panelRef.current?.querySelector<HTMLElement>("button")?.focus({
      preventScroll: true,
    });

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      main?.removeAttribute("inert");
      root.style.overflow = previousOverflow;
      start();
      if (restoreFocus.current) toggleButton?.focus({ preventScroll: true });
      restoreFocus.current = false;
    };
  }, [open, close]);

  /** Close first, then glide once the page can scroll again. */
  const go = (target: string) => {
    const wasOpen = open;
    close(false);
    if (!wasOpen) {
      scrollToSection(target);
      return;
    }
    window.setTimeout(() => scrollToSection(target), NAV_AFTER_CLOSE);
  };

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 top-0 z-[120] px-[16px] pt-[16px]"
    >
      <Spring
        tag="div"
        enabled={isLoaded}
        from={{ opacity: 0, y: -10, filter: "blur(6px)" }}
        to={{ opacity: 1, y: 0, filter: "blur(0px)" }}
        delayIn={120}
        config={NAV_REVEAL}
        className="relative flex items-center justify-between"
      >
        {/* Logo pill. */}
        <button
          type="button"
          onClick={() => go(screens.HERO)}
          aria-label={content.wordmark}
          className={`flex h-[44px] items-center px-[20px] ${PILL}`}
        >
          <span className="flex items-center gap-[9px]">
            <AstraMark size={23} live className="shrink-0" />
            <span className="font-mulish text-[17px] leading-none font-normal tracking-[0.04em] text-white">
              ASTRA
            </span>
          </span>
        </button>

        {/* Burger toggle — stays above the menu and crosses into its ×. */}
        <button
          ref={toggleRef}
          type="button"
          onClick={toggle}
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          aria-controls={menuId}
          className={`relative flex size-[44px] items-center justify-center ${PILL} !rounded-full`}
        >
          <span className="relative block size-[18px]">
            <animated.span
              className="absolute left-0 block h-[1.5px] w-full rounded-full bg-white"
              style={{
                top: 4,
                transformOrigin: "center",
                transform: t.t.to(
                  (v) => `translateY(${v * 4.25}px) rotate(${v * 45}deg)`,
                ),
              }}
            />
            <animated.span
              className="absolute top-1/2 left-0 block h-[1.5px] w-full -translate-y-1/2 rounded-full bg-white"
              style={{ opacity: t.t.to((v) => 1 - v) }}
            />
            <animated.span
              className="absolute left-0 block h-[1.5px] w-full rounded-full bg-white"
              style={{
                bottom: 4,
                transformOrigin: "center",
                transform: t.t.to(
                  (v) => `translateY(${-v * 4.25}px) rotate(${-v * 45}deg)`,
                ),
              }}
            />
          </span>
        </button>

      </Spring>

      <HeroNavMenu
        id={menuId}
        ref={panelRef}
        open={open}
        origin={origin}
        content={content}
        onGo={go}
      />
    </nav>
  );
};
