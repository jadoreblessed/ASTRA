import * as THREE from "three";

import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";

import { clampedPixelRatio, deviceTier } from "./device";
import { Lerp } from "./easing";
import { getMouseCoords, hasPointer } from "./mouse";
import { useSceneConfig, type LogoConfig } from "./scene-config";

/**
 * A self-contained particle field that assembles the HELION mark from a drifting
 * cloud — a volumetric take on the two-triangle icon (Figma node 669:2033).
 *
 * Independent of the main `Scene`/`Controller` system: it owns its own renderer,
 * scene, and camera on its own transparent canvas, so it can sit over the page at
 * the Impact slide without touching the vortex choreography. The mounting React
 * leaf drives it from the shared ticker, passing the slide's scroll progress as
 * the assembly amount — 0 scatters the cloud, 1 snaps it into the mark.
 *
 * Every look value is read live from `useSceneConfig` so the dev panel can tune
 * it: colours, point size and brightness flow straight into uniforms each frame;
 * structural values (count, mark size, thickness, scatter) rebuild the buffers
 * via `rebuild()`. The mark turns to follow the cursor, eased, with an optional
 * idle spin. Targets are sampled by rasterising the icon's two triangular
 * outlines to an offscreen canvas, then given depth so the flat mark reads as a
 * turning slab. Additive soft sprites, one flat colour per ring.
 */

/** ASTRA's mark: the token — a coin's outer rim and fine inner rim, two
 *  annuli sampled the same way the triangles were. viewBox 124×125. */
const TRIANGLE_OUTER =
  "M122,62 A60,60 0 1,0 2,62 A60,60 0 1,0 122,62 Z M113,62 A51,51 0 1,0 11,62 A51,51 0 1,0 113,62 Z";
const TRIANGLE_INNER =
  "M103,62 A41,41 0 1,0 21,62 A41,41 0 1,0 103,62 Z M99,62 A37,37 0 1,0 25,62 A37,37 0 1,0 99,62 Z";
const ICON_VB_W = 124;
const ICON_VB_H = 125;

/** Upper bound on particle count, so a slider can't allocate the tab to death. */
const MAX_COUNT = 24000;

export class LogoParticleField {
  private readonly renderer: THREE.WebGL1Renderer;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly points: THREE.Points;
  private material: THREE.ShaderMaterial;
  private geometry: THREE.BufferGeometry;

  private readonly composer: EffectComposer;
  private readonly bloomPass: UnrealBloomPass;

  private rotY = 0;
  private rotX = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGL1Renderer({
      canvas,
      antialias: true,
      alpha: true,
    });
    this.renderer.setClearColor(0x000000, 0);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    this.camera.position.set(0, 0, 13);

    this.material = this.buildMaterial();
    this.geometry = this.buildGeometry(this.config());
    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
    this.scene.add(this.points);

    // Own post chain so the mark can carry its own tunable bloom (default off).
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      0,
      0.4,
      0.6,
    );
    this.composer.addPass(this.bloomPass);

    this.resize();
  }

  private config(): LogoConfig {
    return useSceneConfig.getState().logo;
  }

  /* ---------------------------------------------------------------- geometry */

  private buildGeometry(c: LogoConfig): THREE.BufferGeometry {
    const n = Math.min(MAX_COUNT, Math.max(200, Math.round(c.count)));
    const start = new Float32Array(n * 3);
    const target = new Float32Array(n * 3);
    const seed = new Float32Array(n);
    const size = new Float32Array(n);

    for (let i = 0; i < n; i++) {
      // Scattered start: a random point in a spherical shell around the mark.
      const r = c.spreadMin + Math.random() * c.spreadSpan;
      const u = Math.random() * 2 - 1;
      const theta = Math.random() * Math.PI * 2;
      const ring = Math.sqrt(1 - u * u);
      start[i * 3] = Math.cos(theta) * ring * r;
      start[i * 3 + 1] = Math.sin(theta) * ring * r;
      start[i * 3 + 2] = u * r;

      seed[i] = Math.random();
      size[i] = 0.5 + Math.random() * Math.random() * 1.7;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(start, 3));
    geometry.setAttribute("aTarget", new THREE.BufferAttribute(target, 3));
    geometry.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
    geometry.setAttribute("aSize", new THREE.BufferAttribute(size, 1));

    this.sampleTargets(geometry, n, c);
    return geometry;
  }

  /** Rasterise the two outlines and scatter each particle's target on the band. */
  private sampleTargets(
    geometry: THREE.BufferGeometry,
    n: number,
    c: LogoConfig,
  ): void {
    const scale = 4;
    const w = Math.round(ICON_VB_W * scale);
    const h = Math.round(ICON_VB_H * scale);

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.scale(scale, scale);
    ctx.fillStyle = "#fff";
    // `evenodd` fills the ring between each outline's outer and inner contour,
    // so the sampled band is the mark's line-art, not a solid triangle.
    ctx.fill(new Path2D(TRIANGLE_OUTER), "evenodd");
    ctx.fill(new Path2D(TRIANGLE_INNER), "evenodd");

    const data = ctx.getImageData(0, 0, w, h).data;
    const opaque: number[] = [];
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] > 40) opaque.push((i - 3) / 4);
    }
    if (opaque.length === 0) return;

    const target = geometry.getAttribute("aTarget") as THREE.BufferAttribute;
    const arr = target.array as Float32Array;

    for (let i = 0; i < n; i++) {
      const pixel = opaque[(Math.random() * opaque.length) | 0];
      const px = pixel % w;
      const py = (pixel / w) | 0;
      arr[i * 3] = (px / w - 0.5) * c.markSize;
      arr[i * 3 + 1] = -(py / h - 0.5) * c.markSize; // flip: canvas y is down
      arr[i * 3 + 2] = (Math.random() - 0.5) * c.thickness;
    }
    target.needsUpdate = true;
  }

  /** Rebuild the buffers after a structural config change. */
  rebuild(): void {
    const geometry = this.buildGeometry(this.config());
    this.points.geometry = geometry;
    this.geometry.dispose();
    this.geometry = geometry;
  }

  /* --------------------------------------------------------------- material */

  private buildMaterial(): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
      uniforms: {
        uProgress: { value: 0 },
        uTime: { value: 0 },
        uAlpha: { value: 0 },
        uPointScale: { value: 1 },
        uColorA: { value: new THREE.Color("#4977ff") },
        uColorB: { value: new THREE.Color("#d2bdff") },
        uMark: { value: 1 },
      },
      vertexShader: /* glsl */ `
        attribute vec3 aTarget; attribute float aSeed; attribute float aSize;
        uniform float uProgress; uniform float uTime; uniform float uAlpha; uniform float uPointScale;
        uniform vec3 uColorA; uniform vec3 uColorB; uniform float uMark;
        varying vec3 vCol; varying float vB;
        #define TAU 6.2831853

        void main() {
          // Per-particle stagger so the mark builds rather than snapping in.
          float e = smoothstep(0.0, 1.0, clamp(uProgress * 1.35 - aSeed * 0.35, 0.0, 1.0));
          vec3 p = mix(position, aTarget, e);

          // A faint idle shimmer once assembled; scattered motes drift wider.
          float drift = mix(0.6, 0.05, e);
          p.x += sin(uTime * 0.7 + aSeed * TAU) * drift;
          p.y += cos(uTime * 0.6 + aSeed * TAU) * drift;

          // Flat colour per ring: blue rim, lilac inner ring — no blend.
          vCol = length(aTarget.xy) > 0.37 * uMark ? uColorA : uColorB;

          float tw = 0.7 + 0.3 * sin(uTime * 1.6 + aSeed * TAU);
          vB = aSize * tw * uAlpha;

          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = clamp(aSize * uPointScale * (300.0 / -mv.z), 0.6, 9.0);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        varying vec3 vCol; varying float vB;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          if (d > 0.5) discard;
          gl_FragColor = vec4(vCol, vB * smoothstep(0.5, 0.05, d));
        }`,
      blending: THREE.AdditiveBlending,
      depthTest: false,
      depthWrite: false,
      transparent: true,
    });
  }

  /* ------------------------------------------------------------------ frame */

  resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setPixelRatio(clampedPixelRatio());
    this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(clampedPixelRatio());
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /**
   * `assembly` 0..1 gathers the mark; `alpha` 0..1 is its overall opacity (kept
   * separate so the mark can hold assembled while it fades out); `time` seconds.
   */
  render(assembly: number, alpha: number, time: number): void {
    const c = this.config();
    const u = this.material.uniforms;
    u.uProgress.value = assembly;
    u.uAlpha.value = alpha * c.brightness;
    u.uTime.value = time;
    u.uPointScale.value = c.pointSize;
    (u.uColorA.value as THREE.Color).set(c.colorA);
    (u.uColorB.value as THREE.Color).set(c.colorB);
    u.uMark.value = c.markSize;

    // Cursor-driven tilt only — no idle spin. The mark turns to face the
    // pointer and eases back to its resting tilt when the pointer is still.
    let mx = 0;
    let my = 0;
    if (hasPointer()) {
      const m = getMouseCoords().window;
      if (m.x !== null) mx = (m.x / window.innerWidth) * 2 - 1;
      if (m.y !== null) my = (m.y / window.innerHeight) * -2 + 1;
    }
    const targetY = mx * c.mouseStrength;
    const targetX = c.tilt + my * c.mouseStrength * 0.5;
    this.rotY = Lerp(this.rotY, targetY, 0.08);
    this.rotX = Lerp(this.rotX, targetX, 0.08);
    this.points.rotation.y = this.rotY;
    this.points.rotation.x = this.rotX;

    const bloom = useSceneConfig.getState().bloom.logo;
    this.bloomPass.strength = bloom.strength;
    this.bloomPass.radius = bloom.radius;
    this.bloomPass.threshold = bloom.threshold;

    this.composer.render();
  }

  /** Blank the surface — called once when the field scrolls out of view. */
  clear(): void {
    this.renderer.clear();
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
    this.composer.dispose();
    this.renderer.dispose();
  }
}
