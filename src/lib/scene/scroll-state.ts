import { screens, type ScreenId } from "./screens";

/**
 * Scroll-driven state shared between the section controller (the writer, once
 * per frame on the shared ticker) and the Three.js scene (the reader, once per
 * frame in its render pass).
 *
 * A plain mutable object rather than a store on purpose: it is read and written
 * every frame, and routing it through React state would re-render the tree 60
 * times a second. React only ever learns about the *discrete* part of this —
 * which section is active — via `useSections`.
 *
 * - `sceneProgress[id]`   0..1 triangular-kernel visibility of each scene.
 * - `slideLocalProgress[id]` 0..1 scroll position within the slide: 0 at its
 *   top, 1 once the slide's stuck range is exhausted. Drives intra-section
 *   animation such as the Brief terrain morph.
 * - `innerProgress[id]`   0..1 for the tighter inner stops.
 */

const zeroed = (ids: readonly ScreenId[]): Record<string, number> =>
  Object.fromEntries(ids.map((id) => [id, 0]));

const SLIDE_IDS = [
  screens.HERO,
  screens.SITEMAP,
  screens.ROADMAP,
  screens.IMPACT,
  screens.PARTNERS,
  screens.PRODUCT,
  screens.INVESTORS,
  screens.SOCIAL,
] as const;

const INNER_IDS = [
  screens.ROADMAP__INNER_1,
  screens.ROADMAP__INNER_2,
  screens.ROADMAP__INNER_3,
  screens.PRODUCT__INNER_1,
  screens.PRODUCT__INNER_2,
] as const;

/** Document-space extent of a slide anchor. */
export interface SlideRange {
  top: number;
  bottom: number;
}

export interface ScrollState {
  scrollY: number;
  vh: number;
  activeScreen: string;
  sceneProgress: Record<string, number>;
  slideLocalProgress: Record<string, number>;
  innerProgress: Record<string, number>;
  /**
   * The morph weights the `Controller` derives each frame: `morphT1` galaxy→burst,
   * `morphT2` burst→maelstrom. Mirrored here so the post-process `Composer` can
   * blend its per-scene bloom by the same weights without reaching into the
   * controller.
   */
  morphT1: number;
  morphT2: number;
  /**
   * Where each slide sits in the document, remeasured every frame.
   *
   * Needed by anything that must react *monotonically* to scroll position.
   * `sceneProgress` is a triangular kernel — it rises and then falls again — so
   * it cannot express "we are at or below this slide" (see `useSceneVisibility`,
   * where keying off the kernel made the canvas reappear at the footer).
   */
  slideRange: Record<string, SlideRange>;
}

export const scrollState: ScrollState = {
  scrollY: 0,
  vh: 1,
  activeScreen: screens.NONE,
  sceneProgress: zeroed(SLIDE_IDS),
  slideLocalProgress: zeroed(SLIDE_IDS),
  innerProgress: zeroed(INNER_IDS),
  morphT1: 0,
  morphT2: 0,
  slideRange: {},
};

/** Scroll distance past Impact's top, in viewports, at which the canvas is gone. */
const SCENE_GONE_AT = 2.3;

/**
 * Is the scene worth drawing this frame?
 *
 * The starry scene is kept alive **through** the Impact slide on purpose: the
 * logo mark assembles over the very same starfield, so the two read as one
 * continuous scene rather than a hard cut to black and a fresh figure. It is only
 * stopped once the whole canvas has faded out toward the footer
 * (`useSceneVisibility` uses the matching geometry). A hidden tab paints nothing.
 */
export const isSceneVisible = (): boolean => {
  if (typeof document !== "undefined" && document.hidden) return false;
  if (scrollState.activeScreen === screens.NONE) return true;

  const impact = scrollState.slideRange[screens.IMPACT];
  if (!impact) return true;

  const { scrollY, vh } = scrollState;
  return scrollY - impact.top < vh * SCENE_GONE_AT;
};
