"use client";

import type { ReactNode } from "react";
import { animated, to, useReducedMotion, useSpring } from "@react-spring/web";

import { useRobot } from "@/components/common/robot-view";

/**
 * The small-control motion every clickable thing shares when it isn't a full
 * `FancyButton`: it rises a touch (or grows) on hover and sinks under the press,
 * on a spring (hard rule #1). `nudge` slides it sideways instead — for
 * back-arrows and "next" links. Wrap the control; the control keeps its own
 * semantics.
 */

type Mode = "lift" | "grow" | "nudge-left" | "nudge-right";

const CONFIG = { tension: 420, friction: 22 } as const;

const AT_REST = { x: 0, y: 0, s: 1 };
const HOVER: Record<Mode, { x: number; y: number; s: number }> = {
  lift: { x: 0, y: -2, s: 1 },
  grow: { x: 0, y: 0, s: 1.05 },
  "nudge-left": { x: -4, y: 0, s: 1 },
  "nudge-right": { x: 4, y: 0, s: 1 },
};

export interface PressProps {
  children: ReactNode;
  mode?: Mode;
  className?: string;
  /** Render as a block (full-width controls). */
  block?: boolean;
}

export const Press = ({
  children,
  mode = "lift",
  className = "",
  block = false,
}: PressProps) => {
  const reduced = Boolean(useReducedMotion());
  const robot = useRobot();
  const still = reduced || robot;
  const [st, api] = useSpring(() => ({ ...AT_REST, config: CONFIG }));
  const on = (v: Partial<typeof AT_REST>) => {
    if (!still) api.start(v);
  };
  return (
    <animated.span
      onPointerEnter={(e) => e.pointerType === "mouse" && on(HOVER[mode])}
      onPointerLeave={() => on(AT_REST)}
      onPointerDown={() => on({ s: 0.94 })}
      onPointerUp={() => on({ s: HOVER[mode].s })}
      className={`${block ? "block" : "inline-block"} ${className}`}
      style={{
        transform: to(
          [st.x, st.y, st.s],
          (x: number, y: number, sc: number) =>
            `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px) scale(${sc.toFixed(3)})`,
        ),
      }}
    >
      {children}
    </animated.span>
  );
};
