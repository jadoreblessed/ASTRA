"use client";

import { Fragment } from "react";
import { animated, useReducedMotion, useSpring } from "@react-spring/web";

import { LogoStack } from "@/components/common/asset-logo";
import { useRobot } from "@/components/common/robot-view";
import { AstraMark } from "@/components/ui/astra-mark";
import type { FlowNode } from "@/data/mocks/home";

/**
 * A timeline step drawn as what it does: stacks of real coins and the `$ASTRA`
 * mark, joined by short rails that a dot keeps running along — email → a
 * Solana wallet, USDC/SOL → the basket's assets, many → one, one → many again.
 * Spring loops (hard rule #1); still under reduced motion and the robot form.
 */

const Rail = ({ size, delay }: { size: number; delay: number }) => {
  const reduced = Boolean(useReducedMotion());
  const robot = useRobot();
  const still = reduced || robot;
  const { p } = useSpring({
    from: { p: 0 },
    to: { p: still ? 0.5 : 1 },
    loop: !still,
    delay,
    config: { duration: 1500 },
  });
  const w = Math.round(size * 1.5);
  return (
    <span aria-hidden="true" className="relative mx-[10px] block h-[2px] shrink-0 rounded-full bg-white/12" style={{ width: w }}>
      <animated.span
        className="absolute top-1/2 block size-[6px] rounded-full bg-accent-200"
        style={{
          left: p.to((v) => `${(v * 100).toFixed(2)}%`),
          opacity: p.to((v) => (still ? 1 : Math.sin(v * Math.PI))),
          transform: "translate(-50%, -50%)",
        }}
      />
      <svg
        viewBox="0 0 8 10"
        className="absolute top-1/2 -right-[3px] size-[9px] -translate-y-1/2 text-white/40"
        fill="none"
      >
        <path d="M1.5 1.5L6 5l-4.5 3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
};

export interface StepFlowProps {
  flow: FlowNode[];
  /** Coin size, px. */
  size: number;
}

export const StepFlow = ({ flow, size }: StepFlowProps) => (
  <div className="flex items-center">
    {flow.map((node, i) => (
      <Fragment key={i}>
        {i > 0 && <Rail size={size} delay={i * 400} />}
        {node === "planet" ? (
          <AstraMark size={Math.round(size * 1.25)} />
        ) : (
          <LogoStack items={node.logos} size={size} max={6} more={node.more} />
        )}
      </Fragment>
    ))}
  </div>
);
