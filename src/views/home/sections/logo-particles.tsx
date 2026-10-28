"use client";

import { useEffect, useState } from "react";
import { animated, to, useReducedMotion, useSpring, useTrail } from "@react-spring/web";

import { Spring } from "@/components/common/robot-spring";
import { AssetLogo } from "@/components/common/asset-logo";
import { useRobot } from "@/components/common/robot-view";
import { AnimatedHeading } from "@/components/animation/animated-heading";
import { useSections } from "@/hooks/sections/use-sections";
import { useSceneFade } from "@/hooks/sections/use-scene-fade";
import { useHeroLayout } from "@/hooks/use-hero-scale";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { screens } from "@/lib/scene/screens";
import { easeReveal } from "@/utils/animation/easing";
import type { LogoSceneContent, OrbitAsset } from "@/data/mocks/home";

/**
 * Logo scene — the closing slide, where the ringed particle planet assembles.
 *
 * A quiet ending, built like a magazine cover: one line of masthead, "ONE
 * TOKEN" set enormous and faint across the frame in outline only — the planet
 * stands in front of it — and along the foot every listed coin drifting past
 * in an endless ticker. Nothing else: the planet is the subject. The letters
 * rise in one after another and the word leans a little toward the pointer.
 *
 * The entrance latches the first time the slide goes active; `useSceneFade`
 * drifts it all out as it leaves.
 */

const REVEAL = { duration: 1400, easing: easeReveal } as const;
/** Faint on purpose: the word is the backdrop, the planet is the subject. */
const OUTLINE = "1.5px rgb(210 189 255 / 0.16)";

export interface LogoParticlesProps {
  content: LogoSceneContent;
}

/** Motion off: reduced motion or the robot form. */
const useStill = () => {
  const reduced = Boolean(useReducedMotion());
  const robot = useRobot();
  return reduced || robot;
};

/**
 * The giant outlined word. Letters rise in on a trail; the whole word leans
 * a few pixels toward the pointer. `lines` splits it (phones stack it).
 */
const GiantWord = ({ word, enabled, lines, className }: { word: string; enabled: boolean; lines: string[]; className: string }) => {
  const still = useStill();
  const letters = lines.join("").replace(/ /g, "").length;
  const trail = useTrail(letters, {
    from: { o: 0, y: 70 },
    to: { o: enabled ? 1 : 0, y: enabled ? 0 : 70 },
    delay: 200,
    config: { tension: 180, friction: 24 },
  });
  const [lean, api] = useSpring(() => ({ x: 0, y: 0, config: { tension: 60, friction: 20 } }));
  useEffect(() => {
    if (still || !window.matchMedia("(hover: hover)").matches) return;
    const onMove = (e: PointerEvent) =>
      api.start({ x: (e.clientX / window.innerWidth - 0.5) * -28, y: (e.clientY / window.innerHeight - 0.5) * -12 });
    window.addEventListener("pointermove", onMove);
    return () => window.removeEventListener("pointermove", onMove);
  }, [still, api]);

  let k = 0;
  return (
    <animated.div
      aria-hidden="true"
      className={className}
      style={{ transform: to([lean.x, lean.y], (x: number, y: number) => `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px)`) }}
    >
      {lines.map((line, li) => (
        <span key={li} className="block whitespace-nowrap">
          {line.split("").map((ch, ci) => {
            if (ch === " ") return <span key={ci} className="inline-block w-[0.32em]" />;
            const t = trail[k++];
            return (
              <animated.span
                key={ci}
                className="inline-block"
                style={{
                  opacity: t?.o,
                  transform: t?.y.to((v) => `translateY(${v.toFixed(1)}px)`),
                  color: "transparent",
                  WebkitTextStroke: OUTLINE,
                }}
              >
                {ch}
              </animated.span>
            );
          })}
        </span>
      ))}
      <span className="sr-only">{word}</span>
    </animated.div>
  );
};

/** Every listed coin drifting past, end to end, forever. */
const Ticker = ({ coins, size }: { coins: OrbitAsset[]; size: number }) => {
  const still = useStill();
  const { x } = useSpring({
    from: { x: 0 },
    to: { x: still ? 0 : -50 },
    loop: !still,
    config: { duration: coins.length * 2_600, easing: (t: number) => t },
  });
  return (
    <div aria-hidden="true" className="w-full overflow-hidden">
      <animated.div className="flex w-max" style={{ transform: x.to((v) => `translateX(${v.toFixed(3)}%)`) }}>
        {[...coins, ...coins].map((c, i) => (
          <span key={i} className="flex items-center gap-[10px] pr-[38px]">
            <AssetLogo symbol={c.symbol} logo={c.logo} mark={c.mark} size={size} />
            <span className="font-mulish text-[15px] leading-none text-white/60">{c.symbol}</span>
          </span>
        ))}
      </animated.div>
    </div>
  );
};

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
      aria-labelledby="impact-heading"
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
          <div className="relative flex h-full w-full flex-col items-center justify-between pt-[96px] pb-[28px]">
            <div className="flex flex-col items-center gap-[12px] px-[20px]">
              <AnimatedHeading
                tag="h2"
                id="impact-heading"
                enabled={revealed}
                baseDelay={150}
                stagger={34}
                className="m-0 w-full text-center font-mulish text-[clamp(26px,7vw,44px)] leading-[1.06] font-light"
                lines={[{ text: content.titleTop, opaque: "left" }]}
              />
            </div>

            <GiantWord
              word={content.word}
              enabled={revealed}
              lines={content.word.split(" ")}
              className="pointer-events-none absolute top-1/2 left-0 w-full -translate-y-1/2 text-center font-mulish text-[24vw] leading-[0.95] font-light tracking-[-0.03em]"
            />

            <div className="flex w-full flex-col items-center gap-[22px]">
              <Ticker coins={content.ticker} size={26} />
            </div>
          </div>
        ) : (
          <div
            className="absolute top-1/2 left-1/2 h-[800px] w-[1440px]"
            style={{ transform: `translate(-50%, -50%) scale(${scale})` }}
          >
            {/* One line of masthead. */}
            <AnimatedHeading
              tag="h2"
              id="impact-heading"
              enabled={revealed}
              baseDelay={150}
              className="absolute top-[78px] left-[320px] m-0 w-[800px] text-center font-mulish text-[48px] leading-none font-light"
              lines={[{ text: content.titleTop, opaque: "left" }]}
            />

            {/* The word, enormous, in outline — the planet shows through it. */}
            <GiantWord
              word={content.word}
              enabled={revealed}
              lines={[content.word]}
              className="pointer-events-none absolute top-[262px] left-0 w-[1440px] text-center font-mulish text-[246px] leading-none font-light tracking-[-0.04em]"
            />


            {/* Everything a basket can hold, drifting past. */}
            <Spring
              tag="div"
              enabled={revealed}
              from={{ opacity: 0 }}
              to={{ opacity: 1 }}
              delayIn={900}
              config={REVEAL}
              className="absolute top-[680px] left-0 w-[1440px]"
            >
              <Ticker coins={content.ticker} size={34} />
            </Spring>
          </div>
        )}
      </animated.div>
    </section>
  );
};
