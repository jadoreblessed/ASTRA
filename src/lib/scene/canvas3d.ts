import * as THREE from "three";

import { clampedPixelRatio } from "./device";

/**
 * Base class for the WebGL scene, ported from the original helios
 * `animator/presets/canvas3d.ts`.
 *
 * Difference from the original: it no longer starts or owns a render loop. The
 * mounting React leaf subscribes `render(time)` to the app-wide ticker, so the
 * scene shares the single rAF with every spring-driven component on the page.
 */

export type RenderCallback = (time: number) => void;
export type ResizeCallback = () => void;

abstract class Canvas3d {
  protected parent: HTMLElement;
  protected canvas: HTMLCanvasElement;
  protected scene: THREE.Scene;
  protected renderer: THREE.WebGL1Renderer;

  protected width: number | null = null;
  protected height: number | null = null;
  protected ratio: number | null = null;

  /** Size against the window rather than the parent element. */
  protected checkWindow = false;

  private rendering: RenderCallback[] = [];
  private resizing: ResizeCallback[] = [];
  private isRenderActive = true;

  private resizeRafId: number | null = null;
  private readonly boundResize: () => void;
  private readonly isTouchDevice: boolean;

  constructor(parent: HTMLElement, canvas: HTMLCanvasElement) {
    this.parent = parent;
    this.canvas = canvas;

    this.scene = new THREE.Scene();

    /* On mobile we deliberately attach no resize listener: iOS Safari fires
     * `resize` whenever the URL bar collapses during scroll, which rebuilds the
     * WebGL framebuffer mid-scroll and reads as a full-scene flicker. The canvas
     * is sized once on load and stays that way for the session — the trade-off
     * being that a rotation won't reflow the surface. Desktop keeps the
     * event-driven, rAF-coalesced resize. Computed before the renderer because it
     * also gates multisampling. */
    this.isTouchDevice =
      window.innerWidth < 768 ||
      (typeof window.matchMedia === "function" &&
        window.matchMedia("(hover: none) and (pointer: coarse)").matches);

    /* No MSAA on touch. These scenes are fill-bound, and multisampling multiplies
     * the fragment cost of every additive halo for a gain that is invisible on a
     * soft point cloud viewed on a dense phone display — antialiasing a blur. It
     * stays on for desktop, where the hard-edged warp streaks benefit. Ask for the
     * discrete GPU where the browser exposes the choice. */
    this.renderer = new THREE.WebGL1Renderer({
      canvas,
      antialias: !this.isTouchDevice,
      powerPreference: "high-performance",
    });

    /* A shipped shader has been checked already: reading back every program's
     * info logs on first use is a synchronous round trip to the GPU process per
     * log, three per program — on a phone, part of the first frame's stall. */
    this.renderer.debug.checkShaderErrors =
      process.env.NODE_ENV !== "production";

    this.resizeSurface();

    this.boundResize = () => {
      if (this.resizeRafId !== null) return;
      this.resizeRafId = requestAnimationFrame(() => {
        this.resizeRafId = null;
        this.resizeSurface();
      });
    };

    if (!this.isTouchDevice) {
      window.addEventListener("resize", this.boundResize, { passive: true });
      window.addEventListener("orientationchange", this.boundResize, {
        passive: true,
      });
    }
  }

  protected toResize(callback: ResizeCallback): void {
    this.resizing.push(callback);
  }

  protected toRender(callback: RenderCallback): void {
    this.rendering.push(callback);
  }

  protected stopRender(): void {
    this.isRenderActive = false;
  }

  protected startRender(): void {
    this.isRenderActive = true;
  }

  private resizeSurface(): void {
    const rect = this.parent.getBoundingClientRect();
    const width = this.checkWindow ? window.innerWidth : rect.width;
    const height = this.checkWindow ? window.innerHeight : rect.height;

    if (this.width === width && this.height === height) return;

    this.canvas.width = this.width = width;
    this.canvas.height = this.height = height;
    /* Clamped, not raw. These scenes are fill-bound — a 3x phone would render 9x
     * the fragments of a 1x screen through additive halos, for no visible gain
     * on soft point sprites. See `lib/scene/device.ts`. */
    this.ratio = clampedPixelRatio();
    this.renderer.setSize(width, height, false);
    this.renderer.setPixelRatio(this.ratio);
    this.resizing.forEach((fn) => fn());
  }

  /** Called once per frame by the ticker subscription in the React leaf. */
  public render(time: number): void {
    if (!this.isRenderActive) return;
    this.rendering.forEach((fn) => fn(time));
  }

  /** Detach listeners and free GPU resources. */
  public dispose(): void {
    if (!this.isTouchDevice) {
      window.removeEventListener("resize", this.boundResize);
      window.removeEventListener("orientationchange", this.boundResize);
    }
    if (this.resizeRafId !== null) cancelAnimationFrame(this.resizeRafId);
    this.stopRender();
    this.rendering = [];
    this.resizing = [];
    this.renderer.dispose();
  }
}

export default Canvas3d;
