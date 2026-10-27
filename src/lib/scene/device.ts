/**
 * Device tiering for the WebGL scene.
 *
 * One place decides what "mobile" means, so particle counts, pixel ratio and
 * frame budget can never drift apart. Every value here is read once at scene
 * construction — a device does not change tier mid-session, and rebuilding the
 * buffers on a resize costs more than the mismatch is worth.
 */

export type DeviceTier = "mobile" | "tablet" | "desktop";

/** Matches the `--breakpoint-*` tokens the layout uses. */
const TABLET_MAX = 1180;
const MOBILE_MAX = 768;

export const deviceTier = (): DeviceTier => {
  if (typeof window === "undefined") return "desktop";
  const width = window.innerWidth;
  const coarse =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(hover: none) and (pointer: coarse)").matches;

  if (width < MOBILE_MAX || coarse) return "mobile";
  if (width < TABLET_MAX) return "tablet";
  return "desktop";
};

/**
 * Hard ceiling on the mobile render scale, in backing-store px per CSS px.
 *
 * Below 1.0 because these scenes are a decorative background behind the content,
 * they are entirely fill-bound, and the point sprites are soft — so rendering the
 * canvas at 0.85× and letting the browser upscale is invisible on the cloud while
 * cutting roughly a third of the fragments. Distinct from the desktop clamp, whose
 * hard-edged warp streaks want native resolution.
 */
const MOBILE_MAX_DPR = 0.85;

/**
 * Device pixel ratio, clamped.
 *
 * A 3x phone renders 9x the fragments of a 1x screen for no perceptible gain on
 * a point cloud — the sprites are already soft. The floor keeps a 1x laptop from
 * rendering below native. Mobile is cut below 1.0 (`MOBILE_MAX_DPR`): fill rate is
 * what kills these scenes on a phone, and the halo-heavy additive blending is pure
 * fill.
 */
export const clampedPixelRatio = (tier: DeviceTier = deviceTier()): number => {
  if (typeof window === "undefined") return 1;
  const dpr = window.devicePixelRatio || 1;
  if (tier === "mobile") return Math.min(dpr, MOBILE_MAX_DPR);
  return Math.min(Math.max(dpr, 0.75), 1.5);
};

/**
 * The OS "reduce motion" accessibility setting.
 *
 * Distinct from react-spring's `useReducedMotion` (which only skips spring/DOM
 * animation): this is read by the WebGL scene to decide whether to keep the whole
 * flight running or settle to a static frame. A plain function, not a hook — the
 * scene lives outside React.
 */
export const prefersReducedMotion = (): boolean => {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
};

/**
 * Best-effort "this device wants us to spend less" signal. Every input is
 * optional and absent on most desktops, so it only ever trips on a constrained
 * client: Data Saver on (users on metered/low-power setups routinely enable it —
 * the nearest web-exposed proxy for iOS Low Power Mode, which has no API) or a
 * device reporting ≤ 2 GB of memory.
 */
export const isEnergySaver = (): boolean => {
  if (typeof navigator === "undefined") return false;
  const nav = navigator as Navigator & {
    connection?: { saveData?: boolean };
    deviceMemory?: number;
  };
  if (nav.connection?.saveData === true) return true;
  if (typeof nav.deviceMemory === "number" && nav.deviceMemory > 0) {
    return nav.deviceMemory <= 2;
  }
  return false;
};

/**
 * Whether the scene should drop to its cheapest path: play the entrance once,
 * then freeze on a settled frame so nothing animates on scroll or idle. True when
 * the user asked for reduced motion (any device — an accessibility promise), or
 * on a phone flagged as energy-constrained, where a continuous WebGL flight is
 * the thing that drags the whole page down.
 */
export const sceneShouldFreeze = (tier: DeviceTier = deviceTier()): boolean => {
  if (prefersReducedMotion()) return true;
  return tier === "mobile" && isEnergySaver();
};

/**
 * Minimum milliseconds between scene frames, per tier.
 *
 * The ticker throttles each subscriber independently, so capping the scene does
 * not slow the spring components sharing the loop.
 *
 * Phones render at the display rate. They were capped at 30fps, and the
 * ticker's `gap <= budget` check turned that into every 3rd frame on a 60Hz
 * screen (20fps) and every 5th on a 120Hz one (24fps) — the owner read it as a
 * choppy scene (2026-10-06, D-033). The phone frame is already cheap (DPR 0.85,
 * ~12k points, bloom off at strength 0), and every motion in the scene is
 * clock- or scroll-driven, so a higher rate is smoother, never faster.
 */
export const frameBudgetMs = (tier: DeviceTier = deviceTier()): number => {
  if (tier === "tablet") return 1000 / 45;
  return 0; // desktop and phones: every rAF tick
};

/** Picks the value for the current tier. */
export const byTier = <T>(tier: DeviceTier, values: Record<DeviceTier, T>): T =>
  values[tier];

/**
 * A 0.5–1 factor that shrinks particle point sizes and bloom on smaller windows.
 *
 * Point sizes are set in device pixels, so a mark tuned on a tall screen occupies
 * a larger *fraction* of a short one — the additive sprites then pile up and the
 * bloom blows out. Scaling both by the viewport height against a reference keeps
 * the tuned look on large screens (clamped to 1) and proportionally dials it back
 * as the window shrinks.
 */
const VIEW_SCALE_REFERENCE = 1080;

export const viewScale = (): number => {
  if (typeof window === "undefined") return 1;
  return Math.min(1, Math.max(0.5, window.innerHeight / VIEW_SCALE_REFERENCE));
};
