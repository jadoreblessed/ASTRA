import { subscribeToTicker } from "@/lib/animation/ticker";
import Ease, { Lerp, type EasingFn } from "./easing";

/**
 * One-shot interpolation for WebGL scene values, ported from the original
 * helios `animator/tween/tween.ts`.
 *
 * Unchanged from the original except that it runs on the app-wide ticker
 * (`@/lib/animation/ticker`) instead of opening its own `requestAnimationFrame`
 * loop per tween. It animates scene uniforms and object transforms, never DOM —
 * DOM motion is spring-based.
 */

/** A number, or an arbitrarily nested record of numbers. */
export type TweenTarget = number | { [key: string]: TweenTarget };

export interface TweenState {
  /** Progress across delay + duration. Completion is `hole >= 1`. */
  hole: number;
  /** Progress across duration alone, after the delay has elapsed. */
  nothole: number;
}

export interface TweenContext<T extends TweenTarget> {
  value: T;
  state: TweenState;
}

export interface TweenOptions<T extends TweenTarget> {
  duration?: number;
  /** Minimum gap between `onChange` calls, in ms. */
  renderDelay?: number;
  /** Delay before the tween starts, in ms. */
  delay?: number;
  onChange?: (context: TweenContext<T>) => void;
  onComplete?: () => void;
  ease?: EasingFn;
}

const isRecord = (value: TweenTarget): value is { [key: string]: TweenTarget } =>
  typeof value !== "number";

const interpolate = (
  from: TweenTarget,
  to: TweenTarget,
  eased: number,
): TweenTarget => {
  if (typeof from === "number" && typeof to === "number") {
    return Lerp(from, to, eased);
  }
  if (!isRecord(from) || !isRecord(to)) return from;

  const out: { [key: string]: TweenTarget } = {};
  for (const key of Object.keys(from)) {
    out[key] = interpolate(from[key], to[key], eased);
  }
  return out;
};

const Tween = {
  to<T extends TweenTarget>(from: T, to: T, options: TweenOptions<T> = {}) {
    const {
      duration = 1000,
      renderDelay = 0,
      onChange,
      onComplete,
      ease = Ease.In,
    } = options;

    const mainStartTime = performance.now();
    let startTime = mainStartTime;
    let delay = options.delay ?? 0;
    const savedDelay = delay;

    const unsubscribe = subscribeToTicker((time) => {
      const state: TweenState = {
        hole: (time - mainStartTime) / (duration + savedDelay),
        nothole: (time - (mainStartTime + savedDelay)) / duration,
      };
      const complete = state.hole >= 1.0;

      if (time - startTime > renderDelay && time - startTime > delay) {
        delay = 0;
        startTime = performance.now();
        onChange?.({
          value: interpolate(from, to, ease(state.nothole)) as T,
          state,
        });
      }

      if (complete) {
        unsubscribe();
        onComplete?.();
      }
    }, () => 0);

    return unsubscribe;
  },
};

export default Tween;
