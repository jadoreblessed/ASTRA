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
 * Each station is a tick rising from a shared baseline with a triangular marker
 * at its foot, a gradient index numeral, a Mulish title, and a line of body copy.
 * The masthead (mirror-image gradients, reusing the hero tokens) stays centred at
 * the top while the rail travels beneath it. The shared fixed `HeroNav` is the
 * section's nav.
 */


/* Design-pixel geometry, straight off the Figma frame. */
const FIRST_X = 73; // left edge of the first station's content
const STEP_GAP = 605; // horizontal pitch between stations
const CONTENT_TOP = 579;
const GROUP_WIDTH = 204; // index + title column
const ITEM_WIDTH = 405; // body wrap width
const TICK_OFFSET = 20; // tick sits this far left of the content
const TICK_HEIGHT = 174;
const BASELINE_Y = 754;
const TRI_SIZE = 19;
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
  enabled: boolean;
}

const Station = ({ step, x, index, enabled }: StationProps) => {
  const tickX = x - TICK_OFFSET;
  const gradientId = `timeline-tri-${index}`;
  /* Each station drifts up softly, staggered along the rail. */
  const delayIn = 200 + index * 120;

  return (
    <>
      {/* Vertical tick rising from the baseline. */}
      <Spring
        tag="div"
        aria-hidden="true"
        enabled={enabled}
        mode="once"
        from={{ opacity: 0, scaleY: 0 }}
        to={{ opacity: 1, scaleY: 1 }}
        delayIn={delayIn}
        config={STATION_REVEAL}
        className="absolute w-px origin-bottom"
        style={{
          left: tickX,
          top: CONTENT_TOP,
          height: TICK_HEIGHT,
          backgroundImage: "var(--gradient-timeline-tick)",
        }}
      />
      {/* Triangular marker, centred on the tick, sitting on the baseline. */}
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
        <svg
          width={TRI_SIZE}
          height={TRI_SIZE}
          viewBox="0 0 19 19"
          fill="none"
          className="block"
        >
          <path d="M9.5 0L19 19H0L9.5 0Z" fill={`url(#${gradientId})`} />
          <defs>
            <linearGradient
              id={gradientId}
              x1="0"
              y1="0"
              x2="19"
              y2="19"
              gradientUnits="userSpaceOnUse"
            >
              <stop stopColor="#4977FF" />
              <stop offset="1" stopColor="#D2BDFF" />
            </linearGradient>
          </defs>
        </svg>
      </Spring>

      {/* Content — index, title, body — to the right of the tick. */}
      <Spring
        tag="div"
        enabled={enabled}
        mode="once"
        from={{ opacity: 0, y: 26, filter: "blur(8px)" }}
        to={{ opacity: 1, y: 0, filter: "blur(0px)" }}
        delayIn={delayIn + 120}
        config={STATION_REVEAL}
        className="absolute flex flex-col gap-[18px]"
        style={{ left: x, top: CONTENT_TOP, width: ITEM_WIDTH }}
      >
        <div
          className="flex flex-col gap-[12px]"
          style={{ width: GROUP_WIDTH }}
        >
          <p className="m-0 bg-[image:var(--gradient-hero-icon)] bg-clip-text font-mulish text-[16px] leading-[1.2] font-normal text-transparent [-webkit-background-clip:text]">
            {step.index}
          </p>
          <p className="m-0 font-mulish text-[32px] leading-none font-light text-white">
            {step.title}
          </p>
        </div>
        <p className="m-0 font-mulish text-[16px] leading-[1.2] font-normal text-white/85">
          {step.body}
        </p>
        <p className="m-0 w-fit border border-white/12 px-[10px] py-[7px] font-mono text-[11px] leading-none tracking-[0.12em] text-accent-300 uppercase">
          {step.meta}
        </p>
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
          className="absolute inset-x-0 top-0 flex flex-col gap-[24px]"
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
              className="flex gap-[16px]"
            >
              <div className="flex w-[18px] shrink-0 flex-col items-center pt-[6px]">
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 19 19"
                  fill="none"
                  aria-hidden="true"
                  className="shrink-0"
                >
                  <path d="M9.5 0L19 19H0L9.5 0Z" fill={`url(#tl-m-tri-${i})`} />
                  <defs>
                    <linearGradient
                      id={`tl-m-tri-${i}`}
                      x1="0"
                      y1="0"
                      x2="19"
                      y2="19"
                      gradientUnits="userSpaceOnUse"
                    >
                      <stop stopColor="#4977FF" />
                      <stop offset="1" stopColor="#D2BDFF" />
                    </linearGradient>
                  </defs>
                </svg>
                <span className="mt-[8px] w-px flex-1 bg-[color:var(--timeline-rail)]" />
              </div>

              <div className="flex flex-col gap-[6px] pb-[6px]">
                <p className="m-0 bg-[image:var(--gradient-hero-icon)] bg-clip-text font-mulish text-[14px] leading-none font-normal text-transparent [-webkit-background-clip:text]">
                  {step.index}
                </p>
                <p className="m-0 font-mulish text-[22px] leading-none font-light text-white">
                  {step.title}
                </p>
                <p className="m-0 font-mulish text-[15px] leading-[1.35] font-normal text-white/80">
                  {step.body}
                </p>
                <p className="m-0 mt-[4px] w-fit border border-white/12 px-[8px] py-[5px] font-mono text-[10px] leading-none tracking-[0.12em] text-accent-300 uppercase">
                  {step.meta}
                </p>
              </div>
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
            className="absolute top-[112px] left-[50px] flex w-[230px] flex-col gap-[14px] font-mono text-[11px] leading-none tracking-[0.16em] uppercase"
          >
            <div className="flex items-baseline gap-[10px]">
              <span className="text-white/40">{content.counterLabel}</span>
              <animated.span className="text-[26px] tracking-normal text-white tabular-nums">
                {progress.to((p) => pad(stepAt(p, steps.length)))}
              </animated.span>
              <span className="text-white/40">/ {pad(steps.length)}</span>
            </div>
            <span className="relative block h-px w-full bg-white/15">
              <animated.span
                className="absolute inset-0 origin-left bg-accent-300"
                style={{ transform: progress.to((p) => `scaleX(${p.toFixed(3)})`) }}
              />
            </span>
          </Spring>

          <Spring
            tag="p"
            enabled={revealed}
            mode="once"
            from={{ opacity: 0, x: 16 }}
            to={{ opacity: 1, x: 0 }}
            delayIn={320}
            config={STATION_REVEAL}
            className="absolute top-[118px] right-[50px] m-0 text-right font-mono text-[11px] leading-none tracking-[0.16em] text-white/50 uppercase"
          >
            [ {content.total} ]
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
                x={FIRST_X + i * STEP_GAP}
                enabled={revealed}
              />
            ))}
          </animated.div>
        </div>
        )}
      </animated.div>
    </section>
  );
};
