"use client";

import {
  forwardRef,
  useEffect,
  useState,
  type ComponentProps,
  type ComponentType,
  type CSSProperties,
} from "react";

import { Spring as MotionSpring } from "@/components/animation/springs/spring";

import { useHydrated } from "@/hooks/use-hydrated";

import { useRobot } from "./robot-view";

type SpringProps = ComponentProps<typeof MotionSpring> & {
  /**
   * Serve the element at `to` until hydration ends (a first-screen reveal under the loader's opaque
   * curtain — `loader-curtain.tsx`), then behave as usual: the start pose, the entrance once enabled.
   */
  restUntilHydrated?: boolean;
};

/** react-spring's transform shorthands, folded into one CSS `transform`. */
const TRANSFORM = new Set(["x", "y", "z", "scale", "scaleX", "scaleY", "rotate", "rotateX", "rotateY", "rotateZ"]);
const px = (v: unknown) => (typeof v === "number" ? `${v}px` : String(v));
const deg = (v: unknown) => (typeof v === "number" ? `${v}deg` : String(v));

/** The spring's resting values as static CSS — the element exactly at `to`. */
export const restStyle = (to: Record<string, unknown> = {}, style?: CSSProperties): CSSProperties => {
  const out: Record<string, unknown> = { ...style };
  const parts: string[] = [];
  for (const [key, value] of Object.entries(to)) {
    if (!TRANSFORM.has(key)) {
      out[key] = value;
      continue;
    }
    if (key === "x") parts.push(`translateX(${px(value)})`);
    else if (key === "y") parts.push(`translateY(${px(value)})`);
    else if (key === "z") parts.push(`translateZ(${px(value)})`);
    else if (key.startsWith("scale")) parts.push(`${key}(${String(value)})`);
    else parts.push(`${key}(${deg(value)})`);
  }
  if (parts.length) out.transform = parts.join(" ");
  return out as CSSProperties;
};

/** A `from` state nobody can see — the element is fully transparent there. */
const isHiddenFrom = (from: unknown): boolean =>
  typeof from === "object" && from !== null && (from as Record<string, unknown>).opacity === 0;

/**
 * True while a hidden entrance reveal is still **waiting for its first enable**: `enabled` is
 * explicitly `false`, its `from` is transparent, and it has never been enabled. Such an element
 * can be rendered as plain markup at `from` — what the spring would draw, and invisible anyway —
 * instead of creating and starting a spring for it. A page of slides mounts dozens of these at
 * hydration, each started in the same layout-effect flush; they now get their spring the first
 * time they are enabled, which plays from `from` exactly as it always did. Latched: once enabled,
 * the spring stays.
 */
export const useWaitingReveal = (enabled: boolean | undefined, from: unknown): boolean => {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (enabled !== false) setArmed(true);
  }, [enabled]);
  return !armed && enabled === false && isHiddenFrom(from);
};

/**
 * The engine's `<Spring>`, except on the robot form (D-016): there it renders
 * the plain element at its `to` state — no spring, no controller, nothing to
 * hydrate but the element. People get the engine's `<Spring>` unchanged.
 * Swap an import to this file; the vendored engine is untouched.
 */
export const Spring = forwardRef<HTMLElement, SpringProps>(function RobotAwareSpring(
  { restUntilHydrated = false, ...props },
  ref,
) {
  const robot = useRobot();
  const hydrated = useHydrated();
  // Served at rest under the curtain — the same plain element as `waiting` below, so the switch to
  // the start pose at hydration restyles the node instead of replacing it.
  const servedAtRest = restUntilHydrated && !hydrated && !robot;
  // People: a hidden reveal that has never been enabled is plain markup at `from` until its first
  // enable (`useWaitingReveal`); the robot form rests as below.
  const waiting = useWaitingReveal(props.enabled, props.from) && !robot;
  if (!robot && !waiting && !servedAtRest) return <MotionSpring ref={ref} {...props} />;
  const {
    tag = "div",
    children,
    from,
    to,
    mode,
    config: _config,
    delayIn: _delayIn,
    delayOut: _delayOut,
    enabled,
    disableOnMobile: _disableOnMobile,
    immediateOut: _immediateOut,
    style,
    ...rest
  } = props;
  // An entrance reveal rests at `to`. A UI toggle (`mode="always"`, driven by
  // `enabled` — a menu, an accordion) rests where its state says: closed menus
  // stay closed (fromzero's phone menu rendered open on the robot form).
  const resting =
    !servedAtRest && (waiting || (mode === "always" && enabled === false)) ? from : to;
  // JSX through `ComponentType`, as `robot-text` does (a dynamic intrinsic tag types its children as
  // `never` under @react-three/fiber's JSX augmentation).
  const Tag = tag as unknown as ComponentType<Record<string, unknown>>;
  return (
    <Tag {...rest} ref={ref} style={restStyle(resting, style)}>
      {children}
    </Tag>
  );
});
