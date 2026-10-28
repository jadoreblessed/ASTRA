"use client";

import { useEffect, useState } from "react";
import { animated, to, useReducedMotion, useSpring, useTransition } from "@react-spring/web";

import { Spring } from "@/components/common/robot-spring";
import { RollingNumber } from "@/components/common/rolling-number";
import { AssetLogo } from "@/components/common/asset-logo";
import { useRobot } from "@/components/common/robot-view";
import { AnimatedHeading } from "@/components/animation/animated-heading";
import { AnimatedText } from "@/components/animation/animated-text";
import { useSections } from "@/hooks/sections/use-sections";
import { useSceneFade } from "@/hooks/sections/use-scene-fade";
import { useHeroLayout } from "@/hooks/use-hero-scale";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { screens } from "@/lib/scene/screens";
import { easeReveal } from "@/utils/animation/easing";
import type { OrbitAsset, ServiceItem, ServicesContent } from "@/data/mocks/home";

/**
 * Services — the getLayers redesign of the second slide (Figma node 668:1825).
 *
 * Same recipe as the hero: a fixed 1440×800 composition rendered at literal
 * design pixels and scaled as one unit by `useHeroLayout`, so the mockup's
 * proportions hold at every viewport. The live scene continues behind it — the
 * particle burst the mockup mocks up as a still.
 *
 * On the frame: the two-line masthead, a four-cell feature grid — two
 * left-aligned cells at the left edge, two right-aligned at the right — each
 * footed by a hairline that draws itself in, and a centred line of copy at the
 * foot. The cells stay alive: the counts roll in on an odometer, the logo rows
 * keep swapping one coin for the next from everything listed, and hovering a
 * cell fans its coins out, rolls its count again and lights its rule. The
 * entrance latches the first time the slide goes active (`mode="once"`) and
 * `useSceneFade` drifts the whole thing out as it leaves.
 *
 * The nav is the shared fixed `HeroNav`; this section deliberately omits its own.
 */

const REVEAL = { duration: 1400, easing: easeReveal } as const;

/** Design-pixel top of each feature row — opened up to carry the logo rows. */
const ROW_TOP = [272, 470] as const;

const LOGO_POP = { tension: 260, friction: 16 } as const;

export interface ServicesProps {
  content: ServicesContent;
}

interface FeatureProps {
  item: ServiceItem;
  top: number;
  align: "left" | "right";
  enabled: boolean;
  delayIn: number;
  /** Offsets this row's swaps from the others', ms. */
  phase: number;
}

const SWAP = { tension: 220, friction: 22 } as const;
const FAN = { tension: 300, friction: 24 } as const;
/** How often a row swaps one coin, ms. */
const SWAP_EVERY = 2300;

/** Motion off: reduced motion or the robot form. */
const useStill = () => {
  const reduced = Boolean(useReducedMotion());
  const robot = useRobot();
  return reduced || robot;
};

/**
 * The row's on-screen coins: the first `show` of `logos`, then every
 * `SWAP_EVERY` one slot trades its coin for the next in the queue — slots taken
 * in a scattered order, so the row never ripples in a predictable line.
 */
const useCycle = (logos: OrbitAsset[], show: number, enabled: boolean, phase: number) => {
  const still = useStill();
  const [state, setState] = useState(() => ({
    cur: logos.slice(0, show),
    queue: logos.slice(show),
    turn: 0,
  }));

  useEffect(() => {
    if (!enabled || still || logos.length <= show) return;
    let id = 0;
    const lead = window.setTimeout(() => {
      id = window.setInterval(() => {
        setState((st) => {
          const slot = (st.turn * 7 + 3) % show;
          const [next, ...rest] = st.queue;
          const cur = st.cur.slice();
          const out = cur[slot];
          cur[slot] = next;
          return { cur, queue: [...rest, out], turn: st.turn + 1 };
        });
      }, SWAP_EVERY);
    }, 2600 + phase);
    return () => {
      window.clearTimeout(lead);
      window.clearInterval(id);
    };
  }, [enabled, still, logos, show, phase]);

  return state.cur;
};

/** One coin slot: a new asset rolls up into it as the old one rolls out the top. */
const Slot = ({ asset, size }: { asset: OrbitAsset; size: number }) => {
  const transitions = useTransition(asset, {
    keys: (a: OrbitAsset) => a.symbol,
    initial: null,
    from: { opacity: 0, y: size * 0.7, s: 0.5 },
    enter: { opacity: 1, y: 0, s: 1 },
    leave: { opacity: 0, y: -size * 0.7, s: 0.5 },
    config: SWAP,
  });
  return (
    <span className="relative block" style={{ width: size, height: size }}>
      {transitions((style, a) => (
        <animated.span
          data-fly-dst={a.symbol}
          className="absolute inset-0"
          style={{
            opacity: style.opacity,
            transform: to([style.y, style.s], (y: number, sc: number) => `translateY(${y.toFixed(2)}px) scale(${sc.toFixed(3)})`),
          }}
        >
          <AssetLogo symbol={a.symbol} logo={a.logo} mark={a.mark} size={size} />
        </animated.span>
      ))}
    </span>
  );
};

/** The feature's holdings as logo coins: they pop in, keep swapping, fan out on hover. */
const LogoRow = ({
  item,
  size,
  enabled,
  delayIn,
  align,
  fanned,
  phase,
}: {
  item: ServiceItem;
  size: number;
  enabled: boolean;
  delayIn: number;
  align: "left" | "right";
  fanned: boolean;
  phase: number;
}) => {
  const cur = useCycle(item.logos, item.show, enabled, phase);
  const { gap } = useSpring({ gap: fanned ? 8 : -Math.round(size * 0.28), config: FAN });
  return (
    <div className={`flex items-center ${align === "right" ? "flex-row-reverse" : ""}`}>
      {cur.map((l, i) => (
        <animated.span
          key={i}
          className="relative"
          style={{
            [align === "right" ? "marginRight" : "marginLeft"]: i === 0 ? 0 : gap,
            zIndex: cur.length - i,
          }}
        >
          <Spring
            tag="span"
            enabled={enabled}
            mode="once"
            from={{ opacity: 0, scale: 0.3, y: 10 }}
            to={{ opacity: 1, scale: 1, y: 0 }}
            delayIn={delayIn + i * 90}
            config={LOGO_POP}
            className="block rounded-full ring-2 ring-background"
          >
            <Slot asset={l} size={size} />
          </Spring>
        </animated.span>
      ))}
    </div>
  );
};

/** The cell's hairline: it draws in from the outer edge, and a lit pass runs over it on hover. */
const Rule = ({ align, enabled, delayIn, lit }: { align: "left" | "right"; enabled: boolean; delayIn: number; lit: boolean }) => {
  const { w } = useSpring({ w: lit ? 1 : 0, config: { tension: 200, friction: 26 } });
  const origin = align === "right" ? "origin-right" : "origin-left";
  return (
    <div aria-hidden="true" className="relative mt-[18px] h-px w-full">
      <Spring
        tag="span"
        enabled={enabled}
        mode="once"
        from={{ scaleX: 0 }}
        to={{ scaleX: 1 }}
        delayIn={delayIn}
        config={REVEAL}
        className={`absolute inset-0 block bg-white/15 ${origin}`}
      />
      <animated.span
        className={`absolute inset-0 block bg-accent-300 ${origin}`}
        style={{ transform: w.to((v) => `scaleX(${v.toFixed(3)})`) }}
      />
    </div>
  );
};

const Feature = ({ item, top, align, enabled, delayIn, phase }: FeatureProps) => {
  const [hover, setHover] = useState(false);
  const [spin, setSpin] = useState(0);
  const toward = align === "left" ? 1 : -1;
  const { x } = useSpring({ x: hover ? 8 * toward : 0, config: FAN });

  return (
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
        onPointerEnter={() => {
          setHover(true);
          setSpin((n) => n + 1);
        }}
        onPointerLeave={() => setHover(false)}
      >
        <animated.div
          className={`flex flex-col gap-[14px] ${align === "right" ? "items-end text-right" : "items-start text-left"}`}
          style={{ transform: x.to((v) => `translateX(${v.toFixed(2)}px)`) }}
        >
          <p className="m-0 flex items-baseline font-mulish text-[15px] leading-none text-accent-300">
            <RollingNumber value={item.stat.value} enabled={enabled} delay={delayIn + 250} spin={spin} />
            <span>
              {item.stat.suffix}&nbsp;{item.stat.unit}
            </span>
          </p>
          <p className="m-0 font-mulish text-[34px] leading-none font-light text-white">
            {item.title}
          </p>
          <p className="m-0 font-mulish text-[16px] leading-[1.2] font-normal text-white/75">
            {item.caption}
          </p>
          <LogoRow
            item={item}
            size={34}
            enabled={enabled}
            delayIn={delayIn + 350}
            align={align}
            fanned={hover}
            phase={phase}
          />
        </animated.div>
        <Rule align={align} enabled={enabled} delayIn={delayIn + 200} lit={hover} />
      </div>
    </Spring>
  );
};

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
                  <div className="flex items-end justify-between gap-[12px]">
                    <div className="flex flex-col gap-[6px]">
                      <p className="m-0 flex items-baseline font-mulish text-[13px] leading-none text-accent-300">
                        <RollingNumber value={item.stat.value} enabled={revealed} delay={420 + i * 80} />
                        <span>
                          {item.stat.suffix}&nbsp;{item.stat.unit}
                        </span>
                      </p>
                      <p className="m-0 font-mulish text-[22px] leading-none font-light text-white">
                        {item.title}
                      </p>
                      <p className="m-0 font-mulish text-[15px] leading-[1.3] font-normal text-white/75">
                        {item.caption}
                      </p>
                    </div>
                    <LogoRow
                      item={item}
                      size={26}
                      enabled={revealed}
                      delayIn={460 + i * 80}
                      align="right"
                      fanned={false}
                      phase={i * 700}
                    />
                  </div>
                  <Rule align="left" enabled={revealed} delayIn={420 + i * 80} lit={false} />
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
                enabled={revealed}
                delayIn={260 + i * 90}
                phase={i * 1100}
              />
            ))}
            {content.right.map((item, i) => (
              <Feature
                key={item.title}
                item={item}
                top={ROW_TOP[i]}
                align="right"
                enabled={revealed}
                delayIn={300 + i * 90}
                phase={550 + i * 1100}
              />
            ))}

            {/* Footnote — word-by-word fly-up. */}
            <AnimatedText
              enabled={revealed}
              delayIn={520}
              className="absolute top-[700px] left-[480px] m-0 w-[480px] text-center font-mulish text-[17px] leading-[1.35] font-normal text-white/85"
            >
              {content.footnote}
            </AnimatedText>
          </div>
        )}
      </animated.div>
    </section>
  );
};
