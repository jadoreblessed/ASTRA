/**
 * Easing curves for the WebGL scene, ported from the original helios
 * `animator/tween/easing.ts`.
 *
 * These drive shader uniforms and object transforms inside the canvas — not DOM
 * motion. DOM motion is spring-based (see obsidian/frontend/animation-system.md);
 * a GPU render loop has no spring equivalent, so the original curves are kept
 * so the scene reads identically.
 */

const pow = (t: number, times = 2): number => Math.pow(t, times);
const flip = (t: number): number => 1 - t;

export const Lerp = (start: number, end: number, t = 0.075): number =>
  start + (end - start) * t;

const Line = (t = 0.075) => t;

const In = (t = 0.075) => pow(t);
const InCubic = (t = 0.075) => pow(t, 3);
const InQuartic = (t = 0.075) => pow(t, 4);
const InQuintic = (t = 0.075) => pow(t, 5);
const InCustom = (t = 0.075, strength = 5) => pow(t, strength);

const Out = (t = 0.075) => flip(pow(flip(t)));
const OutCubic = (t = 0.075) => flip(pow(flip(t), 3));
const OutQuartic = (t = 0.075) => flip(pow(flip(t), 4));
const OutQuintic = (t = 0.075) => flip(pow(flip(t), 5));
const OutCustom = (t = 0.075, strength = 5) => flip(pow(flip(t), strength));

const InOut = (t = 0.075) => Lerp(In(t), Out(t), t);
const InOutCubic = (t = 0.075) => Lerp(InCubic(t), OutCubic(t), t);
const InOutQuartic = (t = 0.075) => Lerp(InQuartic(t), OutQuartic(t), t);
const InOutQuintic = (t = 0.075) => Lerp(InQuintic(t), OutQuintic(t), t);
const InOutCustom = (t = 0.075, strengthIn = 5, strengthOut = 5) =>
  Lerp(InCustom(t, strengthIn), OutCustom(t, strengthOut), t);

export type EasingFn = (t: number) => number;

const Ease = {
  Line,

  In,
  InCubic,
  InQuartic,
  InQuintic,
  InCustom,

  Out,
  OutCubic,
  OutQuartic,
  OutQuintic,
  OutCustom,

  InOut,
  InOutCubic,
  InOutQuartic,
  InOutQuintic,
  InOutCustom,
};

export default Ease;
