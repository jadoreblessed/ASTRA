"use client";

import { useEffect, useState } from "react";
import { animated } from "@react-spring/web";

import { Spring } from "@/components/common/robot-spring";
import { CountUp } from "@/components/common/count-up";
import { AnimatedHeading } from "@/components/animation/animated-heading";
import { AnimatedText } from "@/components/animation/animated-text";
import { ContactForm } from "@/views/home/sections/contact-form";
import { useSections } from "@/hooks/sections/use-sections";
import { useSceneFade } from "@/hooks/sections/use-scene-fade";
import { useHeroLayout } from "@/hooks/use-hero-scale";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { screens } from "@/lib/scene/screens";
import { easeReveal } from "@/utils/animation/easing";
import type { LogoSceneContent, ProofStat } from "@/data/mocks/home";

/**
 * Logo scene — the fourth slide, where the particle mark assembles.
 *
 * The mark itself lives on the main WebGL scene (`three/objects/logo-mark.ts`,
 * driven by `Controller`), assembling in the centre. This slide frames it with
 * the hero composition (masthead + subtitle + contact form). Desktop lays those
 * on the scaled 1440×800 frame; below `hero-md` it reflows to a vertical stack
 * that pins the heading to the top and the subtitle/form to the foot, leaving the
 * assembling mark clear in the middle.
 *
 * The entrance latches the first time the slide goes active (`revealed`), and
 * `useSceneFade` drifts the whole composition out as it leaves.
 */

const REVEAL = { duration: 1400, easing: easeReveal } as const;

export interface LogoParticlesProps {
  content: LogoSceneContent;
}

interface ProofProps {
  stat: ProofStat;
  align: "left" | "right";
  enabled: boolean;
  delayIn: number;
}

/** A proof readout: bracketed index, a counting mono figure, its line, a rule. */
const Proof = ({ stat, align, enabled, delayIn }: ProofProps) => (
  <Spring
    tag="div"
    enabled={enabled}
    mode="once"
    from={{ opacity: 0, y: 20, filter: "blur(8px)" }}
    to={{ opacity: 1, y: 0, filter: "blur(0px)" }}
    delayIn={delayIn}
    config={REVEAL}
    className={`flex w-[280px] flex-col gap-[12px] ${align === "right" ? "items-end text-right" : "items-start text-left"}`}
  >
    <span className="font-mono text-[11px] leading-none tracking-[0.16em] text-white/40 uppercase">
      [ {stat.index} ]
    </span>
    <span className="font-mono text-[44px] leading-none tracking-[-0.02em] text-white">
      {stat.prefix}
      <CountUp value={stat.value} enabled={enabled} delay={delayIn + 200} />
      {stat.suffix}
    </span>
    <span className="max-w-[240px] font-mulish text-[14px] leading-[1.35] text-white/55">
      {stat.label}
    </span>
    <span
      aria-hidden="true"
      className="mt-[4px] h-px w-full"
      style={{
        backgroundImage: `var(${align === "right" ? "--gradient-service-rule-alt" : "--gradient-service-rule"})`,
      }}
    />
  </Spring>
);

export const LogoParticles = ({ content }: LogoParticlesProps) => {
  const active = useSections((state) => state.active);
  const isLoaded = useSections((state) => state.isLoaded);
  const isMobile = useIsMobile();
  const fade = useSceneFade(screens.IMPACT);
  const { scale } = useHeroLayout();

  /* Latch the entrance the first time the slide goes active; never replays. */
  const [revealed, setRevealed] = useState(false);
  useEffect(() => {
    if (active === screens.IMPACT) setRevealed(true);
  }, [active]);

  return (
    <section
      id="impact"
      aria-label={`${content.titleTop} ${content.titleBottom}`}
      className="relative h-svh w-full"
    >
      {/* Pinned to the viewport: fades in place. Held hidden until the scene has
          loaded so it never bleeds through the preloader. */}
      <animated.div
        style={{
          opacity: isLoaded ? fade.opacity : 0,
          pointerEvents: active === screens.IMPACT ? "auto" : "none",
        }}
        className="fixed inset-0 overflow-hidden"
      >
        {isMobile ? (
          <div className="flex h-full w-full flex-col justify-between px-[20px] pt-[100px] pb-[36px]">
            <div className="flex flex-col gap-[18px]">
              <AnimatedHeading
                tag="h2"
                id="impact-heading"
                enabled={revealed}
                baseDelay={150}
                stagger={34}
                className="m-0 w-full text-center font-mulish text-[clamp(24px,6.4vw,44px)] leading-[1.06] font-light"
                lines={[
                  { text: content.titleTop, opaque: "left" },
                  { text: content.titleBottom, opaque: "right" },
                ]}
              />
              <Spring
                tag="div"
                enabled={revealed}
                from={{ opacity: 0, y: 12 }}
                to={{ opacity: 1, y: 0 }}
                delayIn={420}
                config={REVEAL}
              >
                <dl className="m-0 grid grid-cols-4 gap-[8px] text-center">
                {[...content.left, ...content.right].map((s) => (
                  <div key={s.index} className="flex flex-col-reverse gap-[5px]">
                    <dt className="font-mono text-[8.5px] leading-[1.25] tracking-[0.08em] text-white/45 uppercase">
                      {s.label.split(" — ")[0]}
                    </dt>
                    <dd className="m-0 font-mono text-[17px] leading-none text-white">
                      {s.prefix}
                      <CountUp value={s.value} enabled={revealed} delay={600} />
                      {s.suffix}
                    </dd>
                  </div>
                ))}
                </dl>
              </Spring>
            </div>

            <div className="flex flex-col items-center gap-[18px]">
              <AnimatedText
                enabled={revealed}
                delayIn={520}
                className="m-0 max-w-[400px] font-mulish text-[15px] leading-[1.35] font-normal text-white"
              >
                {content.subtitle}
              </AnimatedText>

              <Spring
                tag="div"
                enabled={revealed}
                from={{ opacity: 0, y: 24, filter: "blur(8px)" }}
                to={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                delayIn={720}
                config={REVEAL}
                className="w-full max-w-[420px]"
              >
                <ContactForm form={content.form} layout="stack" />
              </Spring>
            </div>
          </div>
        ) : (
          <div
            className="absolute top-1/2 left-1/2 h-[800px] w-[1440px]"
            style={{ transform: `translate(-50%, -50%) scale(${scale})` }}
          >
            {/* Masthead — per-letter cascade from the bright ends, as in the hero. */}
            <AnimatedHeading
              tag="h2"
              id="impact-heading"
              enabled={revealed}
              baseDelay={150}
              className="absolute top-[100px] left-[389px] m-0 w-[663px] text-center font-mulish text-[56px] leading-none font-light"
              lines={[
                { text: content.titleTop, opaque: "left" },
                { text: content.titleBottom, opaque: "right" },
              ]}
            />

            {/* Proofs flanking the token as it assembles. */}
            <div className="absolute top-[288px] left-[50px] flex flex-col gap-[40px]">
              {content.left.map((s, i) => (
                <Proof key={s.index} stat={s} align="left" enabled={revealed} delayIn={380 + i * 120} />
              ))}
            </div>
            <div className="absolute top-[288px] right-[50px] flex flex-col gap-[40px]">
              {content.right.map((s, i) => (
                <Proof key={s.index} stat={s} align="right" enabled={revealed} delayIn={440 + i * 120} />
              ))}
            </div>

            {/* Subtitle — word-by-word fly-up, above the form as in the hero. */}
            <AnimatedText
              enabled={revealed}
              delayIn={520}
              className="absolute top-[633px] left-[518px] m-0 w-[405px] font-mulish text-[16px] leading-[1.2] font-normal text-white"
            >
              {content.subtitle}
            </AnimatedText>

            {/* Frosted contact-form pill — the hero's, carried onto the payoff. */}
            <Spring
              tag="div"
              enabled={revealed}
              from={{ opacity: 0, y: 24, filter: "blur(8px)" }}
              to={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              delayIn={720}
              config={REVEAL}
              className="absolute top-[703px] left-[409px] w-[623px]"
            >
              <ContactForm form={content.form} layout="row" />
            </Spring>
          </div>
        )}
      </animated.div>
    </section>
  );
};
