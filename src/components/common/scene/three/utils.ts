import { events } from "./constants";

/** Below this width the scene swaps in its mobile geometry. */
const MOBILE_WIDTH = 576;

/**
 * Announce that a scene object has finished (or begun) a transition.
 *
 * Retained because the scene objects call it, but note that **nothing listens**:
 * the original dispatched `setchanging` and never registered a handler. Left in
 * place so the vendored objects port unmodified. See [[decisions-log]] ADR-0014.
 */
export const dispatchSetChanging = (changing: boolean, delay = 500) => {
  setTimeout(() => {
    document.dispatchEvent(
      new CustomEvent(events.SETCHANGING, { detail: { changing } }),
    );
  }, delay);
};

/** Run `callback` only on narrow viewports. */
export const onMobile = (callback: () => void) => {
  if (window.innerWidth < MOBILE_WIDTH) callback();
};
