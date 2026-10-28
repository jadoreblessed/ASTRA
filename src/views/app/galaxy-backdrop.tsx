"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

import { subscribeToTicker } from "@/lib/animation/ticker";
import {
  byTier,
  clampedPixelRatio,
  deviceTier,
  frameBudgetMs,
  prefersReducedMotion,
} from "@/lib/scene/device";

/**
 * The app's backdrop — the hero's galaxy, as a quiet standalone scene.
 *
 * The landing's scene is a choreography bound to its slides and preloader; the
 * app wants only the galaxy. So this is its own small Three.js scene: a tilted
 * three-arm spiral of additive motes in the hero palette (white-lilac core, blue
 * arms, the rare pink speck), turning with differential rotation — the core
 * faster than the rim — over a faint starfield, leaning a little toward the
 * pointer. It draws on the shared ticker; reduced motion settles to one frame.
 */

const RADIUS = 11;
const ARMS = 3;
const SPIN = 0.55;

const CORE = new THREE.Color("#f4ecff");
const MID = new THREE.Color("#9fb8ff");
const RIM = new THREE.Color("#2340b8");
const PINK = new THREE.Color("#ff8fc4");

const buildGalaxy = (count: number): THREE.Points => {
  const position = new Float32Array(count * 3);
  const color = new Float32Array(count * 3);
  const size = new Float32Array(count);
  const seed = new Float32Array(count);
  const c = new THREE.Color();

  for (let i = 0; i < count; i++) {
    const r = RADIUS * Math.pow(Math.random(), 1.15);
    const arm = ((i % ARMS) / ARMS) * Math.PI * 2;
    const angle = arm + r * SPIN;
    const spread = 0.32 + r * 0.3;
    const jitter = () => Math.pow(Math.random(), 2.6) * (Math.random() < 0.5 ? -1 : 1) * spread;
    position[i * 3] = Math.cos(angle) * r + jitter();
    position[i * 3 + 1] = (Math.random() - 0.5) * 0.7 * (1 - r / RADIUS) + jitter() * 0.1;
    position[i * 3 + 2] = Math.sin(angle) * r + jitter();

    const t = r / RADIUS;
    if (Math.random() < 0.012) c.copy(PINK);
    else if (t < 0.35) c.copy(CORE).lerp(MID, t / 0.35);
    else c.copy(MID).lerp(RIM, (t - 0.35) / 0.65);
    color[i * 3] = c.r;
    color[i * 3 + 1] = c.g;
    color[i * 3 + 2] = c.b;

    size[i] = 0.6 + Math.random() * Math.random() * 2.6;
    seed[i] = Math.random();
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(position, 3));
  geometry.setAttribute("aColor", new THREE.BufferAttribute(color, 3));
  geometry.setAttribute("aSize", new THREE.BufferAttribute(size, 1));
  geometry.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));

  const material = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uScale: { value: 1 } },
    vertexShader: /* glsl */ `
      attribute vec3 aColor; attribute float aSize; attribute float aSeed;
      uniform float uTime; uniform float uScale;
      varying vec3 vColor; varying float vAlpha;
      void main() {
        // Differential rotation: the core turns faster than the arms.
        float r = length(position.xz);
        float a = uTime * (0.07 / (0.55 + r * 0.16));
        float cs = cos(a), sn = sin(a);
        vec3 p = vec3(cs * position.x - sn * position.z, position.y, sn * position.x + cs * position.z);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = clamp(aSize * uScale * (26.0 / -mv.z), 0.5, 6.0);
        float twinkle = 0.72 + 0.28 * sin(uTime * 1.3 + aSeed * 40.0);
        vColor = aColor;
        // A softer core, so copy laid over it stays readable.
        float core = 0.4 + 0.6 * smoothstep(0.0, 2.4, r);
        vAlpha = twinkle * core * mix(0.95, 0.55, clamp(r / ${RADIUS.toFixed(1)}, 0.0, 1.0));
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vColor; varying float vAlpha;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        if (d > 0.5) discard;
        gl_FragColor = vec4(vColor, vAlpha * pow(1.0 - d * 2.0, 1.8));
      }`,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    transparent: true,
  });

  return new THREE.Points(geometry, material);
};

const buildStars = (count: number): THREE.Points => {
  const position = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const r = 40 + Math.random() * 50;
    const u = Math.random() * 2 - 1;
    const th = Math.random() * Math.PI * 2;
    const ring = Math.sqrt(1 - u * u);
    position[i * 3] = Math.cos(th) * ring * r;
    position[i * 3 + 1] = u * r;
    position[i * 3 + 2] = Math.sin(th) * ring * r;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(position, 3));
  const material = new THREE.PointsMaterial({
    color: new THREE.Color("#c8d6ff"),
    size: 0.16,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
  });
  return new THREE.Points(geometry, material);
};

export const GalaxyBackdrop = () => {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const tier = deviceTier();
    const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false, powerPreference: "high-performance" });
    renderer.setClearColor("#02040d", 1);
    renderer.setPixelRatio(clampedPixelRatio(tier));
    host.appendChild(renderer.domElement);
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.display = "block";

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(52, 1, 0.1, 200);
    const base = new THREE.Vector3(0, 11, 7.4);
    camera.position.copy(base);
    camera.lookAt(0, -0.8, 0);

    const galaxy = buildGalaxy(byTier(tier, { desktop: 70000, tablet: 42000, mobile: 22000 }));
    galaxy.rotation.z = 0.2;
    const stars = buildStars(byTier(tier, { desktop: 3200, tablet: 2000, mobile: 1200 }));
    scene.add(stars, galaxy);

    const galaxyMaterial = galaxy.material as THREE.ShaderMaterial;

    const resize = () => {
      const w = host.clientWidth || window.innerWidth;
      const h = host.clientHeight || window.innerHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      /* Phones are tall: pull back so the whole disc stays in frame. */
      camera.zoom = w / h < 0.8 ? 0.62 : 1;
      camera.updateProjectionMatrix();
      /* Wide screens: the disc sits to the right, clear of the copy column. */
      galaxy.position.set(w / h > 1.2 ? 3 : 0, -1.4, w / h > 1.2 ? -1 : 0);
      galaxyMaterial.uniforms.uScale.value = renderer.getPixelRatio() * (h / 800);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(host);

    /* Pointer lean — a few tenths of a unit, eased every frame. */
    const target = new THREE.Vector2();
    const lean = new THREE.Vector2();
    const onMove = (e: PointerEvent) => {
      target.set(e.clientX / window.innerWidth - 0.5, e.clientY / window.innerHeight - 0.5);
    };
    window.addEventListener("pointermove", onMove);

    const still = prefersReducedMotion();
    const start = performance.now();
    let frames = 0;

    const draw = (now: number) => {
      const t = (now - start) / 1000;
      galaxyMaterial.uniforms.uTime.value = t + 12;
      lean.lerp(target, 0.04);
      camera.position.set(base.x + lean.x * 1.6, base.y - lean.y * 0.9, base.z);
      camera.lookAt(0, -0.8, 0);
      stars.rotation.y = t * 0.004;
      renderer.render(scene, camera);
      frames++;
    };

    const unsubscribe = subscribeToTicker(
      (now) => {
        if (still && frames > 2) return;
        if (document.hidden) return;
        draw(now);
      },
      () => frameBudgetMs(tier),
    );

    return () => {
      unsubscribe();
      observer.disconnect();
      window.removeEventListener("pointermove", onMove);
      galaxy.geometry.dispose();
      galaxyMaterial.dispose();
      stars.geometry.dispose();
      (stars.material as THREE.Material).dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0">
      <div ref={hostRef} className="absolute inset-0" />
      {/* Readability: one flat dim over the whole galaxy. */}
      <div className="absolute inset-0" style={{ background: "rgb(2 4 13 / 0.45)" }} />
    </div>
  );
};
