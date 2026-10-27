import * as THREE from "three";

import { color } from "@/lib/scene/palette";

/**
 * Composite pass: the rendered scene over a slow domain-warped background wash.
 *
 * Replaces the vendored `finalpass.ts`, which sampled `bloomTexture`,
 * `torusTexture` and `haloTexture`. Nothing in this project renders on the bloom
 * or torus layers any more, so those uniforms stayed `null` — and an unbound
 * `sampler2D` reads texture unit 0, which is whatever was last bound. That is
 * what made the hero flicker frame to frame. This pass samples only `tDiffuse`.
 *
 * The wash is the faint green haze in the corners; it is generated, not sampled.
 */
export const FinalPass: THREE.ShaderMaterialParameters & {
  uniforms: {
    iTime: { value: number };
    tDiffuse: { value: THREE.Texture | null };
    iCornerLow: { value: THREE.Vector3 };
    iCornerHigh: { value: THREE.Vector3 };
    uSpread: { value: number };
    uIntensity: { value: number };
  };
} = {
  uniforms: {
    iTime: { value: 0 },
    tDiffuse: { value: null },
    iCornerLow: { value: color("accent900") },
    iCornerHigh: { value: color("accent700") },
    /** Lower = the flames reach further in from the corners. */
    uSpread: { value: 0.28 },
    /** Overall brightness of the wash. */
    uIntensity: { value: 2.6 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform float iTime;
    uniform sampler2D tDiffuse;
    uniform vec3 iCornerLow;
    uniform vec3 iCornerHigh;
    uniform float uSpread;
    uniform float uIntensity;
    varying vec2 vUv;

    vec3 warp3d(vec3 pos, float t) {
      float curv = .8, a = 1.9, b = 0.7;
      pos *= 2.;
      pos.x += curv * sin(t + a * pos.y) + t * b;
      pos.y += curv * cos(t + a * pos.x);
      pos.y += curv * sin(t + a * pos.z) + t * b;
      pos.z += curv * cos(t + a * pos.y);
      pos.z += curv * sin(t + a * pos.x) + t * b;
      pos.x += curv * cos(t + a * pos.z);
      return 0.5 + 0.5 * cos(pos.xyz + vec3(1, 2, 4));
    }

    void main() {
      vec2 uv = 2. * vUv - 1.;
      vec3 scene = texture2D(tDiffuse, vUv).xyz;

      /* Confine the wash to the corners. The lower the first smoothstep edge, the
       * further the flames reach toward the middle of the frame; squaring the
       * diagonal term once (instead of twice) keeps them from pinching shut.
       *
       * The mask is evaluated FIRST, and the warp is skipped where it is zero.
       * It used to be applied at the end, which meant warp3d — eighteen trig
       * calls — ran for every pixel on the screen and then most of those results
       * were multiplied by nothing. The wash only ever touches the corners, so the
       * great majority of a frame was paying full price for a value it threw away.
       * The output is bit-for-bit what it was; only the pixels that could never
       * show the wash exit early. */
      float mask = smoothstep(uSpread, 1., abs(uv.y))
                 * smoothstep(-.75, 1., -uv.y * uv.x);
      if (mask <= 0.0015) {
        gl_FragColor = vec4(scene, 1.);
        return;
      }

      vec3 w = pow(warp3d(vec3(uv.x, sin(uv.y), uv.y), iTime * 1.5), vec3(1.5));
      vec3 col = uIntensity * iCornerLow * w.x;
      col *= w.y;
      col += iCornerHigh * w.z * 1.35;
      col *= mask;

      gl_FragColor = vec4(col + scene, 1.);
    }`,
};
