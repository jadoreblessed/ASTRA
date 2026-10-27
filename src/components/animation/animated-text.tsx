"use client";

import type { ReactNode } from "react";
import { RobotText as TextEngine } from "@/components/common/robot-text";

import { easeReveal } from "@/utils/animation/easing";
import type { Tags } from "@/types/springs";

/**
 * Word-by-word reveal for body copy: each word flies up from below with a blur
 * and opacity ramp, staggered left-to-right. Built on `spring-text-engine` (hard
 * rule #1). Gated by `enabled` so it holds hidden until its section is revealed,
 * then plays once.
 *
 * TextEngine lays each line out as a `display: flex; flex-wrap: wrap` row of
 * inline-block words, so `text-align` on the tag does nothing — the words align
 * to the flex main axis. `align` maps to `justify-content` on that row instead;
 * these descriptions are centred, so it defaults to `"center"`.
 */

const CONFIG = { duration: 900, easing: easeReveal } as const;

const JUSTIFY = {
  left: "justify-start",
  center: "justify-center",
  right: "justify-end",
} as const;

export interface AnimatedTextProps {
  children: ReactNode;
  enabled: boolean;
  className?: string;
  tag?: Tags;
  delayIn?: number;
  stagger?: number;
  /** Row alignment (maps to flex `justify-content`). Defaults to centre. */
  align?: keyof typeof JUSTIFY;
  /** Plain text until hydration ends (the hero's copy, under the curtain). */
  restUntilHydrated?: boolean;
}

export const AnimatedText = ({
  children,
  enabled,
  className,
  tag = "p",
  delayIn = 0,
  stagger = 45,
  align = "center",
  restUntilHydrated = false,
}: AnimatedTextProps) => (
  <TextEngine
    restUntilHydrated={restUntilHydrated}
    tag={tag}
    enabled={enabled}
    mode="once"
    className={[JUSTIFY[align], className].filter(Boolean).join(" ")}
    delayIn={delayIn}
    wordIn={{ opacity: 1, y: "0%", filter: "blur(0px)" }}
    wordOut={{ opacity: 0, y: "110%", filter: "blur(8px)" }}
    wordStagger={stagger}
    wordConfig={CONFIG}
  >
    {children}
  </TextEngine>
);
