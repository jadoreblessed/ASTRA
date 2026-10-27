/**
 * Precise-endpoint lerp, ported from the original helios `animator/utils/lerp.ts`.
 * Distinct from `Lerp` in `./easing`: this form reaches `end` exactly at t=1
 * without float drift, which matters for scene uniforms that must settle.
 */
export function lerp(start: number, end: number, t = 0.075): number {
  return start * (1 - t) + end * t;
}
