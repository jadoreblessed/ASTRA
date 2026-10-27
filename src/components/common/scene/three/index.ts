import * as THREE from "three";

import Canvas3d from "@/lib/scene/canvas3d";
import Camera from "./extensions/Camera";
import Controller from "./Controller";
import Composer from "./Composer";

/** Ends the current task: what follows runs in a task of its own. */
const nextTask = (): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, 0));

class Canvas extends Canvas3d {
  private readonly camera: Camera;
  /** Built a task after the renderer — see `build`. */
  private controller: Controller | null = null;
  private composer: Composer | null = null;
  /** False until the scene's programs have linked — see `build`. */
  private programsReady = false;
  private unmounted = false;

  constructor(parent: HTMLElement, canvas: HTMLCanvasElement) {
    super(parent, canvas);

    this.camera = new Camera(this.scene);

    this.scene.background = new THREE.Color(0x000000);

    /* No fog. It used to be `Fog(0x000000, 0, 15)`, "matching the original
     * scene" — but nothing here has ever consumed it: fog only reaches materials
     * that declare it, and every object in this scene is a raw `ShaderMaterial`.
     * Now that the camera flies out to z = 56 and the starfield sits 230 units
     * away, a far plane of 15 is not merely inert but wrong, so it is gone rather
     * than left as a trap for the next person who turns fog support on.
     *
     * `OrbitControls` is gone for a related reason: it was constructed with every
     * interaction disabled and `update()` never called, so it wrote to the camera
     * exactly never. `Controller` now flies the camera itself. */

    void this.build();

    this.toRender(() => {
      if (!this.programsReady || !this.controller || !this.composer) return;
      this.controller.render();
      this.composer.render();
    });

    this.toResize(() => {
      this.camera.resize();
      this.controller?.resize();
      this.composer?.resize();
    });
  }

  /**
   * The scene, built in steps of a task each: the renderer (the constructor),
   * the objects, the post chain and its program links. Built in one go they
   * were one long task on a phone, in the middle of hydration; each step on
   * its own stays short. Nothing draws until all of it is ready — as before,
   * the first frame waited for the programs anyway.
   */
  private async build() {
    await nextTask();
    if (this.unmounted) return;
    this.controller = new Controller(this.scene, this.camera.instance);

    await nextTask();
    if (this.unmounted) return;
    this.composer = new Composer(
      this.renderer,
      this.scene,
      this.camera.instance,
    );

    /* **Link the scene's programs off the main thread before the first frame.**
     * The first `render` used to compile every material and then read each
     * program's link status at first use — a synchronous wait on the driver. On a
     * software-GL phone profile (Lighthouse's) that wait was a single 1.3 s task
     * in about half the loads (the morph shader is long). `compileAsync` issues the
     * same compiles and polls `KHR_parallel_shader_compile` instead, so the main
     * thread stays free while they link; the first frame is drawn once they have
     * (where the extension is missing it resolves on the next tick, as before).
     * Nothing renders earlier than it could have: that frame was blocked anyway.
     * `Composer.prewarm` links them against the outputs they are drawn to — a
     * bare `compileAsync(scene, camera)` linked them for the canvas, and the
     * first frame linked them all again for the composer's buffer. */
    await this.composer.prewarm(
      this.renderer,
      this.scene,
      this.camera.instance,
    );
    this.programsReady = true;
  }

  unmount() {
    this.unmounted = true;
    this.controller?.dispose();
    this.dispose();
  }
}

export default Canvas;
