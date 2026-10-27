"use client";

import { useEffect, useState } from "react";
import { animated } from "@react-spring/web";

import { Spring } from "@/components/common/robot-spring";
import { CountUp } from "@/components/common/count-up";
import { AnimatedHeading } from "@/components/animation/animated-heading";
import { AnimatedText } from "@/components/animation/animated-text";
import { useSections } from "@/hooks/sections/use-sections";
import { useSceneFade } from "@/hooks/sections/use-scene-fade";
import { useHeroLayout } from "@/hooks/use-hero-scale";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { screens } from "@/lib/scene/screens";
import { easeReveal } from "@/utils/animation/easing";
import type { ServiceItem, ServicesContent } from "@/data/mocks/home";

/**
 * Services — the getLayers redesign of the second slide (Figma node 668:1825).
 *
 * Same recipe as the hero: a fixed 1440×800 composition rendered at literal
 * design pixels and scaled as one unit by `useHeroLayout`, so the mockup's
 * proportions hold at every viewport. The live scene continues behind it — the
 * particle burst the mockup mocks up as a still.
 *
 * On the frame: the two-line masthead (mirror-image gradients, reusing the hero
 * tokens), a four-cell feature grid — two left-aligned cells at the left edge,
 * two right-aligned at the right — each footed by a hairline that fades toward
 * the centre, and a centred line of copy at the foot. The entrance latches the
 * first time the slide goes active (`mode="once"`) and `useSceneFade` drifts the
 * whole thing out as it leaves, matching every other section.
 *
 * The nav is the shared fixed `HeroNav`; this section deliberately omits its own.
 */

const REVEAL = { duration: 1400, easing: easeReveal } as const;

/** Design-pixel top of each feature row — opened up to carry the readouts. */
const ROW_TOP = [286, 468] as const;

export interface ServicesProps {
  content: ServicesContent;
}

interface FeatureProps {
  item: ServiceItem;
  top: number;
  align: "left" | "right";
  rule: string;
  enabled: boolean;
  delayIn: number;
}

const Feature = ({ item, top, align, rule, enabled, delayIn }: FeatureProps) => (
  <Spring
    tag="div"
    enabled={enabled}
    mode="once"
    from={{ opacity: 0, y: 24, filter: "blur(8px)" }}
    to={{ opacity: 1, y: 0, filter: "blur(0px)" }}
    delayIn={delayIn}
    config={REVEAL}
    style={{ top }}
    className={
      align === "left"
        ? "absolute left-[50px] w-[400px]"
        : "absolute left-[990px] w-[400px]"
    }
  >
    <div
      className={`flex flex-col gap-[13px] ${align === "right" ? "items-end text-right" : "items-start text-left"}`}
    >
      {/* Index + count-up listing. */}
      <div
        className={`flex items-center gap-[12px] font-mono text-[11px] leading-none tracking-[0.16em] uppercase ${align === "right" ? "flex-row-reverse" : ""}`}
      >
        <span className="text-white/40">[ {item.index} ]</span>
        <span className="text-accent-300">
          <CountUp value={item.stat.value} enabled={enabled} delay={delayIn + 250} />
          {item.stat.suffix} {item.stat.unit}
        </span>
      </div>
      <p className="font-mulish text-[32px] leading-none font-light text-white">
        {item.title}
      </p>
      <p className="font-mulish text-[16px] leading-[1.2] font-normal text-white/85">
        {item.caption}
      </p>
      <p className="font-mono text-[12px] leading-none tracking-[0.04em] text-white/45">
        {item.tickers}
      </p>
    </div>
    <div
      aria-hidden="true"
      className="mt-[16px] h-px w-full"
      style={{ backgroundImage: `var(${rule})` }}
    />
  </Spring>
);

/** Mobile order interleaves the two columns so the visual rows are preserved. */
const mobileFeatures = (content: ServicesContent): ServiceItem[] =>
  [content.left[0], content.right[0], content.left[1], content.right[1]].filter(
    (item): item is ServiceItem => Boolean(item),
  );

export const Services = ({ content }: ServicesProps) => {
  const active = useSections((state) => state.active);
  const isMobile = useIsMobile();
  const fade = useSceneFade(screens.SITEMAP);
  /* `width` fit: the frame spans the full viewport width, so the grid's 50px
     side inset stays proportional to the mockup on every screen. */
  const { scale } = useHeroLayout("width");

  /* Latch the entrance the first time the slide goes active; never replays. */
  const [revealed, setRevealed] = useState(false);
  useEffect(() => {
    if (active === screens.SITEMAP) setRevealed(true);
  }, [active]);

  return (
    <section
      id="sitemap"
      aria-labelledby="services-heading"
      className="relative h-svh w-full"
    >
      {/* Pinned to the viewport: the composition fades in place rather than
          scrolling away. `pointer-events` follow the active slide. */}
      <animated.div
        style={{
          opacity: fade.opacity,
          pointerEvents: active === screens.SITEMAP ? "auto" : "none",
        }}
        className="fixed inset-0 overflow-hidden"
      >
        {isMobile ? (
          <div className="flex h-full w-full flex-col items-center justify-center gap-[24px] px-[24px] pt-[96px] pb-[32px]">
            <AnimatedHeading
              tag="h2"
              id="services-heading"
              enabled={revealed}
              baseDelay={120}
              stagger={34}
              className="m-0 w-full text-center font-mulish text-[clamp(24px,6.4vw,44px)] leading-[1.06] font-light"
              lines={[
                { text: content.titleTop, opaque: "left" },
                { text: content.titleBottom, opaque: "right" },
              ]}
            />

            <div className="flex w-full max-w-[420px] flex-col gap-[18px]">
              {mobileFeatures(content).map((item, i) => (
                <Spring
                  key={item.title}
                  tag="div"
                  enabled={revealed}
                  mode="once"
                  from={{ opacity: 0, y: 20, filter: "blur(8px)" }}
                  to={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                  delayIn={220 + i * 80}
                  config={REVEAL}
                  className="flex flex-col gap-[6px]"
                >
                  <div className="flex items-center gap-[10px] font-mono text-[10px] leading-none tracking-[0.16em] uppercase">
                    <span className="text-white/40">[ {item.index} ]</span>
                    <span className="text-accent-300">
                      <CountUp value={item.stat.value} enabled={revealed} delay={420 + i * 80} />
                      {item.stat.suffix} {item.stat.unit}
                    </span>
                  </div>
                  <p className="font-mulish text-[22px] leading-none font-light text-white">
                    {item.title}
                  </p>
                  <p className="font-mulish text-[15px] leading-[1.3] font-normal text-white/80">
                    {item.caption}
                  </p>
                  <p className="font-mono text-[11px] leading-[1.3] tracking-[0.03em] text-white/45">
                    {item.tickers}
                  </p>
                  <div
                    aria-hidden="true"
                    className="mt-[10px] h-px w-full"
                    style={{ backgroundImage: "var(--gradient-service-rule)" }}
                  />
                </Spring>
              ))}
            </div>

            <AnimatedText
              enabled={revealed}
              delayIn={620}
              className="m-0 max-w-[420px] font-mulish text-[14px] leading-[1.4] font-normal text-white/85"
            >
              {content.footnote}
            </AnimatedText>
          </div>
        ) : (
          <div
            className="absolute top-1/2 left-1/2 h-[800px] w-[1440px]"
            style={{ transform: `translate(-50%, -50%) scale(${scale})` }}
          >
            {/* Masthead — per-letter cascade from the bright ends. */}
            <AnimatedHeading
              tag="h2"
              id="services-heading"
              enabled={revealed}
              baseDelay={120}
              className="absolute top-[100px] left-[389px] m-0 w-[663px] text-center font-mulish text-[56px] leading-none font-light"
              lines={[
                { text: content.titleTop, opaque: "left" },
                { text: content.titleBottom, opaque: "right" },
              ]}
            />

            {/* Feature grid — two left cells, two right cells. */}
            {content.left.map((item, i) => (
              <Feature
                key={item.title}
                item={item}
                top={ROW_TOP[i]}
                align="left"
                rule="--gradient-service-rule"
                enabled={revealed}
                delayIn={260 + i * 90}
              />
            ))}
            {content.right.map((item, i) => (
              <Feature
                key={item.title}
                item={item}
                top={ROW_TOP[i]}
                align="right"
                rule="--gradient-service-rule-alt"
                enabled={revealed}
                delayIn={300 + i * 90}
              />
            ))}

            {/* Readout under the burst — the whole slide in one line. */}
            <Spring
              tag="p"
              enabled={revealed}
              mode="once"
              from={{ opacity: 0, y: 12 }}
              to={{ opacity: 1, y: 0 }}
              delayIn={480}
              config={REVEAL}
              className="absolute top-[656px] left-0 m-0 w-[1440px] text-center font-mono text-[11px] leading-none tracking-[0.24em] text-white/55 uppercase"
            >
              [ {content.center} ]
            </Spring>

            {/* Footnote — word-by-word fly-up. */}
            <AnimatedText
              enabled={revealed}
              delayIn={520}
              className="absolute top-[712px] left-[509px] m-0 w-[423px] text-center font-mulish text-[16px] leading-[1.2] font-normal text-white"
            >
              {content.footnote}
            </AnimatedText>
          </div>
        )}
      </animated.div>
    </section>
  );
};
