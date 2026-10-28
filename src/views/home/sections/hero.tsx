"use client";

import { animated } from "@react-spring/web";

import { Spring } from "@/components/common/robot-spring";
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
 * Hero — the getLayers redesign (Figma node 665:1694), with ASTRA's centre.
 *
 * Desktop is a single fixed 1440×800 composition rendered at literal design
 * pixels and scaled as one unit by `useHeroLayout`, so the mockup's proportions
 * hold at every wide viewport. Below `hero-md` it reflows (`useIsMobile`) into a
 * centred vertical stack — masthead, the orbiting token, subtitle, action pill —
 * sized for a phone rather than shrunk to nothing.
 *
 * Both layouts fade in on the preloader's `isLoaded` via staggered `<Spring>`s
 * and drift out on `useSceneFade`; the live vortex shows through behind them.
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
      <animated.div
        style={{
          opacity: fade.opacity,
          pointerEvents: active === screens.HERO ? "auto" : "none",
        }}
        className="fixed inset-0 overflow-hidden"
      >
        <div
          className="absolute top-1/2 left-1/2 h-[800px] w-[1440px]"
          style={{ transform: `translate(-50%, -50%) scale(${scale})` }}
        >
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

          {/* The token, every market in orbit around it. */}
          <Spring
            tag="div"
            enabled={isLoaded}
            restUntilHydrated
            from={{ opacity: 0, scale: 0.7, filter: "blur(14px)" }}
            to={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
            delayIn={delay(300)}
            config={REVEAL}
            className="absolute top-[360px] left-[658px] h-[125px] w-[124px]"
          >
            <HeroIcon
              className="relative size-full"
              outer={content.orbit.outer}
              inner={content.orbit.inner}
            />
          </Spring>

          <AnimatedText
            enabled={isLoaded}
            restUntilHydrated
            delayIn={delay(500)}
            className="absolute top-[618px] left-[490px] m-0 w-[460px] text-center font-mulish text-[17px] leading-[1.35] font-normal text-white/85"
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
            className="absolute top-[700px] left-0 flex w-[1440px] justify-center"
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
        <div className="flex h-full w-full flex-col items-center justify-center gap-[26px] px-[20px] pt-[92px] pb-[28px]">
          <AnimatedHeading
            tag="h1"
            enabled={isLoaded}
            restUntilHydrated
            baseDelay={delay(150)}
            stagger={34}
            className="m-0 w-full text-center font-mulish text-[clamp(26px,7vw,44px)] leading-[1.06] font-light"
            lines={[
              { text: content.titleTop, opaque: "left" },
              { text: content.titleBottom, opaque: "right" },
            ]}
          />

          <Spring
            tag="div"
            enabled={isLoaded}
            restUntilHydrated
            from={{ opacity: 0, scale: 0.7, filter: "blur(12px)" }}
            to={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
            delayIn={delay(300)}
            config={REVEAL}
            className="relative my-[34px] size-[92px]"
          >
            <HeroIcon
              className="relative size-full"
              outer={content.orbit.outer.slice(0, 6)}
              inner={content.orbit.inner.slice(0, 4)}
              compact
            />
          </Spring>

          <AnimatedText
            enabled={isLoaded}
            restUntilHydrated
            delayIn={delay(500)}
            className="m-0 max-w-[400px] text-center font-mulish text-[15px] leading-[1.4] font-normal text-white/85"
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
