"use client";

import { animated, useSpring, type SpringValue } from "@react-spring/web";
import { useEffect, useState } from "react";

import { useRobot } from "@/components/common/robot-view";
import { useHydrated } from "@/hooks/use-hydrated";
import { easeReveal } from "@/utils/animation/easing";

/**
 * Per-letter reveal for the masthead lines: each letter flies up from below with
 * a blur and opacity ramp. Because the line's gradient (`background-clip: text`)
 * cannot survive splitting into per-letter spans, each letter instead takes a
 * SOLID colour sampled from that gradient — white at the opaque end, the pale haze
 * at the transparent end — which reads as the same ramp. The cascade starts at the
 * OPAQUE end of each line and travels toward the transparent one, so the two
 * mirrored lines animate inward from their two bright corners.
 *
 * react-spring drives every letter (hard rule #1 — spring motion). `spring-text-
 * engine` is used for plain-colour copy (`AnimatedText`); it is skipped here only
 * because of the gradient + directional-cascade requirement.
 */

const START = { opacity: 0, y: 34 } as const;
const END = { opacity: 1, y: 0 } as const;
/** The cascade's starting blur — applied per line, see `lineBlur`. */
const BLUR_PX = 12;
const CONFIG = { duration: 1100, easing: easeReveal } as const;

/** Gradient endpoints: opaque white → the haze (`#c8d6ff` at 0.2), as in the CSS. */
const OPAQUE = [255, 255, 255, 1] as const;
const HAZE = [200, 214, 255, 0.2] as const;

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

const sampleColor = (t: number): string =>
  `rgba(${Math.round(lerp(OPAQUE[0], HAZE[0], t))}, ${Math.round(
    lerp(OPAQUE[1], HAZE[1], t),
  )}, ${Math.round(lerp(OPAQUE[2], HAZE[2], t))}, ${lerp(
    OPAQUE[3],
    HAZE[3],
    t,
  ).toFixed(3)})`;

export interface HeadingLine {
  text: string;
  /** The opaque (bright) end of this line's gradient — the cascade starts here. */
  opaque: "left" | "right";
}

/**
 * A playing letter: its pose is read off the heading's one clock (`clock`, ms
 * since the heading was enabled) — the same tween its own spring used to run:
 * held at `START` for `delay`, then `CONFIG.duration` ms of `CONFIG.easing` to
 * `END`. One spring per heading instead of one per letter: a heading is dozens
 * of letters, and creating and starting a controller for each, all in the frame
 * the heading is enabled, was the hero entrance's long task on a phone.
 *
 * Opacity and lift only — the blur is the line's (`lineBlur`). A `filter` per
 * letter made every letter a filtered layer of its own, re-rasterised each frame
 * of the cascade over the full-screen canvas, and a lower slide's heading plays
 * mid-scroll: the phone scroll test's 115–233 ms render frames. A settled letter
 * drops its `will-change` and transform, so a revealed heading is not dozens of
 * layers for the rest of the scroll.
 */
const Letter = ({
  char,
  color,
  delay,
  clock,
}: {
  char: string;
  color: string;
  delay: number;
  clock: SpringValue<number>;
}) => {
  const k = (ms: number) =>
    CONFIG.easing(Math.min(1, Math.max(0, (ms - delay) / CONFIG.duration)));
  return (
    <animated.span
      style={{
        opacity: clock.to(
          (ms) => START.opacity + (END.opacity - START.opacity) * k(ms),
        ),
        transform: clock.to((ms) =>
          k(ms) >= 1
            ? "none"
            : `translate3d(0px,${START.y + (END.y - START.y) * k(ms)}px,0px)`,
        ),
        willChange: clock.to((ms) =>
          k(ms) >= 1 ? "auto" : "transform, opacity",
        ),
        display: "inline-block",
        whiteSpace: "pre",
        color,
      }}
    >
      {char}
    </animated.span>
  );
};

/**
 * The cascade's blur, once per line instead of once per letter (pipeline Fix
 * Catalog: "Blur a heading once per line"). The line takes the blur of the
 * letter a third of the way along the wave: the letters already in read as
 * sharp as they did on their own (a line paced by the whole wave left them
 * soft mid-cascade), and the ones still arriving are faint enough that their
 * own softness was never the read. Removed at rest, so a settled line is not a
 * filter layer.
 */
const lineBlur = (first: number, last: number) => {
  const lead = first + (last - first) / 3;
  return (ms: number) => {
    const k = CONFIG.easing(
      Math.min(1, Math.max(0, (ms - lead) / CONFIG.duration)),
    );
    const px = BLUR_PX * (1 - k);
    return px < 0.05 ? "none" : `blur(${px.toFixed(2)}px)`;
  };
};

/**
 * A letter with no spring behind it, in one of two poses:
 *
 * - **at rest** — the robot form (D-016), and a first-screen heading in the served HTML under the
 *   loader's curtain (`restUntilHydrated`). A heading is dozens of letters, each its own spring to
 *   create and hydrate.
 * - **waiting** — before its heading has ever been enabled: held at the spring's start pose
 *   (`START` — transparent, 34 px down; no layer hints, nothing shows). Every heading below the hero is mounted at load
 *   inside a hidden slide, and a spring per letter — eight headings, hundreds of letters — was
 *   created and started in one layout-effect flush during hydration: on a throttled phone the
 *   load's longest task (~0.6 s of Lighthouse's ~0.64 s hydration task was react-spring starting
 *   them). The letter becomes a `Letter` the first time its heading is enabled, which mounts its
 *   spring from `START` — the same move it always made.
 *
 * One component for both, so the hand-over from at rest to waiting at hydration restyles the same
 * span instead of replacing it.
 */
const StillLetter = ({
  char,
  color,
  rest,
}: {
  char: string;
  color: string;
  rest: boolean;
}) => (
  <span
    style={
      rest
        ? { display: "inline-block", whiteSpace: "pre", color }
        : {
            display: "inline-block",
            whiteSpace: "pre",
            color,
            opacity: START.opacity,
            transform: `translate3d(0px,${START.y}px,0px)`,
          }
    }
  >
    {char}
  </span>
);

export interface AnimatedHeadingProps {
  lines: HeadingLine[];
  enabled: boolean;
  className?: string;
  id?: string;
  tag?: "h1" | "h2";
  baseDelay?: number;
  stagger?: number;
  /** Serve the letters at rest until hydration ends (the hero, under the curtain). */
  restUntilHydrated?: boolean;
}

export const AnimatedHeading = ({
  lines,
  enabled,
  className,
  id,
  tag = "h2",
  baseDelay = 150,
  stagger = 42,
  restUntilHydrated = false,
}: AnimatedHeadingProps) => {
  const Tag = tag;
  const robot = useRobot();
  const hydrated = useHydrated();
  const atRest = robot || (restUntilHydrated && !hydrated);
  // Latched: once a heading has played in, its letters stay on the clock.
  const [armedOnce, setArmedOnce] = useState(false);
  useEffect(() => {
    if (enabled) setArmedOnce(true);
  }, [enabled]);
  const armed = armedOnce || enabled;
  // The heading's clock: ms since it was enabled, run linearly to the end of
  // its last letter (every heading here is latched — enabled once, for good).
  const lastOrder = Math.max(...lines.map((l) => [...l.text].length - 1), 0);
  const total = baseDelay + lastOrder * stagger + CONFIG.duration;
  const { clock } = useSpring({
    from: { clock: 0 },
    to: { clock: enabled ? total : 0 },
    config: { duration: total },
  });
  return (
    <Tag
      id={id}
      className={className}
      aria-label={lines.map((l) => l.text).join(" ")}
    >
      {lines.map((line, li) => {
        const chars = [...line.text];
        const n = Math.max(1, chars.length - 1);
        return (
          <animated.span
            key={li}
            aria-hidden="true"
            style={{
              display: "block",
              whiteSpace: "nowrap",
              filter:
                atRest || !armed
                  ? "none"
                  : clock.to(
                      lineBlur(
                        baseDelay,
                        baseDelay + (chars.length - 1) * stagger,
                      ),
                    ),
            }}
          >
            {chars.map((ch, i) => {
              const along = i / n;
              const t = line.opaque === "left" ? along : 1 - along;
              const order = line.opaque === "left" ? i : chars.length - 1 - i;
              const char = ch === " " ? " " : ch;
              if (atRest || !armed)
                return (
                  <StillLetter
                    key={i}
                    char={char}
                    color={sampleColor(t)}
                    rest={atRest}
                  />
                );
              return (
                <Letter
                  key={i}
                  char={char}
                  color={sampleColor(t)}
                  delay={baseDelay + order * stagger}
                  clock={clock}
                />
              );
            })}
          </animated.span>
        );
      })}
    </Tag>
  );
};
