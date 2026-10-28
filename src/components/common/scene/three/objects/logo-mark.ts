import * as THREE from "three";

import { layers } from "../constants";
import { deviceTier, viewScale } from "@/lib/scene/device";
import { getMouseCoords, hasPointer } from "@/lib/scene/mouse";
import { Lerp } from "@/lib/scene/easing";
import { color } from "@/lib/scene/palette";
import { useSceneConfig, type LogoConfig } from "@/lib/scene/scene-config";
import { PLANET_GLSL } from "@/lib/planet";

/**
 * ASTRA's planet, assembled from particles — inside the main scene (not a separate
 * canvas), riding a fixed distance in front of the camera so its size is constant
 * while the dive flies right into it. It shares the one starfield, camera and
 * bloom: one continuous scene.
 *
 * The token is a Jupiter in the site's colours (`lib/planet`): motes on a globe,
 * each wearing its band's flat colour, the belts turning at their own speeds so
 * the pink storm drifts against its neighbours. A thin haze hangs off the limb,
 * a ring of motes circles the equator — three flat bands with a dark gap between
 * them, the far side slipping behind the globe — and two moons ride beyond it.
 * The whole system leans toward the viewer so the ring reads as an ellipse.
 * Motes fly IN from the frame edges to build it — every market pulled into one.
 * `aTri` tags each mote: 0 globe, 1 haze, 2 ring, 3–4 the moons.
 */

/** Globe radius as a share of `markSize` — smaller now the ring needs the room. */
const PLANET = 0.32;
/** The axial tilt, radians (the brand mark leans the same way). */
const TILT = -0.28;
/** How far the system leans toward the viewer, radians — opens the ring up. */
const LEAN = 0.36;
const MOONS = 2;
/** Motes per moon, before the tier scale. */
const MOON_COUNT = 90;
/** Share of the motes in the haze off the limb. */
const HAZE_SHARE = 0.05;
/** Share of the motes in the ring. */
const RING_SHARE = 0.3;
/** The ring's bands, in globe radii: inner faint band, the bright one, the gap, the outer. */
const RING_BANDS = [
  [1.38, 1.56],
  [1.56, 1.84],
  [1.92, 2.18],
] as const;

const MAX_COUNT = 24000;
/** How far in front of the camera the mark rides (fixes its on-screen size). */
const FRONT_DISTANCE = 10;
/** Chaotic-drift background motes, per tier. */
const BG_COUNT = { desktop: 1400, tablet: 800, mobile: 240 } as const;

/**
 * Tier multiplier on the foreground mark's particle count. The mark holds a fixed
 * on-screen size (`FRONT_DISTANCE`), so the same count packs into a much smaller area
 * on a phone — the additive sprites pile into a solid white blob instead of reading as
 * the mark's outline. Mobile is cut hard so the shape stays legible. ADR-0043.
 */
const COUNT_SCALE = { desktop: 1, tablet: 0.7, mobile: 0.38 } as const;

/**
 * Tier multiplier on the mark's point size. On a phone the mark fills a large
 * fraction of a narrow viewport, so full-size sprites read as a thick, chunky
 * outline; halving them keeps the twin-triangle line fine and crisp. Applied on top
 * of the dev-tunable `pointSize` and the height-based `viewScale`.
 */
const MARK_SIZE_SCALE = { desktop: 1, tablet: 1, mobile: 0.5 } as const;

class LogoMark {
  private readonly group: THREE.Group;
  private readonly points: THREE.Points;
  private material: THREE.ShaderMaterial;
  private geometry: THREE.BufferGeometry;
  private readonly bgPoints: THREE.Points;
  private readonly bgMaterial: THREE.ShaderMaterial;
  /** Per-tier point-size factor, resolved once (a device never changes tier). */
  private readonly markSizeScale = MARK_SIZE_SCALE[deviceTier()];
  private readonly forward = new THREE.Vector3();
  private rotX = 0;
  private rotY = 0;

  constructor(scene: THREE.Scene) {
    this.material = this.buildMaterial();
    this.geometry = this.buildGeometry(this.config());
    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
    this.points.layers.set(layers.ENTIRE_SCENE);

    const bg = this.buildBackground();
    this.bgMaterial = bg.material;
    this.bgPoints = new THREE.Points(bg.geometry, bg.material);
    this.bgPoints.frustumCulled = false;
    this.bgPoints.layers.set(layers.ENTIRE_SCENE);

    this.group = new THREE.Group();
    this.group.add(this.bgPoints);
    this.group.add(this.points);
    scene.add(this.group);
  }

  private config(): LogoConfig {
    return useSceneConfig.getState().logo;
  }

  /* ---------------------------------------------------------------- geometry */

  private buildGeometry(c: LogoConfig): THREE.BufferGeometry {
    const n = Math.min(
      MAX_COUNT,
      Math.max(200, Math.round(c.count * COUNT_SCALE[deviceTier()])),
    );
    const start = new Float32Array(n * 3);
    const target = new Float32Array(n * 3);
    const seed = new Float32Array(n);
    const size = new Float32Array(n);
    const tri = new Float32Array(n);

    for (let i = 0; i < n; i++) {
      // Start out at the edges of the frame — a wide ring in the billboard's own
      // (screen-facing) plane — and fly IN to the mark. `spread*` is that radius.
      const r = c.spreadMin + Math.random() * c.spreadSpan;
      const theta = Math.random() * Math.PI * 2;
      start[i * 3] = Math.cos(theta) * r;
      start[i * 3 + 1] = Math.sin(theta) * r;
      start[i * 3 + 2] = (Math.random() - 0.5) * 3;
      seed[i] = Math.random();
      size[i] = 0.5 + Math.random() * Math.random() * 1.7;
    }

    // Targets: the moons' motes last, then the ring, the haze; the globe takes the rest.
    const R = c.markSize * PLANET;
    const moonEach = Math.max(40, Math.round(MOON_COUNT * COUNT_SCALE[deviceTier()]));
    const moonFrom = n - moonEach * MOONS;
    const ringFrom = moonFrom - Math.round(n * RING_SHARE);
    const hazeFrom = ringFrom - Math.round(n * HAZE_SHARE);
    for (let i = 0; i < n; i++) {
      // A uniform point on the unit sphere.
      const y = Math.random() * 2 - 1;
      const a = Math.random() * Math.PI * 2;
      const ring = Math.sqrt(1 - y * y);
      let rad: number;
      if (i >= moonFrom) {
        const k = Math.floor((i - moonFrom) / moonEach);
        tri[i] = 3 + k;
        rad = (0.14 + k * 0.04) * Math.cbrt(Math.random()) * R * 0.32;
      } else if (i >= ringFrom) {
        // A flat annulus in the equatorial plane; the bright band gets the most.
        tri[i] = 2;
        const pick = Math.random();
        const [lo, hi] = RING_BANDS[pick < 0.2 ? 0 : pick < 0.68 ? 1 : 2];
        const r = R * (lo + Math.random() * (hi - lo));
        target[i * 3] = Math.cos(a) * r;
        target[i * 3 + 1] = (Math.random() - 0.5) * R * 0.025;
        target[i * 3 + 2] = Math.sin(a) * r;
        continue;
      } else if (i >= hazeFrom) {
        tri[i] = 1;
        rad = R * (1.03 + Math.random() * 0.14);
      } else {
        tri[i] = 0;
        rad = R * (0.99 + Math.random() * 0.02);
      }
      target[i * 3] = Math.cos(a) * ring * rad;
      target[i * 3 + 1] = y * rad;
      target[i * 3 + 2] = Math.sin(a) * ring * rad;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(start, 3));
    geometry.setAttribute("aTarget", new THREE.BufferAttribute(target, 3));
    geometry.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
    geometry.setAttribute("aSize", new THREE.BufferAttribute(size, 1));
    geometry.setAttribute("aTri", new THREE.BufferAttribute(tri, 1));
    return geometry;
  }

  rebuild(): void {
    const geometry = this.buildGeometry(this.config());
    this.points.geometry = geometry;
    this.geometry.dispose();
    this.geometry = geometry;
  }

  /* --------------------------------------------------------------- materials */

  private buildMaterial(): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
      uniforms: {
        uProgress: { value: 0 },
        uTime: { value: 0 },
        uAlpha: { value: 0 },
        uPointScale: { value: 1 },
        uViewScale: { value: 1 },
        uR: { value: 4 },
      },
      vertexShader: /* glsl */ `
        attribute vec3 aTarget; attribute float aSeed; attribute float aSize; attribute float aTri;
        uniform float uProgress; uniform float uTime; uniform float uAlpha; uniform float uPointScale; uniform float uViewScale;
        uniform float uR;
        varying vec3 vCol; varying float vB;
        #define TAU 6.2831853
        ${PLANET_GLSL}
        void main() {
          float e = smoothstep(0.0, 1.0, clamp(uProgress * 1.35 - aSeed * 0.35, 0.0, 1.0));

          vec3 tgt;
          vec3 col;
          float glow = 1.0;
          if (aTri < 1.5) {
            // Globe and haze: spin about the axis, each band at its own speed.
            float rad = length(aTarget);
            vec3 d = aTarget / rad;
            float lon = atan(d.x, d.z);
            float b = d.y + 0.035 * sin(lon * 3.0 + d.y * 9.0) + 0.02 * sin(lon * 7.0 - d.y * 5.0);
            float L = lon + uTime * bandSpeed(b);
            float cl = sqrt(max(0.0, 1.0 - d.y * d.y));
            tgt = vec3(cl * sin(L), d.y, cl * cos(L)) * rad;
            if (aTri < 0.5) {
              col = bandColor(b);
              float dl = atan(sin(lon - SPOT_LON), cos(lon - SPOT_LON));
              float sy = (d.y - SPOT_LAT) / SPOT_H;
              if ((dl / SPOT_W) * (dl / SPOT_W) + sy * sy < 1.0) col = SPOT_COL;
              glow = 0.55;
            } else {
              col = vec3(0.784, 0.839, 1.0);
              glow = 0.09 + 0.05 * sin(uTime * 1.3 + aSeed * 20.0);
            }
          } else if (aTri < 2.5) {
            // The ring: turns slowly about the axis, one flat colour per band.
            float rr = length(aTarget.xz) / uR;
            float a = atan(aTarget.z, aTarget.x) + uTime * (0.16 / rr);
            tgt = vec3(cos(a) * rr * uR, aTarget.y, sin(a) * rr * uR);
            if (rr < 1.56) { col = vec3(0.427, 0.545, 1.0); glow = 0.16; }
            else if (rr < 1.88) { col = vec3(0.910, 0.929, 1.0); glow = 0.3; }
            else { col = vec3(0.725, 0.651, 1.0); glow = 0.22; }
          } else {
            // A moon: its own little ball of motes, out past the ring.
            float k = aTri - 3.0;
            float orbit = uR * (2.42 + k * 0.3);
            float th = uTime * (0.3 - k * 0.08) + k * 2.6;
            tgt = vec3(cos(th) * orbit, 0.0, sin(th) * orbit) + aTarget;
            col = vec3(0.875, 0.902, 1.0);
            glow = 0.2;
          }

          // Lean the system toward the viewer (opens the ring into an ellipse),
          // then the axial tilt in the screen plane.
          float cl2 = cos(${LEAN.toFixed(3)});
          float sl2 = sin(${LEAN.toFixed(3)});
          tgt.yz = mat2(cl2, sl2, -sl2, cl2) * tgt.yz;
          float ct = cos(${TILT.toFixed(3)});
          float st = sin(${TILT.toFixed(3)});
          tgt.xy = mat2(ct, st, -st, ct) * tgt.xy;

          // What the globe hides: its own far side, and ring or moon behind it.
          float z = tgt.z / uR;
          float vis = 1.0;
          if (aTri < 0.5) {
            vis = mix(1.0, smoothstep(-0.12, 0.15, z), e);
            glow *= 0.12 + 0.88 * clamp(z, 0.0, 1.0);
          } else if (aTri < 1.5) {
            vis = mix(1.0, smoothstep(-0.7, 0.0, z), e);
          } else if (tgt.z < 0.0 && length(tgt.xy) < uR * 1.02) {
            vis = 1.0 - e;
          }

          vec3 p = mix(position, tgt, e);

          // A faint shimmer once formed, and a wider drift while flying in.
          p.x += sin(uTime * 0.9 + aSeed * TAU) * 0.025 * e;
          p.y += cos(uTime * 0.8 + aSeed * TAU * 1.3) * 0.025 * e;
          float drift = (1.0 - e) * 0.5;
          p.x += sin(uTime * 0.6 + aSeed * TAU) * drift;
          p.y += cos(uTime * 0.55 + aSeed * TAU) * drift;

          vCol = col;
          float tw = 0.8 + 0.2 * sin(uTime * 1.6 + aSeed * TAU);
          vB = aSize * tw * uAlpha * glow * vis;

          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = clamp(aSize * uPointScale * uViewScale * (300.0 / -mv.z), 0.4, 9.0);
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

  /** A loose cloud of motes drifting chaotically behind the mark. */
  private buildBackground(): {
    geometry: THREE.BufferGeometry;
    material: THREE.ShaderMaterial;
  } {
    const n = BG_COUNT[deviceTier()];
    const pos = new Float32Array(n * 3);
    const seed = new Float32Array(n);
    const size = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 90;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 90;
      // Behind the mark (further from the camera, which the group faces).
      pos[i * 3 + 2] = -6 - Math.random() * 46;
      seed[i] = Math.random();
      size[i] = 0.6 + Math.random() * 1.7;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geometry.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
    geometry.setAttribute("aSize", new THREE.BufferAttribute(size, 1));

    const material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uAlpha: { value: 0 },
        uSpeed: { value: 1 },
        uSize: { value: 1 },
        uBright: { value: 1 },
        uViewScale: { value: 1 },
        uColor: { value: color("accent400") },
      },
      vertexShader: /* glsl */ `
        attribute float aSeed; attribute float aSize;
        uniform float uTime; uniform float uAlpha; uniform float uSpeed; uniform float uSize; uniform float uBright; uniform float uViewScale;
        varying float vB;
        void main() {
          float t = uTime * uSpeed;
          vec3 p = position;
          p.x += sin(t * 0.13 + aSeed * 40.0) * 4.0 + cos(t * 0.05 + aSeed * 11.0) * 3.0;
          p.y += cos(t * 0.11 + aSeed * 27.0) * 4.0 + sin(t * 0.06 + aSeed * 7.0) * 3.0;
          p.z += sin(t * 0.09 + aSeed * 19.0) * 3.0;
          vB = (0.10 + 0.10 * sin(t * 0.5 + aSeed * 20.0)) * uAlpha * uBright;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = clamp((1.0 + aSeed * 2.5) * uSize * uViewScale * (200.0 / -mv.z), 0.8, 40.0);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor; varying float vB;
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

    return { geometry, material };
  }

  /* ------------------------------------------------------------------ frame */

  render({
    camera,
    assembly,
    alpha,
    time,
  }: {
    camera: THREE.Camera;
    assembly: number;
    alpha: number;
    time: number;
  }): void {
    const c = this.config();
    const vs = viewScale();
    const u = this.material.uniforms;
    u.uProgress.value = assembly;
    u.uAlpha.value = alpha * c.brightness;
    u.uTime.value = time;
    u.uPointScale.value = c.pointSize * this.markSizeScale;
    u.uViewScale.value = vs;
    u.uR.value = c.markSize * PLANET;
    // A tall screen has no width to spare: shrink the planet (not the drifting
    // background) so it clears the proofs set above it on a phone.
    this.points.scale.setScalar(Math.min(1, Math.max(0.62, (window.innerWidth / window.innerHeight) * 1.05)));

    const bu = this.bgMaterial.uniforms;
    bu.uTime.value = time;
    bu.uAlpha.value = alpha;
    bu.uSpeed.value = c.bgSpeed;
    bu.uSize.value = c.bgSize;
    bu.uBright.value = c.bgBright;
    bu.uViewScale.value = vs;
    (bu.uColor.value as THREE.Vector3).copy(color("accent400"));

    // Fixed distance in front of the camera, facing it, with a small cursor tilt.
    let mx = 0;
    let my = 0;
    if (hasPointer()) {
      const m = getMouseCoords().window;
      if (m.x !== null) mx = (m.x / window.innerWidth) * 2 - 1;
      if (m.y !== null) my = (m.y / window.innerHeight) * -2 + 1;
    }
    this.rotY = Lerp(this.rotY, mx * c.mouseStrength * 0.4, 0.08);
    this.rotX = Lerp(this.rotX, c.tilt * 0.3 + my * c.mouseStrength * 0.2, 0.08);

    this.forward.set(0, 0, -1).applyQuaternion(camera.quaternion);
    this.group.position
      .copy((camera as THREE.PerspectiveCamera).position)
      .addScaledVector(this.forward, FRONT_DISTANCE);
    this.group.quaternion.copy(camera.quaternion);
    this.group.rotateY(this.rotY);
    this.group.rotateX(this.rotX);
  }

  resize(): void {}

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
    this.bgPoints.geometry.dispose();
    this.bgMaterial.dispose();
  }
}

export default LogoMark;
