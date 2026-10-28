"use client";

import { useEffect, useRef, useState } from "react";
import { animated } from "@react-spring/web";

import { Spring } from "@/components/common/robot-spring";
import { AnimatedHeading } from "@/components/animation/animated-heading";
import { easeReveal } from "@/utils/animation/easing";
import { useSections } from "@/hooks/sections/use-sections";
import { useSceneFade } from "@/hooks/sections/use-scene-fade";
import { useSlideProgress } from "@/hooks/sections/use-slide-progress";
import { useHeroLayout } from "@/hooks/use-hero-scale";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { screens } from "@/lib/scene/screens";
import type { TimelineContent, TimelineStep } from "@/data/mocks/home";

import { StepFlow } from "./step-flow";

/**
 * Timeline — the getLayers redesign of the third slide (Figma node 669:1927).
 *
 * Same recipe as the other new sections: a fixed 1440×800 composition scaled to
 * the viewport width (`useHeroLayout("width")`), pinned so it fades in place
 * rather than scrolling. The novelty is intra-section motion: the roadmap slide
 * is 2.5 viewports tall, and its vertical scroll drives the rail **right-to-left**
 * across the whole scene via `useSlideProgress` (which reads the slide's local
 * scroll progress off the shared ticker).
 *
 * Each station is a card standing on a shared baseline over a triangular
 * marker: the step drawn as coins (email → a Solana wallet, USDC/SOL → the
 * basket's assets, many → one, one → many) with a dot running the rails between
 * them, a big index, the title, a line of copy and a fact pill. The rail runs
 * under a fixed playhead at the left, and the card passing it stands forward —
 * lifts, lights its edge and index, its marker swells and fills — while the rest
 * sit back. On a phone the same story runs down a list of cards. The
 * shared fixed `HeroNav` is the section's nav.
 */


/* Design-pixel geometry on the 1440×800 frame. */
const FIRST_X = 73; // left edge of the first card
const STEP_GAP = 560; // horizontal pitch between cards
const ITEM_WIDTH = 470; // card width
const TICK_OFFSET = -40; // the marker sits this far in from the card's left edge
const BASELINE_Y = 754;
const TRI_SIZE = 19;
/** The card's foot: just above its marker, joined to it by a short tick. */
const CARD_FOOT = BASELINE_Y - TRI_SIZE - 20;
const SIDE_MARGIN = 73; // trailing margin past the last station

const STATION_REVEAL = { duration: 1200, easing: easeReveal } as const;

/** Two-digit pad for the step readouts. */
const pad = (n: number) => String(n).padStart(2, "0");
/** Which station the rail is on, from the slide's scroll progress. */
const stepAt = (p: number, n: number) => Math.min(n, Math.round(p * (n - 1)) + 1);

export interface TimelineProps {
  content: TimelineContent;
}

interface StationProps {
  step: TimelineStep;
  x: number;
  index: number;
  count: number;
  enabled: boolean;
  progress: ReturnType<typeof useSlideProgress>;
}

/** How lit a station is: full on the one the rail is at, dimmer the farther off. */
const focusAt = (p: number, index: number, count: number) =>
  Math.max(0.3, 1 - Math.abs(p * (count - 1) - index) * 0.6);

/** The same, as 0 (sitting back) → 1 (the one at the playhead). */
const standAt = (p: number, index: number, count: number) =>
  (focusAt(p, index, count) - 0.3) / 0.7;

/** How far the fill has run past station `index`: 0 not reached → 1 passed. */
const passedAt = (p: number, index: number, count: number) =>
  Math.min(1, Math.max(0, p * (count - 1) - index + 1));

const Station = ({ step, x, index, count, enabled, progress }: StationProps) => {
  const tickX = x - TICK_OFFSET;
  /* Each station drifts up softly, staggered along the rail. */
  const delayIn = 200 + index * 120;
  const stand = (p: number) => standAt(p, index, count);

  return (
    <>
      {/* Short tick from the card's foot down to its marker. */}
      <Spring
        tag="div"
        aria-hidden="true"
        enabled={enabled}
        mode="once"
        from={{ opacity: 0, scaleY: 0 }}
        to={{ opacity: 1, scaleY: 1 }}
        delayIn={delayIn}
        config={STATION_REVEAL}
        className="absolute w-px origin-bottom bg-accent-200/40"
        style={{ left: tickX, top: CARD_FOOT, height: BASELINE_Y - TRI_SIZE - CARD_FOOT }}
      />
      {/* Triangular marker on the baseline: swells at the playhead, fills once passed. */}
      <Spring
        tag="div"
        aria-hidden="true"
        enabled={enabled}
        mode="once"
        from={{ opacity: 0, scale: 0.4 }}
        to={{ opacity: 1, scale: 1 }}
        delayIn={delayIn}
        config={STATION_REVEAL}
        className="absolute"
        style={{ left: tickX - TRI_SIZE / 2, top: BASELINE_Y - TRI_SIZE }}
      >
        <animated.svg
          width={TRI_SIZE}
          height={TRI_SIZE}
          viewBox="0 0 19 19"
          fill="none"
          className="block origin-bottom overflow-visible"
          style={{ transform: progress.to((p) => `scale(${(0.85 + 0.45 * stand(p)).toFixed(3)})`) }}
        >
          <path d="M9.5 1.5L17.6 18H1.4L9.5 1.5Z" stroke="#D2BDFF" strokeWidth="1.4" strokeLinejoin="round" />
          <animated.path
            d="M9.5 1.5L17.6 18H1.4L9.5 1.5Z"
            fill="#D2BDFF"
            style={{ opacity: progress.to((p) => passedAt(p, index, count)) }}
          />
        </animated.svg>
      </Spring>

      {/* The step's card. */}
      <Spring
        tag="div"
        enabled={enabled}
        mode="once"
        from={{ opacity: 0, y: 40, filter: "blur(10px)" }}
        to={{ opacity: 1, y: 0, filter: "blur(0px)" }}
        delayIn={delayIn + 120}
        config={STATION_REVEAL}
        className="absolute"
        style={{ left: x, bottom: 800 - CARD_FOOT, width: ITEM_WIDTH }}
      >
        {/* At the playhead the card stands forward and lights its edge; the rest sit back. */}
        <animated.div
          className="flex origin-bottom flex-col gap-[20px] rounded-[28px] border bg-background/85 p-[30px]"
          style={{
            opacity: progress.to((p) => 0.4 + 0.6 * stand(p)),
            borderColor: progress.to((p) => `rgb(210 189 255 / ${(0.08 + 0.42 * stand(p)).toFixed(3)})`),
            transform: progress.to(
              (p) => `translateY(${((1 - stand(p)) * 18).toFixed(2)}px) scale(${(0.95 + 0.05 * stand(p)).toFixed(4)})`,
            ),
          }}
        >
          <div className="flex items-center justify-between gap-[16px]">
            <StepFlow flow={step.flow} size={36} />
            <animated.span
              className="font-mono text-[46px] leading-none"
              style={{
                color: progress.to((p) => `rgb(210 189 255 / ${(0.2 + 0.8 * stand(p)).toFixed(3)})`),
              }}
            >
              {step.index}
            </animated.span>
          </div>
          <p className="m-0 font-mulish text-[36px] leading-none font-light text-white">{step.title}</p>
          <p className="m-0 font-mulish text-[16px] leading-[1.4] font-normal text-white/75">{step.body}</p>
          <p className="m-0 w-fit rounded-full border border-accent-400/30 bg-accent-500/10 px-[14px] py-[8px] font-mulish text-[14px] leading-none text-accent-200">
            {step.meta}
          </p>
        </animated.div>
      </Spring>
    </>
  );
};

/* ------------------------------------------------------------------- mobile */

interface TimelineMobileProps {
  content: TimelineContent;
  revealed: boolean;
  progress: ReturnType<typeof useSlideProgress>;
}

/**
 * Mobile timeline: the same right-to-left rail, turned on its side. The station
 * list is stacked vertically and the slide's scroll progress translates it *up*
 * through a fixed window — the vertical analogue of the desktop rail's translateX.
 * `travel` is the overflow past the window, measured from the DOM so it holds for
 * any station count or viewport height.
 */
const TimelineMobile = ({ content, revealed, progress }: TimelineMobileProps) => {
  const windowRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const [travel, setTravel] = useState(0);

  useEffect(() => {
    const measure = () => {
      const w = windowRef.current;
      const l = listRef.current;
      if (!w || !l) return;
      setTravel(Math.max(0, l.scrollHeight - w.clientHeight));
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [content]);

  return (
    <div className="flex h-full w-full flex-col px-[24px] pt-[92px] pb-[20px]">
      <AnimatedHeading
        tag="h2"
        id="timeline-heading"
        enabled={revealed}
        baseDelay={120}
        stagger={34}
        className="m-0 w-full text-center font-mulish text-[clamp(24px,6.4vw,44px)] leading-[1.06] font-light"
        lines={[
          { text: content.titleTop, opaque: "left" },
          { text: content.titleBottom, opaque: "right" },
        ]}
      />

      <div ref={windowRef} className="relative mt-[22px] flex-1 overflow-hidden">
        <animated.ol
          ref={listRef}
          style={{
            transform: progress.to((p) => `translateY(${(-p * travel).toFixed(1)}px)`),
            // Its own layer: the list moves with every scroll frame, and as part
            // of the slide's layer each frame repainted the whole slide (six
            // filtered stations, gradient-clipped text) — the phone scroll
            // test's timeline drops. Promoted, the move is a composite.
            willChange: "transform",
          }}
          className="absolute inset-x-0 top-0 flex flex-col gap-[18px] pb-[12px]"
        >
          {content.steps.map((step, i) => (
            <Spring
              key={step.index}
              tag="li"
              enabled={revealed}
              mode="once"
              from={{ opacity: 0, y: 18, filter: "blur(6px)" }}
              to={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              delayIn={160 + i * 90}
              config={STATION_REVEAL}
              className="flex gap-[14px]"
            >
              {/* Node + the rail down to the next one, filling as you scroll. */}
              <div aria-hidden="true" className="flex w-[16px] shrink-0 flex-col items-center pt-[20px]">
                <span className="relative flex size-[16px] shrink-0 items-center justify-center rounded-full border-[1.5px] border-accent-200">
                  <animated.span
                    className="size-[8px] rounded-full bg-accent-200"
                    style={{
                      transform: progress.to((p) => `scale(${passedAt(p, i, content.steps.length).toFixed(3)})`),
                    }}
                  />
                </span>
                {i < content.steps.length - 1 && (
                  <span className="relative mt-[6px] -mb-[18px] w-[2px] flex-1 overflow-hidden rounded-full bg-white/10">
                    <animated.span
                      className="absolute inset-0 origin-top bg-accent-200"
                      style={{
                        transform: progress.to(
                          (p) => `scaleY(${passedAt(p, i + 1, content.steps.length).toFixed(3)})`,
                        ),
                      }}
                    />
                  </span>
                )}
              </div>

              {/* The step's card — the one being read stands forward. */}
              <animated.div
                className="flex flex-1 flex-col gap-[8px] rounded-[20px] border border-white/[0.09] bg-background/80 px-[18px] py-[16px]"
                style={{
                  opacity: progress.to((p) => 0.45 + 0.55 * standAt(p, i, content.steps.length)),
                  borderColor: progress.to(
                    (p) => `rgb(210 189 255 / ${(0.08 + 0.32 * standAt(p, i, content.steps.length)).toFixed(3)})`,
                  ),
                  transform: progress.to(
                    (p) => `scale(${(0.97 + 0.03 * standAt(p, i, content.steps.length)).toFixed(4)})`,
                  ),
                }}
              >
                <div className="flex items-center justify-between gap-[12px]">
                  <StepFlow flow={step.flow} size={26} />
                  <span className="font-mono text-[22px] leading-none text-accent-200">{step.index}</span>
                </div>
                <p className="m-0 mt-[4px] font-mulish text-[22px] leading-none font-light text-white">
                  {step.title}
                </p>
                <p className="m-0 font-mulish text-[15px] leading-[1.4] font-normal text-white/75">
                  {step.body}
                </p>
                <p className="m-0 mt-[4px] w-fit rounded-full border border-accent-400/30 bg-accent-500/10 px-[12px] py-[7px] font-mulish text-[13px] leading-none text-accent-200">
                  {step.meta}
                </p>
              </animated.div>
            </Spring>
          ))}
        </animated.ol>
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ section */

export const Timeline = ({ content }: TimelineProps) => {
  const active = useSections((state) => state.active);
  const isLoaded = useSections((state) => state.isLoaded);
  const isMobile = useIsMobile();
  const fade = useSceneFade(screens.ROADMAP);
  const progress = useSlideProgress(screens.ROADMAP);
  /* `width` fit: the rail spans the full viewport width, matching the mockup's
     edge-to-edge baseline and side insets on every screen. */
  const { scale } = useHeroLayout("width");

  const [revealed, setRevealed] = useState(false);
  useEffect(() => {
    if (active === screens.ROADMAP) setRevealed(true);
  }, [active]);

  const steps = content.steps;
  const lastX = FIRST_X + (steps.length - 1) * STEP_GAP;
  /* Travel brings the final station to where the first one started. */
  const travel = lastX - FIRST_X;
  const trackWidth = lastX + ITEM_WIDTH + SIDE_MARGIN;

  return (
    <section
      id="timeline"
      aria-labelledby="timeline-heading"
      className="relative h-svh w-full"
    >
      {/* Pinned to the viewport: fades in place, never scrolls. */}
      <animated.div
        style={{
          // Hidden until the scene has loaded, so it never bleeds through the
          // preloader.
          opacity: isLoaded ? fade.opacity : 0,
          pointerEvents: active === screens.ROADMAP ? "auto" : "none",
        }}
        className="fixed inset-0 overflow-hidden"
      >
        {isMobile ? (
          <TimelineMobile
            content={content}
            revealed={revealed}
            progress={progress}
          />
        ) : (
        /* The 1440×800 design frame, centred and scaled to viewport width. */
        <div
          className="absolute top-1/2 left-1/2 h-[800px] w-[1440px]"
          style={{ transform: `translate(-50%, -50%) scale(${scale})` }}
        >
          {/* Masthead — per-letter cascade from the bright ends. */}
          <AnimatedHeading
            tag="h2"
            id="timeline-heading"
            enabled={revealed}
            baseDelay={120}
            className="absolute top-[100px] left-[389px] m-0 w-[663px] text-center font-mulish text-[56px] leading-none font-light"
            lines={[
              { text: content.titleTop, opaque: "left" },
              { text: content.titleBottom, opaque: "right" },
            ]}
          />

          {/* Live step counter — follows the rail as it scrolls, with a fill bar. */}
          <Spring
            tag="div"
            enabled={revealed}
            mode="once"
            from={{ opacity: 0, x: -16 }}
            to={{ opacity: 1, x: 0 }}
            delayIn={260}
            config={STATION_REVEAL}
            className="absolute top-[108px] left-[50px] flex w-[240px] flex-col gap-[16px] font-mulish leading-none"
          >
            <div className="flex items-baseline gap-[10px]">
              <animated.span className="font-mono text-[34px] font-normal text-white tabular-nums">
                {progress.to((p) => pad(stepAt(p, steps.length)))}
              </animated.span>
              <span className="font-mono text-[17px] text-white/40">/ {pad(steps.length)}</span>
            </div>
            <span className="relative block h-[2px] w-full overflow-hidden rounded-full bg-white/12">
              <animated.span
                className="absolute inset-0 origin-left rounded-full"
                style={{
                  backgroundImage: "var(--gradient-hero-icon)",
                  transform: progress.to((p) => `scaleX(${Math.max(0.02, p).toFixed(3)})`),
                }}
              />
            </span>
          </Spring>

          {/* The rail — a wide track that travels right-to-left with scroll. */}
          <animated.div
            className="absolute top-0 left-0 h-[800px]"
            style={{
              width: trackWidth,
              transform: progress.to(
                (p) => `translateX(${(-p * travel).toFixed(2)}px)`,
              ),
              // A composite per scroll frame, not a repaint (as the phone list).
              willChange: "transform",
            }}
          >
            {/* Shared baseline. Gated on `revealed` (not just the layer's
                isLoaded fade): it is the one full-width static element here, and
                without its own gate it flashed as a horizontal stripe over the
                preloader in the load-race frame where `activeScreen` is still NONE
                (which makes every section's scene-fade read 1) but `isLoaded` has
                already flipped true. */}
            <Spring
              tag="div"
              aria-hidden="true"
              enabled={revealed}
              mode="once"
              from={{ opacity: 0, scaleX: 0 }}
              to={{ opacity: 1, scaleX: 1 }}
              delayIn={120}
              config={STATION_REVEAL}
              className="absolute h-px origin-left"
              style={{
                left: 50,
                top: BASELINE_Y,
                width: trackWidth - 100,
                backgroundColor: "var(--timeline-rail)",
              }}
            />
            {steps.map((step, i) => (
              <Station
                key={step.index}
                step={step}
                index={i}
                count={steps.length}
                x={FIRST_X + i * STEP_GAP}
                enabled={revealed}
                progress={progress}
              />
            ))}
          </animated.div>

          {/* The playhead: fixed while the rail runs beneath it. */}
          <Spring
            tag="div"
            aria-hidden="true"
            enabled={revealed}
            mode="once"
            from={{ opacity: 0, scale: 0 }}
            to={{ opacity: 1, scale: 1 }}
            delayIn={400}
            config={STATION_REVEAL}
            className="absolute size-[11px] rounded-full border-2 border-background bg-accent-200"
            style={{ left: FIRST_X - TICK_OFFSET - 5.5, top: BASELINE_Y - 5 }}
          />
        </div>
        )}
      </animated.div>
    </section>
  );
};
