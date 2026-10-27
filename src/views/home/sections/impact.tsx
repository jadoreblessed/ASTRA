"use client";

import { animated } from "@react-spring/web";

import { Inview } from "@/components/common/robot-inview";
import { useSceneFade } from "@/hooks/sections/use-scene-fade";
import { screens } from "@/lib/scene/screens";
import { cubicBezier } from "@/utils/animation/easing";
import type { ImpactContent } from "@/data/mocks/home";

/**
 * Impact — "02 · Impact", the outcome board. A sticky single-viewport panel
 * (the global `.slide > *` pin, kept via `<Slide>`), now left-aligned to speak
 * the same instrument-panel language as Brief's timeline rail and the Sitemap
 * ledger above it — no more centred stack.
 *
 * The panel fills its viewport with `justify-between`: a header block (chapter
 * micro-label → hairline rule → heading) latches to the top, the metric ledger
 * takes the middle, and the footnote sits at the bottom. That vertical spread is
 * what closes the dead lower half the old centred layout left behind — the
 * inter-slide gap still lives on the `<Slide>` anchor, never on this root.
 *
 * The metrics are a hairline-ruled **ordered list** (`<ol>`/`<li>`), one outcome
 * per row, deliberately rhyming with the Sitemap chapter ledger — each row is a
 * large `font-lato` value on the left and its label on the right, rows parted by
 * `border-t border-accent-500/14`. An `<ol>` (not a `<dl>`) is the honest
 * element: this is a ranked ledger of readings, not a set of term→definition
 * lookups, and it matches the `<ol>` ledgers the two sections above it use.
 *
 * Reveal mirrors Brief: the original observed each `.impact__reveal` block once
 * and eased it in. Here each block is an `<Inview mode="once">`; the metric rows
 * cascade top → bottom via `delayIn` off their index, exactly as the SCSS
 * `calc(var(--i) * 110ms + 140ms)` did. Every `y` stays numeric (px) in both
 * states so the spring never crosses value types.
 */

/** SCSS `$impactEase` — `cubic-bezier(0.22, 1, 0.36, 1)`. */
const impactEase = cubicBezier(0.22, 1, 0.36, 1);
/** Every original reveal ran at `transition: ... .7s`. */
const REVEAL = { duration: 700, easing: impactEase } as const;

/** `.impact__metric { transition-delay: calc(var(--i) * 110ms + 140ms) }`. */
const CARD_BASE_DELAY = 140;
const CARD_STAGGER = 110;

export interface ImpactProps {
  content: ImpactContent;
}

export const Impact = ({ content }: ImpactProps) => {
  const fade = useSceneFade(screens.IMPACT);

  return (
    <section
      id="impact"
      aria-label={content.chapter}
      /* The inter-slide gap lives on the `<Slide>` anchor: a margin here would
         shift the sticky-pinned panel rather than lengthen the slide. Stays
         `h-screen` and pinned — only the content composition changed. */
      className="relative flex h-screen min-h-screen w-full justify-start"
    >
      <animated.div
        style={fade}
        /* Fill the pinned viewport top-to-bottom so no dead half is left: the
           header latches to the top, the ledger spans the middle, the footnote
           drops to the bottom. Top padding clears the fixed header. */
        /* Top padding is a fixed rem, not `vh`: this panel is sticky-pinned, so on
           short viewports a viewport-relative inset collapses under the fixed
           header and the chapter label lands on top of the wordmark. */
        className="page-gutter flex h-full w-full max-w-[53rem] flex-col justify-between pt-36 pb-[9vh] max-hero-md:pt-32 max-hero-md:pb-[7vh] max-hero-xs:pt-28"
      >
        {/* Header — chapter micro-label, a hairline rule, then the heading. */}
        <div className="flex flex-col">
          <Inview
            tag="p"
            mode="once"
            from={{ opacity: 0, y: 20 }}
            to={{ opacity: 1, y: 0 }}
            config={REVEAL}
            className="m-0 font-sans text-[0.6875rem]/none font-medium tracking-[0.34em] text-accent-500/85 uppercase max-hero-xs:text-[0.625rem] max-hero-xs:tracking-[0.3em]"
          >
            {content.chapter}
          </Inview>

          {/* Hairline rule under the label — decorative, out of reading order. */}
          <span
            aria-hidden="true"
            className="mt-[1.375rem] mb-[2.25rem] block h-px w-full bg-accent-500/20 max-hero-md:mt-4 max-hero-md:mb-7 max-hero-xs:mt-3.5 max-hero-xs:mb-6"
          />

          <Inview
            tag="h2"
            mode="once"
            from={{ opacity: 0, y: 22 }}
            to={{ opacity: 1, y: 0 }}
            delayIn={80}
            config={REVEAL}
            className="m-0 max-w-[20ch] font-lato text-[2.875rem]/[1.18] font-normal tracking-[0.005em] text-balance text-foreground max-hero-md:text-[2rem] max-hero-md:leading-[1.2] max-hero-xs:text-[1.625rem]"
          >
            {content.heading}
          </Inview>
        </div>

        {/* Metric ledger — one hairline-ruled row per outcome. */}
        <ol className="flex w-full flex-col">
          {content.metrics.map((metric, i) => (
            <Inview
              key={metric.label}
              tag="li"
              mode="once"
              from={{ opacity: 0, y: 24 }}
              to={{ opacity: 1, y: 0 }}
              delayIn={i * CARD_STAGGER + CARD_BASE_DELAY}
              config={REVEAL}
              className="flex items-baseline justify-between gap-10 border-t border-accent-500/14 py-[clamp(1.125rem,3vh,2rem)] first:border-t-0 max-hero-md:flex-col max-hero-md:items-start max-hero-md:gap-2.5 max-hero-md:py-[clamp(1rem,2.6vh,1.75rem)]"
            >
              <div className="flex items-baseline gap-4 max-hero-xs:gap-3">
                {/* Wide-tracked index — the ledger tell, decorative. */}
                <span
                  aria-hidden="true"
                  className="shrink-0 font-sans text-[0.6875rem]/none font-semibold tracking-[0.28em] text-accent-500/55 max-hero-xs:text-[0.625rem]"
                >
                  {String(i + 1).padStart(2, "0")}
                </span>

                <p className="m-0 flex items-baseline font-lato text-[3.75rem]/[0.95] font-light tracking-[-0.01em] text-foreground max-hero-md:text-[3rem] max-hero-xs:text-[2.5rem]">
                  {metric.value}
                  {metric.suffix ? (
                    // Suffix reads smaller and solid in the accent token.
                    <span className="ml-1 font-lato text-[1.75rem] font-normal text-accent-500 max-hero-md:text-2xl max-hero-xs:text-xl">
                      {metric.suffix}
                    </span>
                  ) : null}
                </p>
              </div>

              <p className="m-0 max-w-[30ch] text-right font-sans text-sm/[1.55] font-normal text-foreground/72 max-hero-md:max-w-[44ch] max-hero-md:text-left max-hero-xs:text-[0.8125rem]">
                {metric.label}
              </p>
            </Inview>
          ))}
        </ol>

        {/* Footnote — low-alpha, anchored to the bottom-left of the board. */}
        <Inview
          tag="p"
          mode="once"
          from={{ opacity: 0, y: 20 }}
          to={{ opacity: 1, y: 0 }}
          delayIn={content.metrics.length * CARD_STAGGER + CARD_BASE_DELAY}
          config={REVEAL}
          className="m-0 max-w-[54ch] font-sans text-[0.8125rem]/[1.6] font-normal tracking-[0.02em] text-foreground/42 max-hero-xs:text-xs"
        >
          {content.foot}
        </Inview>
      </animated.div>
    </section>
  );
};
