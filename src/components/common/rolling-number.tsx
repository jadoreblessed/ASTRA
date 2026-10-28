"use client";

import { useEffect } from "react";
import { animated, useSprings } from "@react-spring/web";

import { useRobot } from "@/components/common/robot-view";
import { easeOutQuartic } from "@/utils/animation/easing";

/**
 * A number on an odometer: each digit is a strip of 0–9 that rolls up to its
 * place the first time `enabled` flips true, the right-hand digits landing last.
 * Bump `spin` to roll it again (hover, a timer). Spring-driven (hard rule #1);
 * the robot form prints the value outright.
 */

/** Three turns of the strip, so a roll can pass a full lap before it lands. */
const STRIP = Array.from({ length: 30 }, (_, i) => i % 10);

const isDigit = (c: string) => c >= "0" && c <= "9";

export interface RollingNumberProps {
  value: number;
  enabled: boolean;
  delay?: number;
  /** Change it to roll the digits again. */
  spin?: number;
  className?: string;
}

export const RollingNumber = ({ value, enabled, delay = 0, spin = 0, className }: RollingNumberProps) => {
  const robot = useRobot();
  const text = value.toLocaleString("en-US");
  const chars = text.split("");
  // Empty deps: the strips are set up once and only ever moved by the roll below.
  const [springs, api] = useSprings(chars.length, () => ({ y: 0 }), []);

  useEffect(() => {
    if (!enabled) return;
    const cs = text.split("");
    api.start((i) => {
      const c = cs[i];
      if (!isDigit(c)) return {};
      const d = Number(c);
      const now = springs[i]?.y.get() ?? 0;
      return {
        from: { y: Math.round(now) % 10 },
        to: { y: 20 + d },
        delay: delay + (cs.length - 1 - i) * 70,
        config: { duration: 1300 + i * 140, easing: easeOutQuartic },
      };
    });
    // `springs` is the stable controller list for `api`; a roll is keyed on these.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, spin, text, delay, api]);

  if (robot) return <span className={className}>{text}</span>;

  return (
    <span className={`inline-flex leading-none ${className ?? ""}`}>
      <span className="sr-only">{text}</span>
      {chars.map((c, i) =>
        isDigit(c) ? (
          <span key={i} aria-hidden="true" className="relative inline-block h-[1em] overflow-hidden">
            <span className="invisible">{c}</span>
            <animated.span
              className="absolute top-0 left-0 flex w-full flex-col items-center"
              style={{ transform: springs[i].y.to((v) => `translateY(${(-v).toFixed(3)}em)`) }}
            >
              {STRIP.map((d, k) => (
                <span key={k} className="block h-[1em] leading-none">
                  {d}
                </span>
              ))}
            </animated.span>
          </span>
        ) : (
          <span key={i} aria-hidden="true">
            {c}
          </span>
        ),
      )}
    </span>
  );
};
