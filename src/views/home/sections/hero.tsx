"use client";

import { useEffect, useState } from "react";
import { animated, useSpring } from "@react-spring/web";

import { Spring } from "@/components/common/robot-spring";
import { useRobot } from "@/components/common/robot-view";
import { CountUp } from "@/components/common/count-up";
import { AnimatedHeading } from "@/components/animation/animated-heading";
import { AnimatedText } from "@/components/animation/animated-text";
import { ContactForm } from "@/views/home/sections/contact-form";
import { HeroIcon } from "@/views/home/sections/hero-icon";
import { useSections } from "@/hooks/sections/use-sections";
import { useSceneFade } from "@/hooks/sections/use-scene-fade";
import { useHeroLayout } from "@/hooks/use-hero-scale";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { screens } from "@/lib/scene/screens";
import { easeReveal } from "@/utils/animation/easing";
import type { HeroContent } from "@/data/mocks/home";

/**
 * Hero — the getLayers redesign (Figma node 665:1694).
 *
 * Desktop is a single fixed 1440×800 composition rendered at literal design
 * pixels and scaled as one unit by `useHeroLayout`, so the mockup's proportions
 * hold at every wide viewport. Below `hero-md` it reflows (`useIsMobile`) into a
 * centred vertical stack — the same four pieces (masthead, twin-triangle mark,
 * subtitle, contact form) sized for a phone rather than shrunk to nothing.
 *
 * Both layouts fade in on the preloader's `isLoaded` via staggered `<Spring>`s
 * and drift out on `useSceneFade`; the live vortex shows through behind them. The
 * fixed nav is a separate component (`HeroNav`).
 */

/** Matches the preloader's pause before unhiding the hero. */
const REVEAL_BASE_DELAY = 150;
const REVEAL = { duration: 1400, easing: easeReveal } as const;

const delay = (ms: number) => REVEAL_BASE_DELAY + ms;

export interface HeroProps {
  content: HeroContent;
}

export const Hero = ({ content }: HeroProps) => {
  const isMobile = useIsMobile();
  return isMobile ? (
    <HeroMobile content={content} />
  ) : (
    <HeroDesktop content={content} />
  );
};

/* ------------------------------------------------------------------ desktop */

const HeroDesktop = ({ content }: HeroProps) => {
  const isLoaded = useSections((state) => state.isLoaded);
  const active = useSections((state) => state.active);
  const fade = useSceneFade(screens.HERO);
  const { scale } = useHeroLayout();

  return (
    <section
      id="hero"
      aria-label={`${content.titleTop} ${content.titleBottom}`}
      className="relative h-svh w-full"
    >
      {/* Pinned to the viewport: the composition fades in place as the slide
          leaves. `pointer-events` follow the active slide. */}
      <animated.div
        style={{
          opacity: fade.opacity,
          pointerEvents: active === screens.HERO ? "auto" : "none",
        }}
        className="fixed inset-0 overflow-hidden"
      >
        {/* The 1440×800 design frame, centred and uniformly scaled. */}
        <div
          className="absolute top-1/2 left-1/2 h-[800px] w-[1440px]"
          style={{ transform: `translate(-50%, -50%) scale(${scale})` }}
        >
          {/* Masthead — one h1, two lines, per-letter cascade from the bright ends. */}
          <AnimatedHeading
            tag="h1"
            enabled={isLoaded}
            restUntilHydrated
            baseDelay={delay(150)}
            className="absolute top-[100px] left-[389px] m-0 w-[663px] text-center font-mulish text-[56px] leading-none font-light"
            lines={[
              { text: content.titleTop, opaque: "left" },
              { text: content.titleBottom, opaque: "right" },
            ]}
          />

          {/* Twin-triangle mark, ringed by a hairline white circle, over a soft
              black disc that lifts it off the bright particle field. */}
          <Spring
            tag="div"
            enabled={isLoaded}
            restUntilHydrated
            from={{ opacity: 0, scale: 0.82, filter: "blur(10px)" }}
            to={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
            delayIn={delay(300)}
            config={REVEAL}
            className="absolute top-[360px] left-[658.46px] h-[124.97px] w-[123.86px]"
          >
            <span
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-1/2 size-[210px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-black/60 blur-2xl"
            />
            <span
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-1/2 size-[285px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-[color:var(--hero-glass-border)]"
            />
            <HeroIcon
              className="relative size-full"
              token={content.token}
              tickers={content.orbit}
              radius={142.5}
            />
          </Spring>

          {/* Edge readouts — the network on the left, the listings on the right. */}
          <Spring
            tag="div"
            enabled={isLoaded}
            restUntilHydrated
            from={{ opacity: 0, x: -16 }}
            to={{ opacity: 1, x: 0 }}
            delayIn={delay(850)}
            config={REVEAL}
            className="absolute top-[386px] left-[50px] flex flex-col gap-[10px] font-mono text-[11px] leading-none tracking-[0.14em] uppercase"
          >
            <Corners />
            <span className="text-white/40">
              [ {content.hud.network.index} ] {content.hud.network.label}
            </span>
            <span className="text-[14px] tracking-[0.02em] text-white normal-case">
              {content.hud.network.value}
            </span>
            <span className="flex items-center gap-[7px] text-white/55">
              <LiveDot />
              {content.hud.network.live} · slot <LiveSlot start={content.hud.network.slot} />
            </span>
          </Spring>

          <Spring
            tag="div"
            enabled={isLoaded}
            restUntilHydrated
            from={{ opacity: 0, x: 16 }}
            to={{ opacity: 1, x: 0 }}
            delayIn={delay(900)}
            config={REVEAL}
            className="absolute top-[386px] right-[50px] flex flex-col items-end gap-[10px] text-right font-mono text-[11px] leading-none tracking-[0.14em] uppercase"
          >
            <Corners />
            <span className="text-white/40">
              {content.hud.assets.label} [ {content.hud.assets.index} ]
            </span>
            <CountUp
              value={content.hud.assets.value}
              enabled={isLoaded}
              delay={delay(1000)}
              className="text-[28px] tracking-normal text-white"
            />
            <span className="tracking-[0.04em] text-white/55 normal-case">
              {content.hud.assets.breakdown}
            </span>
          </Spring>

          {/* Subtitle — word-by-word fly-up. */}
          <AnimatedText
            enabled={isLoaded}
            restUntilHydrated
            delayIn={delay(500)}
            className="absolute top-[633px] left-[518px] m-0 w-[405px] font-mulish text-[16px] leading-[1.2] font-normal text-white"
          >
            {content.subtitle}
          </AnimatedText>

          {/* Frosted contact-form pill. */}
          <Spring
            tag="div"
            enabled={isLoaded}
            restUntilHydrated
            from={{ opacity: 0, y: 24, filter: "blur(8px)" }}
            to={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            delayIn={delay(650)}
            config={REVEAL}
            className="absolute top-[703px] left-[409px] w-[623px]"
          >
            <ContactForm form={content.form} layout="row" />
          </Spring>
        </div>
      </animated.div>
    </section>
  );
};

/* ------------------------------------------------------------------- mobile */

const HeroMobile = ({ content }: HeroProps) => {
  const isLoaded = useSections((state) => state.isLoaded);
  const active = useSections((state) => state.active);
  const fade = useSceneFade(screens.HERO);

  return (
    <section
      id="hero"
      aria-label={`${content.titleTop} ${content.titleBottom}`}
      className="relative h-svh w-full"
    >
      <animated.div
        style={{
          opacity: fade.opacity,
          pointerEvents: active === screens.HERO ? "auto" : "none",
        }}
        className="fixed inset-0 overflow-hidden"
      >
        <div className="flex h-full w-full flex-col items-center justify-center gap-[22px] px-[20px] pt-[92px] pb-[28px]">
          <AnimatedHeading
            tag="h1"
            enabled={isLoaded}
            restUntilHydrated
            baseDelay={delay(150)}
            stagger={34}
            className="m-0 w-full text-center font-mulish text-[clamp(24px,6.4vw,44px)] leading-[1.06] font-light"
            lines={[
              { text: content.titleTop, opaque: "left" },
              { text: content.titleBottom, opaque: "right" },
            ]}
          />

          <Spring
            tag="div"
            enabled={isLoaded}
            restUntilHydrated
            from={{ opacity: 0, scale: 0.82, filter: "blur(10px)" }}
            to={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
            delayIn={delay(300)}
            config={REVEAL}
            className="relative my-[6px] size-[92px]"
          >
            <span
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-1/2 size-[150px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-black/60 blur-xl"
            />
            <span
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-1/2 size-[188px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-[color:var(--hero-glass-border)]"
            />
            <HeroIcon
              className="relative size-full"
              token={content.token}
              tickers={content.orbit}
              radius={94}
              compact
            />
          </Spring>

          <AnimatedText
            enabled={isLoaded}
            restUntilHydrated
            delayIn={delay(500)}
            className="m-0 max-w-[400px] font-mulish text-[15px] leading-[1.35] font-normal text-white"
          >
            {content.subtitle}
          </AnimatedText>

          <Spring
            tag="div"
            enabled={isLoaded}
            restUntilHydrated
            from={{ opacity: 0, y: 24, filter: "blur(8px)" }}
            to={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            delayIn={delay(650)}
            config={REVEAL}
            className="w-full max-w-[420px]"
          >
            <ContactForm form={content.form} layout="stack" />
          </Spring>
        </div>
      </animated.div>
    </section>
  );
};

/* ------------------------------------------------------------------ details */

/** Motion is off: reduced-motion users and the robot form get a still page. */
const useStill = () => {
  const robot = useRobot();
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);
  return robot || reduced;
};

/** Two corner ticks bracketing a readout. */
const Corners = () => (
  <>
    <span
      aria-hidden="true"
      className="pointer-events-none absolute -top-[12px] -left-[14px] size-[8px] border-t border-l border-white/35"
    />
    <span
      aria-hidden="true"
      className="pointer-events-none absolute -right-[14px] -bottom-[12px] size-[8px] border-r border-b border-white/35"
    />
  </>
);

/** The LIVE dot — a slow breath, spring-looped. */
const LiveDot = () => {
  const still = useStill();
  const { o } = useSpring({
    from: { o: 1 },
    to: { o: still ? 1 : 0.25 },
    loop: still ? false : { reverse: true },
    config: { duration: 900 },
  });
  return (
    <animated.span
      aria-hidden="true"
      style={{ opacity: o }}
      className="size-[6px] rounded-full bg-signal-glow"
    />
  );
};

/** Solana's slot counter — it really does tick every ~400 ms. */
const LiveSlot = ({ start }: { start: number }) => {
  const still = useStill();
  const [slot, setSlot] = useState(start);
  useEffect(() => {
    if (still) return;
    const id = window.setInterval(() => setSlot((s) => s + 1), 400);
    return () => window.clearInterval(id);
  }, [still]);
  return <span className="tabular-nums text-white/80">{slot.toLocaleString("en-US")}</span>;
};
