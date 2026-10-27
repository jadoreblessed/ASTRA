import * as THREE from "three";

import { events, layers } from "../constants";
import { color } from "@/lib/scene/palette";
import Tween from "@/lib/scene/tween";
import Ease from "@/lib/scene/easing";

/**
 * Preloader — a warp tunnel: streaks of light rushing past the lens.
 *
 * Replaces the falling light trails, which read as weather rather than as
 * travel. The scene that follows opens on a galaxy, and the load should be the
 * flight *into* it — so the streaks fly at the viewer down the z axis, and
 * perspective alone fans them outward from the vanishing point. Nothing is
 * animated on the CPU: each streak's whole lifecycle is a `fract()` in the
 * vertex shader, so one `LineSegments` draw call carries the field.
 *
 * Three things make it read as acceleration rather than as a loop:
 *
 * - **`uBoost`** is the load percentage. The field speeds up and the streaks
 *   lengthen as the bar fills, so the tunnel is visibly winding up the whole
 *   time the numbers climb — the loader *is* the progress bar.
 * - **`uSurge`** fires on destroy: the streaks stretch to their full length in
 *   one jump as the field fades, which is the moment the warp breaks and hands
 *   the screen to the galaxy.
 * - Each streak **accelerates along its own run** (`life²`), because a linear
 *   approach at constant world speed reads as drifting — the perspective
 *   foreshortening cancels most of the sense of speed until the very end.
 *
 * Each streak is a **camera-facing quad**, not a `LINES` primitive. A warp
 * points its streaks nearly straight down the view axis, so most of them project
 * to only a few pixels of screen length — and a `gl.LINES` streak is always one
 * *device* pixel wide, which a real GPU rasterises to a single bright dot the
 * moment the segment is short. That is the field reading as pixels rather than as
 * comets. Expanding each streak into a quad and offsetting its two long edges by
 * a fixed pixel half-width in clip space (`uWidth` / `uResolution`) gives every
 * streak a soft, DPI-independent body: a bright head with a fading tail, wide
 * enough to read as a trail at any distance. It stays one indexed draw call.
 *
 * It keeps the preloader contract the rest of the app depends on: an
 * `LOAD_DURATION` tween emitting `events.LOADING` with a percent, then — once
 * the section controller reports a live screen — a fade, self-destruct, and
 * `events.LOADER_DESTROY`.
 *
 * Like the trails before it, the tunnel is a **child of the camera**, not of the
 * scene. It has to stay in front of a lens that moves (see `Controller`).
 */

const STREAK_COUNT = 1400;

/** How far down the tunnel a streak spawns, and how close it gets, in units. */
const FAR = 60;
const NEAR = 1.2;

/**
 * Radial reach of the tunnel wall at a 1:1 aspect, in world units. Scaled by
 * aspect in `resize` so the corners of a wide viewport still fill.
 */
const RADIUS = 9;

/**
 * Streak body width, in CSS pixels. Held constant on screen regardless of depth
 * or device pixel ratio (the quad's edges are offset in clip space, scaled by
 * `uResolution`), so a streak a hair from the vanishing point still has a soft
 * body to read rather than collapsing to a lone pixel the way a `gl.LINES`
 * hairline does. Additive, so this is glow, not a hard edge — keep it modest.
 */
const STREAK_WIDTH = 2.2;

/**
 * Duration of the fake load, in ms.
 *
 * Nothing actually loads — there are no textures or models, only shaders and
 * generated buffers. The tween exists to cover the scene's first paint and to
 * give the warp a moment on screen.
 */
const LOAD_DURATION = 1800;
/** Fade-out after `destroy`, in ms. The surge runs over the same window. */
const FADE_OUT = 650;

export interface WarpRenderProps {
  destroy?: boolean;
}

class Warp {
  /** Read by the scene controller to know whether to keep rendering us. */
  readonly state = { alive: true, started: false };

  private readonly camera: THREE.PerspectiveCamera;
  private readonly mesh: THREE.Mesh;
  private readonly material: THREE.ShaderMaterial;
  private readonly geometry: THREE.BufferGeometry;

  private dying = false;
  private dyingSince = 0;
  private readonly bornAt = performance.now();
  /** Load progress, 0..1 — drives `uBoost`. */
  private progress = 0;

  constructor(camera: THREE.PerspectiveCamera) {
    this.camera = camera;
    this.geometry = this.buildGeometry();
    this.material = this.buildMaterial();

    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.layers.set(layers.ENTIRE_SCENE);
    // Camera space: the tunnel's mouth is the lens itself.
    camera.add(this.mesh);

    this.resize();
  }

  private buildGeometry() {
    const n = STREAK_COUNT;
    /* Four vertices per streak — a quad the shader billboards into a fixed-width
     * ribbon from tail to head. `aEnd` runs the quad's length (0 tail → 1 head),
     * `aSide` its width (-1 → +1 across the two long edges). */
    const V = 4;
    const positions = new Float32Array(n * V * 3);
    const seed = new Float32Array(n * V);
    const speed = new Float32Array(n * V);
    const radius = new Float32Array(n * V);
    const angle = new Float32Array(n * V);
    const end = new Float32Array(n * V);
    const side = new Float32Array(n * V);
    const indices = new Uint16Array(n * 6);

    for (let i = 0; i < n; i++) {
      const s = Math.random();
      const sp = 0.5 + 0.9 * Math.random();
      /* `sqrt` spreads the streaks evenly over the disc. Sampling the radius
       * uniformly instead crowds them onto the axis, which is precisely where
       * perspective already piles them up — the tunnel wall goes bald. */
      const r = 0.35 + RADIUS * Math.sqrt(Math.random());
      const a = Math.random() * Math.PI * 2;

      for (let v = 0; v < V; v++) {
        const k = i * V + v;
        // Real positions come from the shader; this only reserves the buffer.
        positions[k * 3] = 0;
        positions[k * 3 + 1] = 0;
        positions[k * 3 + 2] = 0;
        seed[k] = s;
        speed[k] = sp;
        radius[k] = r;
        angle[k] = a;
        end[k] = v < 2 ? 0 : 1; // v0,v1 = tail; v2,v3 = head
        side[k] = v % 2 === 0 ? -1 : 1; // even = left edge, odd = right edge
      }

      // Two triangles over the four corners: (tail-, tail+, head-) + (head-, tail+, head+).
      const base = i * V;
      const t = i * 6;
      indices[t] = base;
      indices[t + 1] = base + 1;
      indices[t + 2] = base + 2;
      indices[t + 3] = base + 2;
      indices[t + 4] = base + 1;
      indices[t + 5] = base + 3;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setIndex(new THREE.BufferAttribute(indices, 1));
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
    geometry.setAttribute("aSpeed", new THREE.BufferAttribute(speed, 1));
    geometry.setAttribute("aRadius", new THREE.BufferAttribute(radius, 1));
    geometry.setAttribute("aAngle", new THREE.BufferAttribute(angle, 1));
    geometry.setAttribute("aEnd", new THREE.BufferAttribute(end, 1));
    geometry.setAttribute("aSide", new THREE.BufferAttribute(side, 1));
    return geometry;
  }

  private buildMaterial() {
    return new THREE.ShaderMaterial({
      uniforms: {
        iTime: { value: 0 },
        uOpacity: { value: 0 },
        /** Load progress: the tunnel winds up as the percentage climbs. */
        uBoost: { value: 0 },
        /** The break, on destroy: streaks stretch out as the field fades. */
        uSurge: { value: 0 },
        /** Aspect correction, so a wide viewport's corners still fill. */
        uSpread: { value: 1 },
        /** Streak body width in CSS px — the quad's clip-space edge offset. */
        uWidth: { value: STREAK_WIDTH },
        /** Viewport in CSS px, so the pixel width is device-ratio independent. */
        uResolution: {
          value: new THREE.Vector2(window.innerWidth, window.innerHeight),
        },
        /* `accent200` is so near white that additive heads read as silver.
         * Sitting the ramp lower keeps the streaks unmistakably blue, and the
         * pink minority reads as heat — the same scarcity rule the scene keeps. */
        uHead: { value: color("accent300") },
        uTail: { value: color("accent700") },
        uPink: { value: color("signalGlow") },
      },
      vertexShader: /* glsl */ `
        attribute float aSeed; attribute float aSpeed; attribute float aRadius;
        attribute float aAngle; attribute float aEnd; attribute float aSide;
        uniform float iTime; uniform float uBoost; uniform float uSurge;
        uniform float uSpread; uniform float uWidth; uniform vec2 uResolution;
        varying float vEnd; varying float vB; varying float vSeed; varying float vSide;

        void main() {
          // Wrapping lifecycle: 0 at the far end of the tunnel, 1 at the lens.
          float rate = 0.13 + 0.30 * uBoost + 0.55 * uSurge;
          float life = fract(iTime * aSpeed * rate + aSeed);

          /* Squared, so each streak accelerates along its own run. Held linear,
           * perspective foreshortening eats most of the sense of speed until the
           * last instant and the field reads as a slow drift. */
          float e = life * life;
          float z = -mix(${FAR.toFixed(1)}, ${NEAR.toFixed(1)}, e);

          // Streaks stretch with the wind-up, and again when the warp breaks.
          float len = (1.5 + 11.0 * e) * (0.3 + 0.9 * uBoost) * (1.0 + 3.5 * uSurge);

          // A slow roll of the whole tunnel — the lens is turning as it travels.
          float a = aAngle + iTime * 0.06;
          float r = aRadius * uSpread;
          vec2 xy = vec2(cos(a) * r, sin(a) * r);

          // Head sits at z; the tail lies that much further down the tunnel.
          vec4 headClip = projectionMatrix * modelViewMatrix * vec4(xy, z, 1.0);
          vec4 tailClip = projectionMatrix * modelViewMatrix * vec4(xy, z - len, 1.0);
          // This vertex is one of the quad's four corners: pick its end, then
          // push it sideways off the streak's screen direction by a fixed width.
          vec4 clip = mix(tailClip, headClip, aEnd);

          vec2 headNDC = headClip.xy / headClip.w;
          vec2 tailNDC = tailClip.xy / tailClip.w;
          // Screen direction in pixels; guard the degenerate near-axis streak.
          vec2 d = (headNDC - tailNDC) * uResolution;
          vec2 dir = length(d) > 1e-4 ? normalize(d) : vec2(0.0, 1.0);
          vec2 normal = vec2(-dir.y, dir.x);
          // Half-width in pixels → NDC (× 2 / resolution) → clip (× w).
          vec2 offset = normal * (aSide * uWidth * 0.5) / uResolution * 2.0;
          clip.xy += offset * clip.w;

          vEnd = aEnd;
          vSeed = aSeed;
          vSide = aSide;
          // Fade in out of the dark, then burn brightest as the streak arrives.
          vB = smoothstep(0.0, 0.18, life) * (0.2 + 0.8 * e);

          gl_Position = clip;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uOpacity; uniform vec3 uHead; uniform vec3 uTail; uniform vec3 uPink;
        varying float vEnd; varying float vB; varying float vSeed; varying float vSide;

        void main() {
          // vEnd interpolates 0 (tail) → 1 (head) along the streak.
          vec3 col = mix(uTail, uHead, vEnd);
          // ~6% of streaks burn pink, and only at the head. Scarce and hot.
          col = mix(col, uPink, step(0.94, vSeed) * pow(vEnd, 2.0));
          // Soft round body across the width (vSide: -1 → +1), and a falloff down
          // the tail, so each streak reads as a comet rather than a lone head.
          float across = 1.0 - abs(vSide);
          across *= across;
          float alpha = pow(vEnd, 1.5) * vB * across;
          gl_FragColor = vec4(col, alpha * uOpacity);
        }`,
      blending: THREE.AdditiveBlending,
      // Quads, so both windings must draw — the streaks have no "back".
      side: THREE.DoubleSide,
      depthTest: false,
      transparent: true,
    });
  }

  resize() {
    // Wide viewports reach further sideways than the 1:1 tunnel wall covers.
    const aspect = window.innerWidth / window.innerHeight;
    this.material.uniforms.uSpread.value = Math.max(1, aspect);
    // Streak width is measured against the live viewport, in CSS pixels.
    this.material.uniforms.uResolution.value.set(
      window.innerWidth,
      window.innerHeight,
    );
  }

  private startLoading() {
    this.state.started = true;

    Tween.to(0, 1, {
      duration: LOAD_DURATION,
      renderDelay: 10,
      ease: Ease.Line,
      onChange: ({ value }) => {
        this.progress = value;
        const percent = Math.min(100, Math.round(value * 100));
        document.dispatchEvent(
          new CustomEvent(events.LOADING, { detail: { percent } }),
        );
      },
      onComplete: () => {
        this.progress = 1;
        document.dispatchEvent(
          new CustomEvent(events.LOADING, { detail: { percent: 100 } }),
        );
      },
    });
  }

  private dispose() {
    this.camera.remove(this.mesh);
    this.geometry.dispose();
    this.material.dispose();
    this.state.alive = false;
    document.dispatchEvent(new CustomEvent(events.LOADER_DESTROY));
  }

  render({ destroy = false }: WarpRenderProps = {}) {
    if (!this.state.alive) return;

    const now = performance.now();
    const u = this.material.uniforms;
    u.iTime.value = now / 1000;
    u.uBoost.value = this.progress;

    if (destroy && !this.dying) {
      this.dying = true;
      this.dyingSince = now;
    }

    if (this.dying) {
      const t = Math.min(1, (now - this.dyingSince) / FADE_OUT);
      /* The break. The surge leads the fade — cubed opacity holds the field on
       * screen through the first half of the stretch, so the jump is *seen*
       * rather than dissolved away the instant it starts. */
      u.uSurge.value = t;
      u.uOpacity.value = Math.pow(1 - t, 3);
      if (t >= 1) this.dispose();
      return;
    }

    // Ease in over the first 500ms so the field doesn't pop.
    u.uOpacity.value = Math.min(1, (now - this.bornAt) / 500);

    if (!this.state.started) this.startLoading();
  }
}

export default Warp;
