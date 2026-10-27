"use client";

import { animated, useSpring } from "@react-spring/web";

import { useRobot } from "@/components/common/robot-view";
import { easeOutQuartic } from "@/utils/animation/easing";

/**
 * A number that counts up from zero the first time `enabled` flips true — the
 * live-readout beat on the listings and the proofs. Spring-driven (hard rule
 * #1); the robot form renders the final value outright.
 */
export interface CountUpProps {
  value: number;
  enabled: boolean;
  delay?: number;
  duration?: number;
  className?: string;
}

const format = (v: number) => Math.round(v).toLocaleString("en-US");

export const CountUp = ({
  value,
  enabled,
  delay = 0,
  duration = 1600,
  className,
}: CountUpProps) => {
  const robot = useRobot();
  const { n } = useSpring({
    from: { n: 0 },
    to: { n: enabled ? value : 0 },
    delay,
    config: { duration, easing: easeOutQuartic },
  });

  if (robot) return <span className={className}>{format(value)}</span>;
  return <animated.span className={className}>{n.to(format)}</animated.span>;
};
