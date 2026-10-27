/**
 * Global pointer tracking, ported from the original helios `animator` renderer.
 *
 * The scene (vortex, tree) and the Sitemap cursor parallax all sample the
 * pointer once per frame rather than reacting to every `mousemove`. One
 * reference-counted listener serves all of them; it detaches when the last
 * consumer unsubscribes.
 */

export interface MouseCoords {
  /** Position relative to the document, including scroll offset. */
  document: { x: number | null; y: number | null };
  /** Position relative to the viewport. */
  window: { x: number | null; y: number | null };
}

const EMPTY: MouseCoords = {
  document: { x: null, y: null },
  window: { x: null, y: null },
};

let mouse: MouseEvent | null = null;
let listeners = 0;

const onMouseMove = (event: MouseEvent) => {
  mouse = event;
};

/** Attach the shared listener. Returns an unsubscribe function. */
export const subscribeMouse = (): (() => void) => {
  if (typeof window === "undefined") return () => {};

  if (listeners === 0) {
    window.addEventListener("mousemove", onMouseMove, { passive: true });
  }
  listeners += 1;

  let released = false;
  return () => {
    if (released) return;
    released = true;
    listeners -= 1;
    if (listeners === 0) {
      window.removeEventListener("mousemove", onMouseMove);
      mouse = null;
    }
  };
};

/** Latest pointer position. All fields are `null` until the pointer first moves. */
export const getMouseCoords = (): MouseCoords => {
  if (!mouse) return EMPTY;
  return {
    document: { x: mouse.pageX, y: mouse.pageY },
    window: { x: mouse.clientX, y: mouse.clientY },
  };
};

/**
 * Whether the pointer has ever moved.
 *
 * Scenes that repel particles from the cursor must gate the effect on this.
 * Before the first `mousemove` the cursor resolves to NDC (0, 0) — dead centre —
 * so an ungated void punches a hole through the middle of the scene, which is
 * exactly what a touch device or an untouched page would show.
 */
export const hasPointer = (): boolean => mouse !== null;
