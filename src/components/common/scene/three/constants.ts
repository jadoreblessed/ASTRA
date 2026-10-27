/**
 * DOM events the scene dispatches, and the render layers the composer switches
 * between.
 *
 * Only `LOADING` and `loaderdestroy` are live: the preloader (`objects/warp`)
 * emits them and `<Scene>` listens. `SETCHANGING` is dispatched by the vendored
 * `utils.ts` and has never had a listener — see [[decisions-log]] ADR-0014.
 */
const events = {
  /** `detail: { percent: number }`, 0-100, from the preloader. */
  LOADING: "scene:loading",
  /** Dispatched once, when the preloader has removed itself. */
  LOADER_DESTROY: "loaderdestroy",
  SETCHANGING: "setchanging",
} as const;

enum layers {
  NONE,
  TORUS_SCENE,
  BLOOM_SCENE,
  ENTIRE_SCENE,
}

export { events, layers };
