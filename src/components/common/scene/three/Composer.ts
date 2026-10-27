import * as THREE from "three";

import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";

import { clampedPixelRatio, viewScale } from "@/lib/scene/device";
import { useSceneConfig } from "@/lib/scene/scene-config";
import { scrollState } from "@/lib/scene/scroll-state";
import { FinalPass } from "./common/final-pass";
import { layers } from "./constants";

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** What three.js keeps per material — only the linked program is read here. */
interface MaterialState {
  currentProgram?: { getUniforms: () => unknown };
}

/**
 * A program's first use reads back its uniforms and attributes from the GPU
 * (`WebGLProgram.getUniforms`) — on a phone a few milliseconds per program, and
 * the first frame used to pay it for every program at once. Here each program
 * pays it in a task of its own, before that frame.
 */
const firstUse = async (
  renderer: THREE.WebGLRenderer,
  scenes: THREE.Scene[],
): Promise<void> => {
  const materials = new Set<THREE.Material>();
  for (const scene of scenes) {
    scene.traverse((object) => {
      const { material } = object as THREE.Mesh;
      if (!material) return;
      for (const m of Array.isArray(material) ? material : [material]) {
        materials.add(m);
      }
    });
  }
  for (const material of materials) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    const state = renderer.properties.get(material) as MaterialState;
    state.currentProgram?.getUniforms();
  }
};

/**
 * Post-processing: render the scene, then composite it over the corner wash.
 *
 * This used to be three chained `EffectComposer`s — a torus bloom chain, a scene
 * bloom chain, and a final pass sampling both. All of it was dead:
 *
 * - Every scene object renders on `ENTIRE_SCENE`, so the torus and bloom layers
 *   were empty and both chains rendered nothing.
 * - Neither chain set `renderToScreen = false`, so their last passes drew
 *   straight to the canvas and their render targets went stale.
 * - `FinalPass` then sampled those stale targets plus a `haloTexture` that was
 *   never assigned. An unbound `sampler2D` reads texture unit 0 — whatever was
 *   last bound — so the composite changed frame to frame. That was the flicker.
 *
 * The glow was never coming from `UnrealBloomPass` anyway: the point clouds are
 * additively blended, and the terrain draws its own halo in-shader. Dropping the
 * two chains removes the flicker and two full-screen bloom passes per frame.
 */
class Composer {
  private readonly composer: EffectComposer;
  /** Set after the first frame, which always runs bloom to compile it. */
  private bloomWarmed = false;
  private readonly finalPass: ShaderPass;
  private readonly bloomPass: UnrealBloomPass;
  private readonly camera: THREE.Camera;

  constructor(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
  ) {
    this.camera = camera;

    this.composer = new EffectComposer(renderer);
    this.composer.addPass(new RenderPass(scene, camera));

    /* Optional dev-tunable bloom. Default strength is 0, so it is inert until the
     * settings panel turns it up — the point clouds fake their own glow in-shader
     * (ADR-0019), and fine points flicker through a real bloom, so it stays off by
     * default and is there only for tuning. */
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      0,
      0.4,
      0.6,
    );
    this.composer.addPass(this.bloomPass);

    this.finalPass = new ShaderPass(FinalPass);
    this.composer.addPass(this.finalPass);
  }

  /**
   * Link every program the first frame will use, off the main thread, before
   * that frame — and link them **as they will be used**.
   *
   * A program is cached per material *and* per output: three.js keys it on the
   * render target bound when it is built (a render target is linear, the
   * canvas sRGB). The scene never draws to the canvas — `RenderPass` draws it
   * into the composer's buffer — so linking it against the canvas (what a bare
   * `renderer.compileAsync(scene, camera)` does) built programs the first frame
   * never used, and that frame linked every scene program again, synchronously,
   * plus the bloom chain and the final pass: the load's longest task on a phone
   * (~1 s at 4× CPU). Here the scene and the bloom chain are linked against a
   * render target and the final pass against the canvas, each with
   * `compileAsync` (`KHR_parallel_shader_compile` where the GPU has it).
   */
  prewarm(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
  ): Promise<unknown> {
    const quad = new THREE.PlaneGeometry(2, 2);
    const lens = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const stages: THREE.Scene[] = [];
    const stage = (materials: THREE.Material[]) => {
      const stageScene = new THREE.Scene();
      for (const material of materials) {
        stageScene.add(new THREE.Mesh(quad, material));
      }
      stages.push(stageScene);
      return stageScene;
    };

    const bound = renderer.getRenderTarget();
    renderer.setRenderTarget(this.composer.readBuffer);
    const offscreen = [
      renderer.compileAsync(scene, camera),
      renderer.compileAsync(
        stage([
          this.bloomPass.materialHighPassFilter,
          ...this.bloomPass.separableBlurMaterials,
          this.bloomPass.compositeMaterial,
          this.bloomPass.blendMaterial,
        ]),
        lens,
      ),
    ];
    renderer.setRenderTarget(null);
    const toCanvas = renderer.compileAsync(stage([this.finalPass.material]), lens);
    renderer.setRenderTarget(bound);

    return Promise.all([...offscreen, toCanvas])
      .then(() => firstUse(renderer, [scene, ...stages]))
      .finally(() => quad.dispose());
  }

  resize() {
    this.composer.setSize(window.innerWidth, window.innerHeight);
    /* Must match `Canvas3d`'s clamp. The composer owns its own render targets,
     * so leaving it at raw `devicePixelRatio` would render the post pass at full
     * resolution and throw away the saving made on the scene pass. */
    this.composer.setPixelRatio(clampedPixelRatio());
  }

  render() {
    /* Bloom is per scene (hero / services / timeline), blended by the same morph
       weights that drive the forms, so each phase glows on its own settings. */
    const { hero, services, timeline } = useSceneConfig.getState().bloom;
    const { morphT1: t1, morphT2: t2 } = scrollState;
    // Scale bloom down on smaller windows so a look tuned on a big screen does
    // not blow out when the viewport shrinks.
    const vs = viewScale();
    this.bloomPass.strength =
      lerp(lerp(hero.strength, services.strength, t1), timeline.strength, t2) *
      vs;
    this.bloomPass.radius = lerp(
      lerp(hero.radius, services.radius, t1),
      timeline.radius,
      t2,
    );
    this.bloomPass.threshold = lerp(
      lerp(hero.threshold, services.threshold, t1),
      timeline.threshold,
      t2,
    );
    /* Skip the pass outright when it contributes nothing. Default strength is 0,
     * so on every unmodified session this elides a full-screen down/up-sample
     * bloom chain each frame — a pure saving, largest on the fill-bound phones.
     * `EffectComposer` honours `pass.enabled`. */
    this.bloomPass.enabled = !this.bloomWarmed || this.bloomPass.strength > 0.001;
    /* ↑ …except on the very first frame, which runs the pass once at whatever
     * strength (0 in the hero — output unchanged) so its programs compile under
     * the preloader. Left to first use, they compiled the moment Services'
     * bloom turned on, mid-scroll: a 755 ms three.js task on a 4× phone. */
    this.bloomWarmed = true;

    this.finalPass.uniforms.iTime.value = performance.now() / 1000;
    this.camera.layers.set(layers.ENTIRE_SCENE);
    this.composer.render();
  }
}

export default Composer;
