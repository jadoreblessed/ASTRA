import * as THREE from "three";

import { layers } from "../constants";
import { color, paletteGen } from "@/lib/scene/palette";
import { deviceTier, viewScale } from "@/lib/scene/device";
import { useSceneConfig } from "@/lib/scene/scene-config";

/**
 * The void the scene lives in: a far starfield and a near drift of dust.
 *
 * Ported from `maelstrom.html`'s starfield and ambient-dust layers, with the
 * warm minority of stars recoloured to the signal pink.
 *
 * Neither layer morphs — that is the point. `Morph` rearranges the same matter
 * three times over, and without a fixed frame of reference behind it the camera's
 * flight reads as the *scene* moving rather than the viewer. The stars sit on a
 * far shell and barely shift; the dust hangs close and slides fast. Between them
 * they give the flight its parallax, and they are the one thing on screen that is
 * still there, unchanged, when the galaxy has become a black hole.
 *
 * Both are additive points with their glow drawn in-fragment, on `ENTIRE_SCENE`,
 * for the same reason everything else here is (ADR-0019).
 */

const CONFIG = {
  /** Far shell — beyond anything the camera reaches, so the stars never pass it. */
  starRadiusMin: 70,
  starRadiusSpan: 160,
  /** Push the shell behind the disc so the scene always has stars *behind* it. */
  starDepthBias: -40,
  starSize: 1.5,
  starBright: 2,
  /** Fraction of stars that burn pink rather than blue-white. */
  starPink: 0.12,

  /** Near motes, in a slab biased toward the camera. */
  dustExtent: [90, 60, 50] as const,
  dustDepthBias: 10,
} as const;

const COUNT = {
  desktop: { stars: 3600, dust: 650 },
  tablet: { stars: 2200, dust: 400 },
  // Trimmed for the phone fill budget; a sky reads as full well below 1200. ADR-0043.
  mobile: { stars: 700, dust: 120 },
} as const;

class Starfield {
  private readonly stars: THREE.Points;
  private readonly dust: THREE.Points;
  private readonly starMat: THREE.ShaderMaterial;
  private readonly dustMat: THREE.ShaderMaterial;

  constructor(scene: THREE.Scene) {
    const base = COUNT[deviceTier()];
    // Density scales the field; read at construction (applied on panel "Apply").
    const density = useSceneConfig.getState().vortex.density;
    const counts = {
      stars: Math.max(1, Math.round(base.stars * density)),
      dust: Math.max(1, Math.round(base.dust * density)),
    };

    this.starMat = this.buildStarMaterial();
    this.dustMat = this.buildDustMaterial();

    this.stars = new THREE.Points(this.starGeometry(counts.stars), this.starMat);
    this.dust = new THREE.Points(this.dustGeometry(counts.dust), this.dustMat);

    for (const p of [this.stars, this.dust]) {
      p.frustumCulled = false;
      p.layers.set(layers.ENTIRE_SCENE);
      scene.add(p);
    }
  }

  /* ---------------------------------------------------------------- geometry */

  private starGeometry(n: number) {
    const positions = new Float32Array(n * 3);
    const sizes = new Float32Array(n);
    const seeds = new Float32Array(n);
    const pinks = new Float32Array(n);

    for (let i = 0; i < n; i++) {
      // A random direction on the shell, with depth variation.
      const u = Math.random() * 2 - 1;
      const theta = Math.random() * Math.PI * 2;
      const ring = Math.sqrt(1 - u * u);
      const radius =
        CONFIG.starRadiusMin + Math.random() * CONFIG.starRadiusSpan;

      positions[i * 3] = Math.cos(theta) * ring * radius;
      positions[i * 3 + 1] = Math.sin(theta) * ring * radius;
      positions[i * 3 + 2] = u * radius + CONFIG.starDepthBias;

      /* An eighth power: almost every star is a pinprick and a rare few are
       * hero stars. A uniform distribution reads as noise, not as a sky. */
      sizes[i] = 0.14 + Math.pow(Math.random(), 8) * 0.85;
      seeds[i] = Math.random();
      pinks[i] = Math.random() < CONFIG.starPink ? Math.random() : 0;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
    geometry.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1));
    geometry.setAttribute("aPink", new THREE.BufferAttribute(pinks, 1));
    return geometry;
  }

  private dustGeometry(n: number) {
    const positions = new Float32Array(n * 3);
    const seeds = new Float32Array(n);
    const [ex, ey, ez] = CONFIG.dustExtent;

    for (let i = 0; i < n; i++) {
      positions[i * 3] = (Math.random() - 0.5) * ex;
      positions[i * 3 + 1] = (Math.random() - 0.5) * ey;
      positions[i * 3 + 2] = (Math.random() - 0.5) * ez + CONFIG.dustDepthBias;
      seeds[i] = Math.random();
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1));
    return geometry;
  }

  /* --------------------------------------------------------------- materials */

  private buildStarMaterial() {
    return new THREE.ShaderMaterial({
      uniforms: {
        iTime: { value: 0 },
        uAlpha: { value: 0 },
        uSize: { value: CONFIG.starSize },
        uBright: { value: CONFIG.starBright },
        uViewScale: { value: 1 },
        uCool: { value: color("accent200") },
        uPink: { value: color("signalRing") },
      },
      vertexShader: /* glsl */ `
        attribute float aSize; attribute float aSeed; attribute float aPink;
        uniform float iTime; uniform float uAlpha; uniform float uSize; uniform float uBright; uniform float uViewScale;
        uniform vec3 uCool; uniform vec3 uPink;
        varying vec3 vCol; varying float vB;
        #define TAU 6.2831853

        void main() {
          float tw = 0.6 + 0.4 * sin(iTime * 1.4 + aSeed * TAU);
          vCol = mix(uCool, uPink, aPink);
          vB = aSize * tw * uBright * uAlpha;

          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          /* Clamped at the top, which it never used to be. Stars sit on a far
           * shell so they rarely came near the lens — but "rarely" is not "never",
           * and an unbounded 1/z is a sprite that can cover the screen. */
          gl_PointSize = clamp(aSize * uSize * uViewScale * (300.0 / -mv.z), 0.5, 10.0);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        varying vec3 vCol; varying float vB;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          if (d > 0.5) discard;
          gl_FragColor = vec4(vCol, vB * smoothstep(0.5, 0.08, d));
        }`,
      blending: THREE.AdditiveBlending,
      depthTest: false,
      depthWrite: false,
      transparent: true,
    });
  }

  private buildDustMaterial() {
    return new THREE.ShaderMaterial({
      uniforms: {
        iTime: { value: 0 },
        uAlpha: { value: 0 },
        uViewScale: { value: 1 },
        uColor: { value: color("accent500") },
      },
      vertexShader: /* glsl */ `
        attribute float aSeed;
        uniform float iTime; uniform float uAlpha; uniform float uViewScale;
        varying float vB;
        #define TAU 6.2831853

        void main() {
          vec3 p = position;
          p.x += sin(iTime * 0.2 + aSeed * TAU) * 1.4;   // a slow, aimless drift
          p.y += cos(iTime * 0.17 + aSeed * TAU) * 1.1;

          vB = (0.10 + 0.10 * sin(iTime * 0.8 + aSeed * 12.0)) * uAlpha;

          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          /* The dust is the expensive layer, and it had no ceiling at all. It hangs
           * in a slab *around* the camera, so a mote drifting a couple of units off
           * the lens was drawing a sprite hundreds of pixels across — full-screen
           * additive fill, from one vertex, several times over. The bokeh look is
           * the point and survives: 44px is still a soft blue orb, it just cannot
           * eat the frame any more. */
          gl_PointSize = clamp((1.0 + aSeed * 2.0) * uViewScale * (200.0 / -mv.z), 0.8, 44.0);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        varying float vB;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          if (d > 0.5) discard;
          gl_FragColor = vec4(uColor, vB * smoothstep(0.5, 0.0, d));
        }`,
      blending: THREE.AdditiveBlending,
      depthTest: false,
      depthWrite: false,
      transparent: true,
    });
  }

  /* ------------------------------------------------------------------ frame */

  resize() {}

  /** Last palette generation whose colours are in the uniforms (live recolour). */
  private paletteSig = -1;

  private applyColors() {
    this.starMat.uniforms.uCool.value.copy(color("accent200"));
    this.starMat.uniforms.uPink.value.copy(color("signalRing"));
    this.dustMat.uniforms.uColor.value.copy(color("accent500"));
  }

  /** `appear` is the shared entrance; the stars lead the cloud in slightly. */
  render({ appear = 0 }: { appear?: number } = {}) {
    const t = performance.now() / 1000;

    // Live recolour from the dev panel, only when the palette actually changed.
    if (this.paletteSig !== paletteGen()) {
      this.paletteSig = paletteGen();
      this.applyColors();
    }

    const vs = viewScale();
    this.starMat.uniforms.uViewScale.value = vs;
    this.dustMat.uniforms.uViewScale.value = vs;

    this.starMat.uniforms.iTime.value = t;
    this.starMat.uniforms.uAlpha.value = Math.min(1, appear * 1.4);

    this.dustMat.uniforms.iTime.value = t;
    this.dustMat.uniforms.uAlpha.value = appear;
  }
}

export default Starfield;
