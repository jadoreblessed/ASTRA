"use client";

import { animated } from "@react-spring/web";
import { RobotText as TextEngine } from "@/components/common/robot-text";

import { Inview } from "@/components/common/robot-inview";
import { useSceneFade } from "@/hooks/sections/use-scene-fade";
import { screens } from "@/lib/scene/screens";
import { cubicBezier } from "@/utils/animation/easing";
import type { BriefContent } from "@/data/mocks/home";

/**
 * Brief — "01 · Roadmap", three engagement phases read as a **timeline rail**:
 * a single hairline runs down the left of the content column and each phase is a
 * station on it — a decorative marker sits on the rail, its content left-aligned
 * to the right. No alternation; the rail is what connects the stations.
 *
 * The original faded each block in once via an IntersectionObserver that added
 * `.-in`, then staggered a stage's children with SCSS `transition-delay`. Here
 * every block is an `<Inview mode="once">`, which observes its own element, and
 * the per-child stagger is reproduced as `delayIn`. The heading is genuine
 * word-by-word text motion, so it goes through `TextEngine` (its words carried a
 * `--i` custom-property stagger the observer could not express).
 *
 * Unlike Hero, this slide does not stay pinned: the section is `position: static`
 * (`views/home.tsx` gives the `<Slide>` `sticky={false}`) so the stations scroll
 * past naturally across the 2.5-viewport slide that lends the terrain its travel.
 */

/** SCSS `$briefEase` — `cubic-bezier(0.22, 1, 0.36, 1)`, not the Hero reveal curve. */
const briefEase = cubicBezier(0.22, 1, 0.36, 1);
/** Every original reveal ran at `transition: ... .7s`. */
const REVEAL = { duration: 700, easing: briefEase } as const;

/** `.brief__kicker { transition-delay: 140ms }`. */
const KICKER_DELAY = 140;
/** Heading words: `calc(var(--i) * 55ms + 240ms)`. */
const WORD_BASE_DELAY = 240;
const WORD_STAGGER = 55;
/** Body waits on the heading: `calc(var(--wc) * 55ms + 340ms)`. */
const BODY_BASE_DELAY = 340;

export interface BriefProps {
  content: BriefContent;
}

export const Brief = ({ content }: BriefProps) => {
  const fade = useSceneFade(screens.ROADMAP);

  return (
    <section
      id="brief"
      aria-label={content.chapter}
      /* `static` opts out of the sticky pin the other slides use — Brief's
         stations flow naturally through its 2.5-viewport slide. The inter-slide
         gap lives on the `<Slide>` anchor, not here. */
      className="relative static flex min-h-screen w-full flex-col items-start pt-[16vh] pb-[6vh] max-hero-xs:pt-[12vh] max-hero-xs:pb-[8vh]"
    >
      <animated.div
        style={fade}
        className="page-gutter flex w-full max-w-[53rem] flex-col"
      >
        {/* The rail: one hairline down the left of the whole content column.
            Markers sit on it (`li` left edge), content is padded off it. */}
        <div className="relative w-full border-l border-accent-500/20">
          {/* Chapter label — the head of the rail, above the first station. */}
          <Inview
            tag="p"
            mode="once"
            from={{ opacity: 0, y: 20 }}
            to={{ opacity: 1, y: 0 }}
            config={REVEAL}
            className="m-0 pl-[3.25rem] font-sans text-[0.6875rem]/none font-medium tracking-[0.34em] text-accent-500/85 uppercase max-md:pl-[2.25rem] max-hero-xs:pl-[1.75rem] max-hero-xs:text-[0.625rem] max-hero-xs:tracking-[0.3em]"
          >
            {content.chapter}
          </Inview>

          <ol className="mt-[10vh] flex flex-col gap-[34vh] max-md:gap-[26vh]">
            {content.phases.map((phase) => {
              const wordCount = phase.heading.split(" ").length;

              return (
                <li
                  key={phase.num}
                  className="relative pl-[3.25rem] max-md:pl-[2.25rem] max-hero-xs:pl-[1.75rem]"
                >
                  {/* Station marker — a small ringed dot sitting on the rail.
                      Purely decorative, so it leaves the reading order. */}
                  <span
                    aria-hidden="true"
                    className="absolute top-[3.25rem] left-0 size-[0.4375rem] -translate-x-1/2 rounded-full bg-accent-500/80 ring-1 ring-accent-500/30 max-hero-md:top-[2.5rem] max-hero-xs:top-[2rem]"
                  />

                  <article className="relative flex flex-col pt-[3rem] max-hero-md:pt-[2.25rem] max-hero-xs:pt-[1.75rem]">
                    {/* Ghosted numeral — a large, low-alpha index sitting behind
                        the kicker. Decorative, hidden from the reading order. */}
                    <Inview
                      tag="span"
                      mode="once"
                      from={{ opacity: 0, y: 22 }}
                      to={{ opacity: 1, y: 0 }}
                      config={REVEAL}
                      aria-hidden="true"
                      className="pointer-events-none absolute top-0 left-0 block font-lato text-[7rem]/[0.8] font-normal tracking-[-0.02em] text-accent-500/15 select-none max-hero-md:text-[5rem] max-hero-xs:text-[3.5rem]"
                    >
                      {phase.num}
                    </Inview>

                    <Inview
                      tag="p"
                      mode="once"
                      from={{ opacity: 0, y: 22 }}
                      to={{ opacity: 1, y: 0 }}
                      delayIn={KICKER_DELAY}
                      config={REVEAL}
                      className="relative mb-[1.125rem] font-sans text-xs/none font-semibold tracking-[0.34em] text-accent-500 uppercase max-hero-xs:text-[0.6875rem] max-hero-xs:tracking-[0.3em]"
                    >
                      {phase.kicker}
                    </Inview>

                    {/* Word-by-word lift — `y` stays numeric (px) in both states
                        so the spring never crosses value types. */}
                    <TextEngine
                      tag="h2"
                      mode="once"
                      wordIn={{ y: 0, opacity: 1 }}
                      wordOut={{ y: 22, opacity: 0 }}
                      wordStagger={WORD_STAGGER}
                      delayIn={WORD_BASE_DELAY}
                      wordConfig={REVEAL}
                      className="relative m-0 max-w-full font-lato text-[2.875rem]/[1.18] font-normal tracking-[0.005em] text-balance text-foreground max-hero-md:text-[2rem] max-hero-md:leading-[1.2] max-hero-xs:text-[1.625rem]"
                    >
                      {phase.heading}
                    </TextEngine>

                    <Inview
                      tag="p"
                      mode="once"
                      from={{ opacity: 0, y: 22 }}
                      to={{ opacity: 1, y: 0 }}
                      delayIn={wordCount * WORD_STAGGER + BODY_BASE_DELAY}
                      config={REVEAL}
                      className="relative mt-[1.5rem] max-w-[54ch] font-sans text-base/[1.7] font-normal text-foreground/72 max-hero-md:text-sm max-hero-xs:text-[0.84375rem] max-hero-xs:leading-[1.65]"
                    >
                      {phase.body}
                    </Inview>
                  </article>
                </li>
              );
            })}
          </ol>
        </div>
      </animated.div>
    </section>
  );
};
