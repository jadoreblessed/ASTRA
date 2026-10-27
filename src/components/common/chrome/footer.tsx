"use client";

import { useRef } from "react";

import { Hover } from "@/components/common/touch-hover";
import { scrollToSection } from "@/utils/scroll-to-section";
import { screens } from "@/lib/scene/screens";
import { cubicBezier } from "@/utils/animation/easing";
import type { FooterContent, NavItem, SocialLink } from "@/data/mocks/home";

/**
 * Footer — the normal-flow base beneath the last slide.
 *
 * The original had no entrance animation (it lives outside the scene), so this
 * is pure layout plus hovers. Every SCSS hover animated a token colour —
 * link `rgba(#fff,.6)` → `#fff`, the CTA border/bg warm — so links spring their
 * own opacity (resting 0.6 reads as `foreground/60`) and the CTA's colour
 * crossfade is a stacked overlay, matching the hero pattern. Anchors carry
 * `href` natively, so the `<a>`/`<button>` is the real element and the `<Hover>`
 * wraps its label (spring props can't pass `href`/`type`).
 */

/** CSS `ease` — the SCSS default on every hover. */
const EASE = cubicBezier(0.25, 0.1, 0.25, 1);
const HOVER = { duration: 300, easing: EASE } as const;
/** The links' quicker `.25s` colour fade. */
const LINK = { duration: 250, easing: EASE } as const;

const FooterNavLink = ({ item }: { item: NavItem }) => {
  const ref = useRef<HTMLButtonElement>(null);

  return (
    <li>
      <button
        ref={ref}
        type="button"
        onClick={() => scrollToSection(item.target)}
        className="inline-flex items-center max-md:min-h-11"
      >
        <Hover
          tag="span"
          trigger={ref}
          from={{ opacity: 0.6 }}
          to={{ opacity: 1 }}
          config={LINK}
          className="font-sans text-[0.875rem] leading-none tracking-[0.02em] text-foreground"
        >
          {item.label}
        </Hover>
      </button>
    </li>
  );
};

const FooterSocialLink = ({ item }: { item: SocialLink }) => {
  const ref = useRef<HTMLAnchorElement>(null);

  return (
    <li>
      <a
        ref={ref}
        href={item.href}
        rel="noopener"
        className="inline-flex items-center max-md:min-h-11"
      >
        <Hover
          tag="span"
          trigger={ref}
          from={{ opacity: 0.6 }}
          to={{ opacity: 1 }}
          config={LINK}
          className="font-sans text-[0.75rem] leading-none tracking-[0.12em] text-foreground uppercase"
        >
          {item.label}
        </Hover>
      </a>
    </li>
  );
};

export interface FooterProps {
  content: FooterContent;
}

export const Footer = ({ content }: FooterProps) => {
  const ctaRef = useRef<HTMLAnchorElement>(null);
  const topRef = useRef<HTMLButtonElement>(null);

  return (
    <footer
      id="footer"
      /* Top margin and padding are tightened so the closing plate reads as one
         continuous panel with Impact above it (the old `60vh` gap left it
         floating far below). The gradient wash still eases it in from the
         `--background` the faded scene leaves behind. */
      className="relative z-[2] mt-[16vh] w-full bg-[image:var(--gradient-footer)] pt-[4rem] pb-14 max-hero-md:mt-[10vh] max-hero-md:pt-[3.25rem] max-hero-md:pb-11"
    >
      {/* Hairline top rule fading out toward the edges. */}
      <span
        aria-hidden="true"
        className="absolute top-0 left-1/2 h-px w-[min(100%,var(--container-max))] -translate-x-1/2 bg-[image:var(--gradient-footer-rule)]"
      />

      <div className="page-gutter flex w-full flex-col">
        {/* Top band — wordmark + tagline, CTA on the right. */}
        <div className="flex items-end justify-between gap-10 pb-[3.375rem] max-hero-md:flex-col max-hero-md:items-start max-hero-md:gap-[1.875rem] max-hero-md:pb-10">
          <div>
            <p className="m-0 font-lato text-[clamp(2.875rem,7vw,5.75rem)]/[0.9] tracking-[0.04em] text-foreground">
              {content.wordmark}
            </p>
            <p className="mt-[1.125rem] max-w-[34ch] font-sans text-[0.9375rem]/[1.6] text-foreground/56">
              {content.tagline}
            </p>
          </div>

          <a
            ref={ctaRef}
            href={content.ctaHref}
            className="relative inline-flex shrink-0 items-center gap-3 rounded-[6.25rem] border border-foreground/18 px-[1.625rem] py-[0.9375rem] font-sans text-[0.875rem] leading-none font-medium tracking-[0.04em] text-foreground"
          >
            <Hover
              tag="span"
              trigger={ctaRef}
              from={{ opacity: 0 }}
              to={{ opacity: 1 }}
              config={HOVER}
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 rounded-[6.25rem] border border-accent-500/55 bg-accent-500/8"
            />
            <span className="relative">{content.ctaLabel}</span>
            <Hover
              tag="span"
              trigger={ctaRef}
              from={{ x: 0 }}
              to={{ x: 4 }}
              config={HOVER}
              aria-hidden="true"
              className="relative text-[0.875rem] text-accent-500/95"
            >
              →
            </Hover>
          </a>
        </div>

        {/* Nav band — primary links left, social right; hairline-ruled top and
            bottom in the accent tone to rhyme with the Impact ledger rules. */}
        <nav
          aria-label="Footer"
          className="flex items-center justify-between gap-6 border-t border-b border-accent-500/12 py-7 max-hero-md:flex-col max-hero-md:items-start max-hero-md:gap-[1.375rem]"
        >
          <ul className="flex flex-wrap items-center gap-7 max-hero-xs:gap-5">
            {content.nav.map((item) => (
              <FooterNavLink key={item.label} item={item} />
            ))}
          </ul>
          <ul className="flex flex-wrap items-center gap-7 max-hero-xs:gap-5">
            {content.social.map((item) => (
              <FooterSocialLink key={item.label} item={item} />
            ))}
          </ul>
        </nav>

        {/* Baseline — copyright + back-to-top. */}
        <div className="flex items-center justify-between gap-[1.125rem] pt-[1.875rem] max-hero-xs:flex-col max-hero-xs:items-start max-hero-xs:gap-4">
          <p className="m-0 font-sans text-[0.75rem]/[1.5] tracking-[0.04em] text-foreground/38">
            {content.copy}
          </p>
          <button
            ref={topRef}
            type="button"
            onClick={() => scrollToSection(screens.HERO)}
            className="inline-flex items-center text-foreground max-md:min-h-11"
          >
            <Hover
              tag="span"
              trigger={topRef}
              from={{ opacity: 0.6 }}
              to={{ opacity: 1 }}
              config={LINK}
              className="inline-flex items-center gap-2 font-sans text-[0.75rem] leading-none font-medium tracking-[0.14em] uppercase"
            >
              Back to top
              <Hover
                tag="span"
                trigger={topRef}
                from={{ y: 0 }}
                to={{ y: -3 }}
                config={HOVER}
                aria-hidden="true"
              >
                ↑
              </Hover>
            </Hover>
          </button>
        </div>
      </div>
    </footer>
  );
};
