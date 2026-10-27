import * as THREE from "three";

import { layers } from "../constants";
import { color, paletteGen } from "@/lib/scene/palette";
import { deviceTier, clampedPixelRatio } from "@/lib/scene/device";
import { useSceneConfig } from "@/lib/scene/scene-config";

/**
 * The scene — one point cloud that *is* all three forms.
 *
 * Ported from `getlayers-scenes/universe.html`, `plasma-burst.html` and
 * `maelstrom.html`, and recoloured from their steel-blue / electric-violet /
 * warm-white ramps to the project's deep-blue tokens with sparse pink accents.
 *
 * The three source scenes are separate pages, each with its own point system.
 * Here they are a single `THREE.Points`: every particle carries the parameters
 * of **all three forms**, and the vertex shader blends between them. Scroll
 * drives two weights — `uT1` (universe → burst) and `uT2` (burst → maelstrom) —
 * so a speck that was a star in the galaxy becomes a mote on a plasma filament
 * and then a grain in the accretion disc. Nothing crossfades; nothing is rebuilt
 * on the CPU, ever. It is the same matter, rearranged.
 *
 * The three forms, and what each one contributes per point:
 *
 * - **Universe** — twin galaxies painting themselves outward on ellipses. The
 *   original animates this on the CPU: a spawn ray sweeps around, points are
 *   lit 20 per frame, and each then drifts outward on its own ellipse while
 *   fading. That reduces exactly to a closed form — a point's spawn angle is
 *   just the sweep angle at its birth time — so the whole lifecycle lives in the
 *   vertex shader. Per point: a base radius, a fixed height, a life phase.
 * - **Burst** — a white-hot core erupting into hundreds of curling, snaking
 *   plasma filaments. The source draws them as `LineSegments`; a point cannot
 *   become a line, so they are rebuilt as points strung *along* the filaments —
 *   which this buffer was already shaped for, being arms × points-per-arm. Per
 *   point: its resting place on its filament, and how far along it that is.
 * - **Maelstrom** — logarithmic-spiral filaments winding into a dark core, with
 *   a lensing crescent burning on one side. Static geometry plus a rigid spin,
 *   so it rides in `position` itself: the untilted, unspun disc-plane point.
 *
 * Everything renders on `ENTIRE_SCENE`, staying out of any bloom pass — fine
 * points flicker badly through one (see [[decisions-log]] ADR-0019). Each of the
 * three sources had already reached the same conclusion and faked its glow in
 * the fragment shader: a sharp core inside a wide halo, accumulated into a real
 * bloom by additive blending. That shader is shared here, with its parameters
 * blended per form on the CPU.
 *
 * Unlike the scene objects this replaces, it **drives the shared camera** — see
 * `Controller`, which owns the flight path. The three forms are kept at their
 * original world scales (a galaxy ~7 units across, a column 15.5 tall, a disc 24
 * wide) and the camera travels between them, rather than each form being scaled
 * into one fixed frame. See [[decisions-log]] ADR-0028.
 */

/**
 * The disc's tilt, in radians — exported because the camera has to orbit the
 * maelstrom in the *disc's* frame rather than the world's (see `Controller`).
 * Orbiting about the world y axis on a disc raked this far just swings the camera
 * in and out of the disc plane, which is the flatness trap ADR-0033 records.
 */
export const MAEL_TILT = 0.95;

const CONFIG = {
  /* ---- universe: twin galaxies on expanding ellipses ---------------------- */

  /** Group orientation and scale, from the source scene's `group.rotation`. */
  uniEuler: [1, -1.2, 0.5] as const,
  /* Up from 1.2. The hero is the one form the viewer arrives on and sits with, and
   * a galaxy that fits inside the frame is a picture of a galaxy. */
  uniScale: 1.55,
  /** Ellipse flattening: x is squashed against z, so the arms read as ellipses. */
  uniEllipse: 0.8,
  /**
   * Seconds a point lives — spawn, drift outward, fade. The source counts this
   * in frames (opacity decays 0.003/frame from 1), which is ~5.5s of fade on top
   * of ~1.7s of ignition.
   */
  uniLife: 6,
  /**
   * How far apart the points ignite, in lifetimes. This is the entrance: at
   * t = 0 nothing is lit, and the galaxy paints itself into existence over
   * `uniSpawnSpread × uniLife` seconds. The source gets this for free by lighting
   * only 20 points per frame.
   *
   * It must be exactly 1, and that is not a taste call. Every point ages at the
   * same rate, so the spread of ignition *is* the spread of ages, forever. At any
   * value below 1 the whole cloud stays bunched into a band of the life cycle —
   * born together, drifting out together, dying together — and the galaxy renders
   * as a hollow ring pulsing outward rather than a disc. At exactly 1 the phases
   * cover the cycle uniformly, ages are uniform, and every radius from the core to
   * the rim is occupied at once: a steady-state disc, which is what the source's
   * 20-per-frame trickle converges to.
   */
  uniSpawnSpread: 1,
  /**
   * Seconds of galaxy already lived through on the first frame.
   *
   * The galaxy used to paint itself into existence: at `uUniTime = 0` nothing is
   * lit, and the arms sweep out over `uniSpawnSpread × uniLife` seconds. It is a
   * lovely entrance to watch and the wrong one to arrive on — the hero opens on a
   * near-empty frame and the disc is only whole once you have already started
   * reading. Priming the clock by one full lifetime lands the viewer *inside* a
   * galaxy that is already turning: every point has ignited (`born = 1 − phase`,
   * which is ≥ 0 for all phases), so the arms are drawn at their full length from
   * the very first frame. The entrance is now carried entirely by the camera's
   * dolly and the alpha envelope, which is where an entrance belongs — the matter
   * itself is simply already there.
   */
  uniPrime: 6,
  /** The spawn ray's sweep, rad/s. Sets the pitch of the arms. */
  uniOmega: 1.2,
  /** Outward drift: radius = r0 + v0·t − decay·t². The source's velocity decays. */
  uniV0: 0.72,
  uniDecay: 0.036,
  uniSize: 70,
  /**
   * Brightness, per form. See `BLOOM` — on a cloud this dense these are hue
   * controls, not intensity ones, and the source values (1.6 / 4 / 1) render
   * white. Each is set so a lone speck peaks around 0.2–0.45 and only crowding
   * carries it to white.
   *
   * The galaxy takes the hardest cut of the three: the source paints it with
   * 20k points and this cloud has six times that, because the maelstrom's spiral
   * needs the arms. Six times the density is six times the additive pile-up.
   */
  uniBright: 0.58,

  /* ---- burst: a white-hot core erupting into curling filaments ------------- */

  /**
   * Ported from `getlayers-scenes/plasma-burst.html`, and it is the one form that
   * had to change primitive to get here. The source draws its filaments as
   * `LineSegments`; this scene is a single `THREE.Points` whose every particle
   * carries all three forms (ADR-0028), and a point cannot become a line.
   *
   * So the burst is rebuilt as **points strung along the filaments** rather than
   * as the filaments themselves — which the geometry was already shaped for: the
   * buffer is arms × points-per-arm, laid out that way for the maelstrom's
   * spiral, and a filament is just another arm. At 230 points along a filament
   * the spacing is a fraction of a world unit and the line reads as continuous.
   *
   * The values below are the source's own, in the source's units. `burstScale`
   * blows the whole thing up at the end — the same discipline as the plume it
   * replaces: the curl, the bend and the sway are a tuned system, and scaling
   * them one at a time changes their ratios.
   */
  burstSpread: 3,
  /**
   * Curl and bend — and the first pass had both far too high.
   *
   * The reasoning then was that 520 filaments at the source's curl run too
   * straight and too parallel to tell apart, so snaking them harder would give
   * each one a silhouette. It does — and it also destroys the thing that makes the
   * reference read: **you have to be able to see the lines leave the centre.** At
   * 0.95 the strands writhe so much that within a fraction of their length they
   * have lost their radial direction, they cross each other constantly, and the
   * burst reads as turbulence rather than as an eruption.
   *
   * The crowding problem is real, but curl is the wrong instrument for it — the
   * right one is *how many filaments are lit at all* (see `fil` in the shader).
   * Fix the density there, and the curl can go back to the source's own restraint:
   * a strand that leaves the core along a ray, wanders a little, and keeps going.
   */
  burstCurl: 0.5,
  burstBend: 0.4,
  /** Radius the filaments start at — every one of them, which is what makes the
   *  core: 520 filaments converging on one point, piling up additively. */
  burstCoreStart: 0.06,
  /**
   * Brightness at the tip, against 1.15 at the root.
   *
   * The source's 0.14 is right for *lines*: a line always covers its pixels, so a
   * dim one is still a visible thread. It is wrong for points. Strung along a
   * filament, the tip points are also the sparsest ones on screen — they are
   * spread over the outside of a sphere — so fading them to a seventh of the root
   * makes them vanish outright, and what is left is the crowded middle: a fuzzy
   * ball with no strands in it. That was the first attempt at this form.
   *
   * Lit to 0.42 the filaments stay readable the whole way out, and the burst reads
   * as what it is — hundreds of curling threads — instead of as a dandelion clock.
   */
  burstTipFade: 0.42,
  /* The snaking sway. Halved from the source: its amplitude grows with distance
   * from the core, and on strands this long it was smearing the tips sideways
   * faster than the eye could follow them out. */
  burstSway: 0.08,
  burstSwaySpeed: 1.1,
  burstShimmer: 0.55,
  burstShimmerSpeed: 3,
  /**
   * World scale.
   *
   * Size this against the **typical** filament, not the longest one. `len` is
   * `spread × (0.28 + rand × rand × 1.15)`, and a product of two uniforms averages
   * 0.25 — so the median strand is about 0.57 spread-units long while the rare
   * boosted tendrils reach four times that. Framing the camera against the long
   * ones (the first attempt at this) puts the body of the burst — where all the
   * light actually is — in the middle of the frame as a small bright ball, with
   * the frame's whole outer half holding nothing but a handful of stragglers.
   *
   * At 7 the median filament runs about 8 world units, which fills the frame from
   * 15 units out, and the long tendrils simply leave it. Same lesson as the plume:
   * frame against the mass, not against the bounding box (ADR-0032).
   */
  burstScale: 7,
  /**
   * Sprite size — and this number is not on the scale you would guess.
   *
   * `gl_PointSize` is `size × resolution / 1000 / distance`. The burst sits 15
   * units out, so a size of 9 (which *sounds* like a thin thread) resolves to
   * **0.8 pixels** and clamps to the 1px floor. Every point on every filament
   * renders as a single pixel, and the form comes out as a fuzzy ball of dust with
   * no strands in it at all — twice, before this was spotted.
   *
   * 34 gives a ~3px sprite at this distance. The points are ~1.7px apart along a
   * filament, so a 3px thread overlaps itself into a continuous line — which is
   * the entire trick that lets a point cloud impersonate `LineSegments`.
   */
  burstSize: 44,
  burstBright: 0.85,

  /* ---- maelstrom: spiral filaments into a dark core ----------------------- */

  /**
   * Event horizon and outer reach. Nothing inside `rInner` — the core is black.
   *
   * Both doubled from the source's 3.2 / 24. The camera framing is unchanged, so
   * this is a straight doubling of the disc's apparent size: the arms now sweep
   * past the lens and out of frame instead of sitting in the middle distance, and
   * the event horizon is a hole you are falling toward rather than a detail.
   */
  maelRInner: 6.4,
  maelROuter: 48,
  /** Log-spiral winding. */
  maelTightness: 2.3,
  /**
   * Out-of-plane scatter — the disc's *volume*, and it was far too small.
   *
   * At 0.44 across a 48-unit disc the thing was a sheet: a spiral drawn on a
   * pane of glass. It read flat because it was flat, and no amount of camera work
   * fixes that — fly around a plane and you get a plane at another angle. Scatter
   * gives the arms something to be *inside*, and the near ones then crowd and
   * overlap the far ones as the camera swings, which is the only thing that makes
   * a point cloud read as a volume rather than as a picture of one.
   *
   * **But depth is bought against structure, and the exchange rate is brutal.**
   * The first attempt went to 2.4 with a 3.2 bulge and destroyed the scene: the
   * spiral dissolved into fluff and — worse — the out-of-plane scatter at the
   * inner edge grew larger than the event horizon itself, so the points spilled
   * across the hole and filled it in. A black hole with no hole. At 1.2 the hole
   * came back but the arms were still soft. 0.9 is where it settles: twice the old
   * volume, with the spiral and the horizon both still legible.
   */
  maelThickness: 0.9,
  /**
   * The inner bulge. A real accretion disc is not a sheet all the way in: matter
   * piles up and puffs out as it nears the horizon, which gives the core a swollen
   * torus of light to sit in and the black hole a *front* and a *back*.
   *
   * Kept modest for the reason above — this multiplies the scatter exactly where
   * the disc can least afford it, a few units from the edge of the hole.
   */
  maelBulge: 1,
  /**
   * Disc tilt, radians about x.
   *
   * Well down from the source's 1.65, which lays the disc so nearly flat that,
   * from a camera only a little above it, the whole spiral foreshortens into a
   * bright line. At 0.95 the camera looks about 23° down onto the disc: the arms
   * are still raking hard, but you can read them winding in, and the event horizon
   * is a round hole rather than a slot.
   */
  maelTilt: MAEL_TILT,
  maelSpin: 0.085,
  /* Down from 1, which drove a point's brightness all the way to zero at the
   * bottom of its cycle — half the disc was unlit at any instant. It reads as
   * scintillation either way, and at 0.75 the filaments stay drawn. */
  maelTwinkle: 0.75,
  /**
   * The lensing crescent: streams flare white-hot as they sweep through a fixed
   * angular sector. Off in the source (`coreGlow: 0`); lit here, in pink, because
   * it is the one place in the scene that earns a hot accent.
   */
  maelCrescent: 0.9,
  /** Where the crescent burns, radians. Lower-right of the disc. */
  maelCrescentAngle: -0.7,
  /**
   * Sprite size, well down from 110.
   *
   * `gl_PointSize` divides by view depth, so doubling the disc while leaving the
   * camera where it is halves the distance to the near arm — and every sprite on
   * it doubles. At 110 the near half of the disc drew 20px-plus sprites, most of
   * them pinned at the 24px clamp, and a spiral resolved out of blobs that large
   * is not a spiral: it is a smear. Cutting the size restores the *grain* the
   * disc is made of, which is the only thing that lets the filaments read as
   * filaments at this scale.
   */
  maelSize: 62,
  /**
   * The disc is twice as wide with the same point budget and the sprites are
   * smaller, so the same matter now covers four times the area at a fraction of
   * the fill. Brightness comes back up to pay for both.
   */
  maelBright: 0.56,

  /* ---- the morph itself --------------------------------------------------- */

  /**
   * How far apart the points cross over, in units of the transition. 0 would
   * snap the whole cloud at once, which reads as a dissolve; staggering by seed
   * makes the change sweep through the cloud as a wave of matter.
   */
  stagger: 0.55,
  /**
   * Mid-transition displacement and twist, peaking at the halfway point and zero
   * at both ends. Without them a morph is a straight lerp — every particle takes
   * the shortest path and the cloud visibly collapses through a flat plane on its
   * way over. The arc bows each path outward and the swirl shears the cloud about
   * the vertical axis, which is the axis all three forms already turn on.
   */
  /* The arcs are sized against the forms they bridge, not set to one value. The
   * galaxy is only ~7 units across, so 2.6 of outward bow nearly doubles its
   * extent, drops its density by an order of magnitude, and the transition dims
   * to a grey haze. The plume-to-disc leap spans 15 → 24 units and swallows an
   * arc twice as large without thinning. The swirls are shears, so they cost no
   * density at all and can be generous in both. */
  arc1: 1.1,
  swirl1: 2.2,
  /* The plume→disc leap now spans 46 → 48 units rather than 15 → 24, so the arc
   * grows with it: at 5 the bow was a fifth of the distance the matter travels and
   * the transition had flattened back into a lerp. */
  arc2: 9,
  swirl2: 3.4,
  /**
   * Extra brightness at the midpoint of a transition, falling to nothing at both
   * ends.
   *
   * Additive glow is a density effect: the arc and the swirl deliberately fling
   * the cloud apart on its way over, which thins it, which dims it — so the morph
   * sags in the middle exactly where it should be at its most dramatic. This pays
   * that back. It is compensation for a known cause, not a fudge factor.
   */
  midBoost: 0.7,
} as const;

/**
 * Filaments × points-per-filament, per tier.
 *
 * Structured as arms, not a flat count: the maelstrom's spiral only reads if its
 * points are laid along filaments, so the arm count is the real budget. ~120k
 * points at the top tier. Fill, not vertex count, is what kills these scenes —
 * see [[decisions-log]] ADR-0020 — and the sprites here clamp small.
 */
const COUNT = {
  desktop: { arms: 520, perArm: 230 },
  tablet: { arms: 340, perArm: 170 },
  // Mobile is fill-bound; ~12k points (down from ~22k) keeps the arms legible at
  // phone size while roughly halving the additive fragment load. ADR-0043.
  mobile: { arms: 150, perArm: 80 },
} as const;

/**
 * Fake-bloom parameters per form: a sharp core inside a soft halo, drawn per
 * point in the fragment shader. Lerped between forms on the CPU each frame.
 *
 * **These are retuned far down from the source scenes, and that is the whole
 * ballgame for colour.** Each source drives its points to a peak intensity of
 * 13, 200 and 1.1 respectively — deliberately, because each was composed against
 * a near-white ramp and *wants* to blow out. Under additive blending anything
 * over 1 clips to white, so on a scene this dense brightness is not a brightness
 * control at all: it is a hue control. Held at the source values the galaxy, the
 * plume and the disc all render as solid white plates with no blue left in them.
 * (`vortex.ts` reached the same conclusion before it was retired; the trap is
 * worth naming twice.)
 *
 * So every form here is tuned to a per-point peak of roughly 0.2–0.45. A lone
 * speck reads as blue; white is reserved for where the cloud actually crowds —
 * the galaxy's spine, the plume's tip, the crescent — which is where a blow-out
 * means something.
 *
 * `haloWidth` is 1 everywhere on purpose: it puts the halo's zero exactly on the
 * sprite's inscribed circle, so the glow fades out instead of being cut off at
 * the quad's edge. A wider halo is still lit at the rim and reads as a hard
 * square. Glow *radius* is set by point size, not by widening this past 1.
 */
interface Bloom {
  coreStrength: number;
  coreSize: number;
  coreSharp: number;
  haloAmount: number;
  haloWidth: number;
  haloFalloff: number;
}

const BLOOM: Record<"uni" | "burst" | "mael", Bloom> = {
  uni: {
    coreStrength: 1.5,
    coreSize: 0.5,
    coreSharp: 2.4,
    haloAmount: 0.6,
    haloWidth: 1,
    haloFalloff: 1.5,
  },
  /* The burst's points are strung *along* filaments, so they overlap their own
   * neighbours far more than a scattered cloud does. A hard core with a modest
   * halo is what keeps a filament reading as a bright thread with a glow around
   * it, rather than as a fat tube of haze with no line left inside it. */
  burst: {
    coreStrength: 1.7,
    coreSize: 0.34,
    coreSharp: 3,
    haloAmount: 0.3,
    haloWidth: 1,
    haloFalloff: 1.9,
  },
  /* The disc's glow is tightened along with its sprite size. Halved sprites with
   * the old soft core would only have traded one kind of blur for another: a
   * small sprite whose energy is spread across a wide, slowly-falling halo is
   * still a fuzzy dot. A harder core (`coreSharp` up, `coreSize` down) and a
   * halo that falls off faster put the light back in the middle of the point, so
   * the grain of the disc is sharp and only the *crowding* of the filaments
   * glows. */
  mael: {
    coreStrength: 1.35,
    coreSize: 0.4,
    coreSharp: 2.8,
    haloAmount: 0.38,
    haloWidth: 1,
    haloFalloff: 1.9,
  },
};

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

const lerpBloom = (a: Bloom, b: Bloom, t: number): Bloom => ({
  coreStrength: lerp(a.coreStrength, b.coreStrength, t),
  coreSize: lerp(a.coreSize, b.coreSize, t),
  coreSharp: lerp(a.coreSharp, b.coreSharp, t),
  haloAmount: lerp(a.haloAmount, b.haloAmount, t),
  haloWidth: lerp(a.haloWidth, b.haloWidth, t),
  haloFalloff: lerp(a.haloFalloff, b.haloFalloff, t),
});

/** Rotation matrix for a form's resting orientation, as a `mat3` uniform. */
const rotation = (x: number, y: number, z: number): THREE.Matrix3 =>
  new THREE.Matrix3().setFromMatrix4(
    new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(x, y, z)),
  );

export interface MorphRenderProps {
  /** 0..1 universe → plume. */
  t1?: number;
  /** 0..1 plume → maelstrom. */
  t2?: number;
  /** 0..1 entrance, armed once the hero is actually on screen. */
  appear?: number;
  /** Seconds since the entrance was armed — drives the universe's ignition. */
  uniTime?: number;
  /**
   * 0..1 progress *through* the roadmap slide, once the disc is the only form
   * left. The camera flies in and around the disc across this (see `Controller`),
   * and the disc heats up with it: the arms warm off the accent blue and the
   * lensing crescent widens and burns harder. It is the one colour move in the
   * scene, spent at the one moment the viewer is actually closing on something.
   */
  maelPhase?: number;
  /** 0..1 dissolve of the whole cloud as the logo mark takes over at Impact. */
  dissolve?: number;
  /** The cursor, as a body in the scene — see `POINTER` and `Controller`. */
  pointer?: {
    world: THREE.Vector3;
    axis: THREE.Vector3;
    radius: number;
    push: number;
    swirl: number;
    glow: number;
  };
}

class Morph {
  private readonly points: THREE.Points;
  private readonly material: THREE.ShaderMaterial;
  private readonly counts: { arms: number; perArm: number };
  /** Last palette generation whose colours are in the uniforms (live recolour). */
  private paletteSig = -1;

  /** Re-read every colour uniform from the (possibly panel-overridden) palette. */
  private applyColors() {
    const u = this.material.uniforms;
    u.uUniDeep.value.copy(color("accent500"));
    u.uUniMid.value.copy(color("accent400"));
    u.uUniBrightC.value.copy(color("accent200"));
    u.uBurstCore.value.copy(color("foreground"));
    u.uBurstInner.value.copy(color("accent200"));
    u.uBurstMid.value.copy(color("accent500"));
    u.uBurstOuter.value.copy(color("accent600"));
    u.uArm.value.copy(color("accent500"));
    u.uArmHot.value.copy(color("accent300"));
    u.uMaelCore.value.copy(color("accent700"));
    u.uPink.value.copy(color("signalGlow"));
  }

  constructor(scene: THREE.Scene) {
    const base = COUNT[deviceTier()];
    // Density scales the baked buffer; read at construction, so it takes effect
    // on the dev panel's "Apply" (which remounts the scene).
    const density = useSceneConfig.getState().vortex.density;
    this.counts = {
      arms: base.arms,
      perArm: Math.max(1, Math.round(base.perArm * density)),
    };

    this.material = this.buildMaterial();
    this.points = new THREE.Points(this.geometry(), this.material);
    this.points.frustumCulled = false; // every position is computed in the shader
    this.points.layers.set(layers.ENTIRE_SCENE);
    scene.add(this.points);

    /* `Canvas3d` sizes its surface before scene objects register their resize
     * callbacks, so the first `toResize` pass never reaches us. See ADR-0017. */
    this.resize();
  }

  /* ---------------------------------------------------------------- geometry */

  /**
   * One buffer. `position` holds the maelstrom's disc-plane point — it is the
   * only form whose geometry is static, so it rides in the attribute Three.js
   * demands anyway. Every other coordinate is derived in the vertex shader.
   */
  private geometry() {
    const { arms, perArm } = this.counts;
    const n = arms * perArm;

    const positions = new Float32Array(n * 3);
    const uni = new Float32Array(n * 4);
    const burst = new Float32Array(n * 4);
    const seeds = new Float32Array(n * 2);

    // Baked shape multipliers from the dev panel (applied on remount).
    const shape = useSceneConfig.getState().shape;
    const maelRInner = CONFIG.maelRInner * shape.maelInner;
    const maelROuter = CONFIG.maelROuter * shape.maelOuter;
    const maelTightness = CONFIG.maelTightness * shape.maelTightness;
    const maelFunnel = shape.maelFunnel;
    const burstSpread = CONFIG.burstSpread * shape.burstSpread;
    const burstCurl = CONFIG.burstCurl * shape.burstCurl;
    const burstBend = CONFIG.burstBend * shape.burstBend;
    const { maelThickness, maelBulge, burstCoreStart } = CONFIG;
    const logSpan = Math.log(maelROuter / maelRInner);

    const TAU = Math.PI * 2;
    /** Box–Muller: a normal scatter, so the disc's thickness has a *profile*. */
    const gauss = () =>
      Math.sqrt(-2 * Math.log(1 - Math.random())) *
      Math.cos(TAU * Math.random());

    let k = 0;
    for (let a = 0; a < arms; a++) {
      const armPhase = Math.random() * TAU;
      const armBright = 0.55 + 0.45 * Math.random();

      /* --- one plasma filament, set up per arm. A uniform direction on the
       * sphere, an orthonormal pair across it to curl through, a length (most
       * short, a few long and wandering), and a constant bend that pulls the
       * whole strand off its ray. All in the source scene's units — `burstScale`
       * blows the finished point up in the shader. */
      const bz = Math.random() * 2 - 1;
      const bth = Math.random() * TAU;
      const brr = Math.sqrt(1 - bz * bz);
      const dir = new THREE.Vector3(
        brr * Math.cos(bth),
        brr * Math.sin(bth),
        bz,
      );
      const up =
        Math.abs(dir.y) > 0.99
          ? new THREE.Vector3(1, 0, 0)
          : new THREE.Vector3(0, 1, 0);
      const bu = new THREE.Vector3().crossVectors(dir, up).normalize();
      const bv = new THREE.Vector3().crossVectors(dir, bu).normalize();

      let len = burstSpread * (0.28 + Math.random() * Math.random() * 1.15);
      if (Math.random() > 0.86) len *= 1.7; // a few long, wandering tendrils
      const f1 = 2 + Math.random() * 5;
      const f2 = 2 + Math.random() * 5;
      const p1 = Math.random() * TAU;
      const p2 = Math.random() * TAU;
      const curl = burstCurl * (0.45 + Math.random());
      const bend = new THREE.Vector3()
        .addScaledVector(bu, Math.random() - 0.5)
        .addScaledVector(bv, Math.random() - 0.5)
        .normalize()
        .multiplyScalar(burstBend * (0.4 + Math.random()));

      const p = new THREE.Vector3();

      for (let i = 0; i < perArm; i++) {
        const t = perArm > 1 ? i / (perArm - 1) : 0;

        /* --- maelstrom: a point on one logarithmic-spiral filament. Exponential
         * radial spacing makes the winding angle linear in `t`, which is what
         * makes it a true log spiral rather than an Archimedean one. */
        const radius =
          maelRInner * Math.exp(logSpan * t) * (1 + (Math.random() - 0.5) * 0.05);
        const angle =
          armPhase +
          maelTightness * Math.log(radius / maelRInner) +
          (Math.random() - 0.5) * 0.06;

        /* Out-of-plane scatter, with a profile rather than a flat slab: it grows
         * with radius (the disc flares outward) and swells again at the horizon
         * (matter piling up). This is what stops the disc reading as a pane of
         * glass with a spiral painted on it — see `maelThickness` / `maelBulge`. */
        const inner = radius / maelRInner - 1;
        const bulge = 1 + maelBulge * Math.exp(-inner * inner * 1.6);
        /* Funnel: curl the whole disc out of plane toward its centre so it reads
         * as a whirlpool the camera dives into, not a flat pane. The surface drops
         * away as the radius shrinks (0 at the rim, deepest at the hole); the
         * per-point thickness scatter then rides on top of that curved surface. */
        const rNorm = Math.min(1, radius / maelROuter);
        const funnelZ =
          -maelFunnel * maelROuter * 0.4 * Math.pow(1 - rNorm, 1.8);
        positions[k * 3] = radius * Math.cos(angle);
        positions[k * 3 + 1] = radius * Math.sin(angle);
        positions[k * 3 + 2] =
          funnelZ + gauss() * 0.5 * maelThickness * (0.4 + radius * 0.03) * bulge;

        /* --- universe: a point in the source's sphere-and-tube distribution. Its
         * ellipse radius is the distance, in the disc plane, from the galaxy's
         * offset focus; its height is whatever the distribution gave it, so the
         * galaxy stays a thin disc. */
        const theta = TAU * Math.random();
        const phi = Math.acos(2 * Math.random() - 1);
        const sinPhi = Math.sin(phi);
        /* 30% of points reach four times further out — the source's `tubeMaxRadiusScale`.
         * It is what gives the arms a bright spine and a long, sparse fringe. */
        const spread = Math.random() * (Math.random() < 0.3 ? 4 : 1) * 0.4;

        const ux = sinPhi * Math.cos(theta) * spread;
        const uy = sinPhi * Math.sin(theta) * spread;
        const uz = Math.cos(phi) * spread;

        uni[k * 4] = Math.hypot(ux - 2.5, uz); // ellipse radius at spawn
        uni[k * 4 + 1] = uy; // height in the disc
        uni[k * 4 + 2] = Math.random(); // life phase
        uni[k * 4 + 3] = a % 2; // which of the twin galaxies

        /* --- burst: this point's place along its filament. The curve is the
         * source's exactly — a ray out of the core, curling through `bu`/`bv` at
         * two incommensurate frequencies (so it never closes into a helix) and
         * bent quadratically off-axis so the strand *wanders*. Resolved on the
         * CPU because it is static; only the sway is left for the shader. */
        const rad = burstCoreStart + len * t;
        p.copy(dir).multiplyScalar(rad);
        p.addScaledVector(bu, Math.sin(t * f1 * Math.PI + p1) * curl * t);
        p.addScaledVector(bv, Math.cos(t * f2 * Math.PI + p2) * curl * t);
        p.addScaledVector(bend, t * t);

        burst[k * 4] = p.x;
        burst[k * 4 + 1] = p.y;
        burst[k * 4 + 2] = p.z;
        burst[k * 4 + 3] = t; // distance along the filament, 0 = core, 1 = tip

        seeds[k * 2] = Math.random();
        seeds[k * 2 + 1] = armBright;
        k++;
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("aUni", new THREE.BufferAttribute(uni, 4));
    geometry.setAttribute("aBurst", new THREE.BufferAttribute(burst, 4));
    geometry.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 2));
    return geometry;
  }

  /* --------------------------------------------------------------- materials */

  private buildMaterial() {
    const [ex, ey, ez] = CONFIG.uniEuler;

    return new THREE.ShaderMaterial({
      uniforms: {
        iTime: { value: 0 },
        uAlpha: { value: 0 },
        uRes: { value: new THREE.Vector2(1, 1) },

        /** The two morph weights, and the uniform gates derived from them. */
        uT1: { value: 0 },
        uT2: { value: 0 },
        uNeedUni: { value: 1 },
        uNeedBurst: { value: 0 },
        uNeedMael: { value: 0 },

        /* The pointer's influence on the matter itself. `uPointer` is a world-space
         * point — the cursor projected out to the depth of whatever form is on
         * screen (see `Controller`) — and the cloud is pushed out of its way,
         * stirred around it, and lit by it. Zero on touch, where there is no
         * cursor to answer. */
        uPointer: { value: new THREE.Vector3(0, 0, 0) },
        uPointerAxis: { value: new THREE.Vector3(0, 0, -1) },
        uPointerR: { value: 1 },
        uPointerPush: { value: 0 },
        uPointerSwirl: { value: 0 },
        uPointerGlow: { value: 0 },

        uStagger: { value: CONFIG.stagger },
        uMidBoost: { value: CONFIG.midBoost },
        uArc1: { value: CONFIG.arc1 },
        uSwirl1: { value: CONFIG.swirl1 },
        uArc2: { value: CONFIG.arc2 },
        uSwirl2: { value: CONFIG.swirl2 },

        // Universe.
        uUniTime: { value: 0 },
        uUniRot: { value: rotation(ex, ey, ez) },
        uUniScale: { value: CONFIG.uniScale },
        uUniEllipse: { value: CONFIG.uniEllipse },
        uUniLife: { value: CONFIG.uniLife },
        uUniSpawnSpread: { value: CONFIG.uniSpawnSpread },
        uUniOmega: { value: CONFIG.uniOmega },
        uUniV0: { value: CONFIG.uniV0 },
        uUniDecay: { value: CONFIG.uniDecay },
        uUniSize: { value: CONFIG.uniSize },
        uUniBright: { value: CONFIG.uniBright },

        // Burst.
        uBurstScale: { value: CONFIG.burstScale },
        uBurstSway: { value: CONFIG.burstSway },
        uBurstSwaySpeed: { value: CONFIG.burstSwaySpeed },
        uBurstShimmer: { value: CONFIG.burstShimmer },
        uBurstShimmerSpeed: { value: CONFIG.burstShimmerSpeed },
        uBurstTipFade: { value: CONFIG.burstTipFade },
        uBurstSize: { value: CONFIG.burstSize },
        uBurstBright: { value: CONFIG.burstBright },

        // Maelstrom.
        uMaelRot: { value: rotation(CONFIG.maelTilt, 0, 0) },
        uRInner: { value: CONFIG.maelRInner },
        uROuter: { value: CONFIG.maelROuter },
        uSpin: { value: CONFIG.maelSpin },
        uMaelTwinkle: { value: CONFIG.maelTwinkle },
        uCrescent: { value: CONFIG.maelCrescent },
        uCrescentAngle: { value: CONFIG.maelCrescentAngle },
        uMaelSize: { value: CONFIG.maelSize },
        uMaelBright: { value: CONFIG.maelBright },
        uMaelPhase: { value: 0 },

        /* Colour. The galaxy runs a three-step blue ramp; the plume goes from a
         * cold navy floor through a pale-blue body to a hot tip; the disc runs
         * from a bright arm blue into a dim core. `uPink` is the only non-blue
         * hue in the scene and it is spent sparingly — on the galaxy's rarest
         * specks, the plume's white-hot spine, and the lensing crescent — so it
         * always reads as heat rather than as a second colour. */
        uUniDeep: { value: color("accent500") },
        uUniMid: { value: color("accent400") },
        uUniBrightC: { value: color("accent200") },
        /* The burst's ramp, recoloured off the source's electric violet onto our
         * blue. Root → tip: a near-white inner, the signature accent, then a deep
         * blue the tips burn out into. The source's white-hot centre survives as
         * `uBurstCore`, which is where every filament starts and therefore where
         * 520 of them pile up additively. */
        uBurstCore: { value: color("foreground") },
        uBurstInner: { value: color("accent200") },
        uBurstMid: { value: color("accent500") },
        uBurstOuter: { value: color("accent600") },
        uArm: { value: color("accent500") },
        /* Where the arms end up once the camera has closed on the disc. A pale
         * blue, not a second hue: the *heat* in this move is carried by the
         * crescent widening and burning, and the arms only have to stop looking
         * cold. Warm them into the pink as well and the disc turns into one flat
         * magenta plate, which is exactly what the palette's scarcity rule exists
         * to prevent. */
        uArmHot: { value: color("accent300") },
        uMaelCore: { value: color("accent700") },
        uPink: { value: color("signalGlow") },

        // Fake bloom, lerped between forms each frame.
        uCoreStrength: { value: BLOOM.uni.coreStrength },
        uCoreSize: { value: BLOOM.uni.coreSize },
        uCoreSharp: { value: BLOOM.uni.coreSharp },
        uHaloAmount: { value: BLOOM.uni.haloAmount },
        uHaloWidth: { value: BLOOM.uni.haloWidth },
        uHaloFalloff: { value: BLOOM.uni.haloFalloff },
      },
      vertexShader: /* glsl */ `
        attribute vec4 aUni;    // (ellipse radius, height, life phase, twin)
        attribute vec4 aBurst;  // (filament point xyz, distance along filament)
        attribute vec2 aSeed;   // (general seed, per-arm brightness)

        uniform float iTime; uniform float uAlpha; uniform vec2 uRes;
        uniform float uT1; uniform float uT2;
        uniform float uNeedUni; uniform float uNeedBurst; uniform float uNeedMael;
        uniform vec3 uPointer; uniform vec3 uPointerAxis;
        uniform float uPointerR; uniform float uPointerPush;
        uniform float uPointerSwirl; uniform float uPointerGlow;
        uniform float uStagger; uniform float uMidBoost;
        uniform float uArc1; uniform float uSwirl1; uniform float uArc2; uniform float uSwirl2;

        uniform float uUniTime; uniform mat3 uUniRot; uniform float uUniScale;
        uniform float uUniEllipse; uniform float uUniLife; uniform float uUniSpawnSpread;
        uniform float uUniOmega; uniform float uUniV0; uniform float uUniDecay;
        uniform float uUniSize; uniform float uUniBright;

        uniform float uBurstScale; uniform float uBurstSway; uniform float uBurstSwaySpeed;
        uniform float uBurstShimmer; uniform float uBurstShimmerSpeed;
        uniform float uBurstTipFade; uniform float uBurstSize; uniform float uBurstBright;

        uniform mat3 uMaelRot; uniform float uRInner; uniform float uROuter;
        uniform float uSpin; uniform float uMaelTwinkle;
        uniform float uCrescent; uniform float uCrescentAngle;
        uniform float uMaelSize; uniform float uMaelBright; uniform float uMaelPhase;

        uniform vec3 uUniDeep; uniform vec3 uUniMid; uniform vec3 uUniBrightC;
        uniform vec3 uBurstCore; uniform vec3 uBurstInner;
        uniform vec3 uBurstMid; uniform vec3 uBurstOuter;
        uniform vec3 uArm; uniform vec3 uArmHot; uniform vec3 uMaelCore; uniform vec3 uPink;

        varying vec3 vCol; varying float vB;
        #define TAU 6.2831853

        vec2 rot2(vec2 v, float a) {
          float c = cos(a), s = sin(a);
          return vec2(v.x * c - v.y * s, v.x * s + v.y * c);
        }

        /* Per-point transition weight. Spreading the crossover by seed turns the
         * morph from a synchronised dissolve into a wave travelling through the
         * cloud — some matter has already arrived while the rest is still on its
         * way. At t = 0 and t = 1 every point agrees, so both forms stay exact. */
        float stagger(float t, float seed) {
          float s = clamp(t * (1.0 + uStagger) - seed * uStagger, 0.0, 1.0);
          return s * s * (3.0 - 2.0 * s);
        }

        void main() {
          float seed = aSeed.x;

          /* ---------------------------------------------------- universe form */
          vec3 pUni = vec3(0.0);
          vec3 cUni = uUniDeep;
          float bUni = 0.0;
          float sUni = 1.0;

          if (uNeedUni > 0.5) {
            /* The source lights 20 points per frame and drifts each outward from
             * wherever the sweeping spawn ray happened to be. So a point's angle
             * is entirely determined by *when* it was born: rewind its age off the
             * clock and read the ray's angle there. A negative "born" is a point
             * that has not ignited yet — that is the entrance. */
            float born = uUniTime / uUniLife - aUni.z * uUniSpawnSpread;
            float alive = step(0.0, born);
            float life = fract(max(born, 0.0));
            float age = life * uUniLife;

            float ang = uUniOmega * (uUniTime - age);
            float radius = aUni.x + uUniV0 * age - uUniDecay * age * age;

            pUni = vec3(cos(ang) * radius * uUniEllipse, aUni.y, sin(ang) * radius);
            // The twin galaxy is the same system turned through half a turn.
            pUni.xz *= mix(1.0, -1.0, aUni.w);
            pUni = uUniRot * pUni * uUniScale;

            // Ignite fast, then fade over the rest of the life.
            bUni = alive * smoothstep(0.0, 0.14, life)
                 * (1.0 - smoothstep(0.18, 1.0, life)) * uUniBright;

            /* Three steps of the blue ramp in roughly equal thirds, and a pink
             * top few percent — the rare hot stars. */
            cUni = uUniDeep;
            cUni = mix(cUni, uUniMid, step(0.34, seed));
            cUni = mix(cUni, uUniBrightC, step(0.67, seed));
            cUni = mix(cUni, uPink, step(0.94, seed));

            sUni = 0.35 + 0.65 * fract(seed * 17.0);
          }

          /* ------------------------------------------------------- burst form */
          vec3 pBurst = vec3(0.0);
          vec3 cBurst = uBurstMid;
          float bBurst = 0.0;
          float sBurst = 1.0;

          if (uNeedBurst > 0.5) {
            vec3 f = aBurst.xyz;          // the filament point, at rest
            float along = aBurst.w;       // 0 at the core, 1 at the tip

            /* The sway. Two waves travelling tip-ward at incommensurate rates,
             * plus a slow breathing swing, displaced along two axes across the
             * filament — so each strand *snakes* through 3D instead of swinging
             * flat in one plane. Amplitude grows with distance from the core: the
             * root is welded to the core, the tip whips.
             *
             * The source carries the two cross-axes as vertex attributes. Here
             * they are rebuilt from the point's own direction, which costs two
             * cross products and saves 24 bytes a point across a 120k cloud. The
             * sway is a wobble; it does not care *which* perpendicular pair it
             * rides on, only that the pair is perpendicular. */
            vec3 d = normalize(f + 1e-5);
            vec3 ax = normalize(cross(d, abs(d.y) > 0.99 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0)));
            vec3 ay = cross(d, ax);

            float amp = uBurstSway * along;
            float ph = seed * TAU;
            float ts = iTime * uBurstSwaySpeed;
            float w1 = sin(ts + ph + along * 5.0);
            float w2 = cos(ts * 1.27 + ph * 1.7 + along * 9.0);
            float w3 = 0.5 * sin(ts * 0.6 + ph);

            f += ax * (w1 + w3) * amp;
            f += ay * w2 * amp * 0.8;

            /* Blown up last, so the curl, the bend and the sway all scale with the
             * burst instead of staying a fine fuzz on a giant shape — the same
             * discipline the plume's scale followed. */
            pBurst = f * uBurstScale;

            /* The shimmer: a bright band running down each filament's length. It
             * is what makes them read as *charged* rather than as drawn. */
            float sh = max(0.0, 0.6 + uBurstShimmer * 0.55
              * sin(along * 16.0 - iTime * uBurstShimmerSpeed + seed * 28.0));

            // Blazing at the root, burning out toward the tip.
            float fade = mix(1.15, uBurstTipFade, smoothstep(0.0, 1.0, along));

            /* Per-filament brightness, and it is the single thing that makes this
             * form read. 520 filaments lit evenly is a sphere of dust — every
             * strand is buried in its neighbours and the eye resolves the average,
             * not the structure.
             *
             * aSeed.y is uniform on [0.55, 1], so it is remapped to [0, 1] first
             * and then weighted *hard*: squared-and-a-bit, so roughly the top third
             * of the filaments carry almost all of the light and the rest fall to a
             * faint haze the eye reads as depth. That is what leaves clean lines
             * running out of the centre instead of a bright fog — it is the density
             * control this form actually needed, and the reason the curl could go
             * back down to the source's.
             *
             * The dark ones are not wasted either: they fall under the vertex-shader
             * brightness reject and cost no fragments at all. */
            float fn = clamp((aSeed.y - 0.55) / 0.45, 0.0, 1.0);
            float fil = 0.035 + 2.4 * pow(fn, 2.6);
            bBurst = sh * fade * fil * uBurstBright;

            /* Near-white inner → the accent → a deep navy the tips burn out into,
             * with the core white bleeding over the first few percent. Every
             * filament starts at the same tiny radius, so that white is where 520
             * of them pile up — the core is not drawn, it is *crowded* into being. */
            cBurst = mix(uBurstInner, uBurstMid, smoothstep(0.0, 0.5, along));
            cBurst = mix(cBurst, uBurstOuter, smoothstep(0.5, 1.0, along));
            cBurst = mix(cBurst, uBurstCore, (1.0 - smoothstep(0.0, 0.12, along)) * 0.9);
            // The pink is spent on the tips of a rare few strands, and nowhere else.
            cBurst = mix(cBurst, uPink, step(0.94, seed) * smoothstep(0.45, 1.0, along));

            /* Nearly uniform along the strand. Tapering hard toward the tip (the
             * first attempt: 0.55 + 1.15 × root-ness) shrinks exactly the points
             * that are already the most spread out, and the filaments dissolve into
             * the background before they have gone anywhere. */
            sBurst = 0.8 + 0.45 * (1.0 - along);
          }

          /* --------------------------------------------------- maelstrom form */
          vec3 pMael = vec3(0.0);
          vec3 cMael = uArm;
          float bMael = 0.0;
          float sMael = 1.0;

          if (uNeedMael > 0.5) {
            // Rigid swirl in the disc plane — it turns without deforming the spiral.
            vec3 m = position;
            m.xy = rot2(m.xy, iTime * uSpin);

            float radius = length(position.xy);
            float core = clamp((uROuter - radius) / (uROuter - uRInner), 0.0, 1.0);

            /* The lensing crescent. Fixed in frame rather than riding the disc:
             * the angle is read *after* the spin but *before* the tilt, so streams
             * light up as they sweep through it and go dark again as they leave. */
            float a2 = atan(m.y, m.x) - uCrescentAngle;
            float d = abs(atan(sin(a2), cos(a2)));            // wrapped angular distance
            /* The crescent opens up and burns harder as the camera closes on the
             * disc: the hot sector spreads from ~1.5 rad to ~2.7, and its peak
             * lifts by 70%. This is the colour move — the disc is *heating*, and
             * heat in this palette is pink. */
            float crescent = smoothstep(1.5 + uMaelPhase * 0.9, 0.0, d)
                           * core * core * uCrescent * (1.0 + 0.5 * uMaelPhase);

            pMael = uMaelRot * m;

            float tw = 1.0 - uMaelTwinkle * (0.5 + 0.5 * sin(iTime * 3.0 + seed * TAU));
            float bright = aSeed.y * (0.3 + 0.7 * core);

            // The arms come off the cold accent blue as the crescent takes hold.
            cMael = mix(mix(uArm, uArmHot, uMaelPhase), uMaelCore, core * core);
            cMael = mix(cMael, uPink, clamp(crescent, 0.0, 1.0));

            /* The arms are lifted off the floor (0.45 → 0.7) and the crescent
             * trimmed (1.7 → 1.5). Smaller sprites carry less light, and the
             * first pass at the doubled disc left everything that was not the
             * crescent reading as an empty black ellipse — the spiral has to be
             * *visible* for a sharper spiral to be worth anything. */
            /* The lift as the camera closes is deliberately small. The crescent is
             * already widening and burning harder on its own, and additive glow
             * compounds — pushed further, the whole inner disc clips to a flat
             * white-magenta plate and the spiral inside it is gone. */
            bMael = (bright * tw * (0.7 + core) + crescent * 1.5)
                  * uMaelBright * (1.0 + 0.18 * uMaelPhase);
            /* Flattened from 1.1 + core*2.2 + crescent*3.2. That spread was a
             * 6x swing, which at the disc's new scale drove the inner arms and
             * the crescent straight into the 24px sprite clamp — the exact points
             * that most need to stay crisp, since they are the ones nearest the
             * lens. Size still grows inward, just far less steeply. */
            sMael = 1.0 + core * 1.1 + crescent * 1.6;
          }

          /* ------------------------------------------------------------ morph */
          float t1 = stagger(uT1, seed);
          float t2 = stagger(uT2, fract(seed * 3.7 + 0.31));

          /* A straight lerp would send every particle along the shortest path, and
           * the cloud visibly flattens through the midpoint. Bow each path outward
           * along its own direction, and shear the whole cloud about the vertical —
           * the axis all three forms already turn on — so the change reads as matter
           * being flung and re-gathered. Both terms vanish at either end. */
          vec3 dir = normalize(vec3(
            sin(seed * 91.3 + 0.7),
            cos(seed * 57.1 + 2.1),
            sin(seed * 33.7 + 4.3)
          ) + 1e-4);

          vec3 p = mix(pUni, pBurst, t1);
          float mid1 = 4.0 * t1 * (1.0 - t1);
          p += dir * (uArc1 * mid1);
          p.xz = rot2(p.xz, mid1 * uSwirl1 * (0.6 + 0.8 * seed));

          p = mix(p, pMael, t2);
          float mid2 = 4.0 * t2 * (1.0 - t2);
          p += dir * (uArc2 * mid2);
          p.xz = rot2(p.xz, mid2 * uSwirl2 * (0.6 + 0.8 * seed));

          /* ------------------------------------------------------ the pointer */
          /* The cursor is a body in the scene, not a parallax offset. Its world
           * position is the cursor ray projected out to the depth of whatever form
           * is on screen, and everything near it is:
           *
           *  - **pushed away** — a soft bubble the matter parts around;
           *  - **stirred** — a tangential shove about the view axis, so the cloud
           *    curls around the cursor instead of merely denting. A pure radial
           *    push reads as a hole being poked in a sheet; the swirl is what makes
           *    it read as *matter being disturbed*;
           *  - **excited** — the points it touches burn brighter, so the cursor
           *    leaves a wake of light rather than a void.
           *
           * The falloff is a Gaussian, so there is no edge to the region of
           * influence — a hard cutoff pops visibly as points cross it. */
          vec3 pd = p - uPointer;
          float pl = length(pd);
          float infl = exp(-(pl * pl) / max(0.001, uPointerR * uPointerR));
          vec3 pdir = normalize(pd + 1e-4);
          p += pdir * (infl * uPointerPush);
          p += normalize(cross(uPointerAxis, pdir) + 1e-4) * (infl * uPointerSwirl);

          vCol = mix(mix(cUni, cBurst, t1), cMael, t2);
          // Pay back the density the arc and the swirl just threw away.
          vB = mix(mix(bUni, bBurst, t1), bMael, t2)
             * uAlpha * (1.0 + uMidBoost * (mid1 + mid2))
             * (1.0 + infl * uPointerGlow);

          /* Kill the invisible points here, in the vertex shader, rather than
           * letting the fragment shader discard them one pixel at a time.
           *
           * A large share of this cloud is dark at any instant and always was —
           * the galaxy fades each star out across its life, the plume fades its
           * specks in at the floor and out at the tip, and the whole cloud is
           * scaled by uAlpha. Every one of those points was still rasterising a
           * full sprite — a couple of hundred fragments each — for the fragment
           * shader to throw away individually. Clipping them out of the frustum
           * emits *no* fragments at all, and nothing that could have been seen is
           * lost: the threshold is below one 255th of a channel, and the blending
           * is additive, so these points cannot change a pixel. */
          if (vB < 0.004) {
            gl_Position = vec4(2.0, 2.0, 2.0, 1.0);   // outside the clip volume
            gl_PointSize = 0.0;
            return;
          }

          float size = mix(
            mix(uUniSize * sUni, uBurstSize * sBurst, t1),
            uMaelSize * sMael,
            t2
          );

          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          /* The sprite ceiling, down from 24px.
           *
           * This scene is fill-bound, not vertex-bound — measured: the hero is the
           * *slowest* frame on the page and it is the one form with no domain-warp
           * in its vertex path. Sprite area is quadratic in this number, so the
           * points nearest the lens were each costing ~2.5x what they do now, and
           * they are also the ones that pile up additively into the blown-out white
           * cores. Cutting the ceiling takes the fill and the blow-out together;
           * the brightness each form lost is paid back in each form's brightness
           * config, so the scene reads the same. */
          gl_PointSize = clamp(size * uRes.y / 1000.0 / -mv.z, 1.0, 15.0);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uCoreStrength; uniform float uCoreSize; uniform float uCoreSharp;
        uniform float uHaloAmount; uniform float uHaloWidth; uniform float uHaloFalloff;
        varying vec3 vCol; varying float vB;

        void main() {
          /* Glow, faked per point: a sharp core inside a soft halo. Additive
           * blending accumulates it into a real bloom wherever the cloud crowds —
           * a bloom pass over points this fine flickers instead (ADR-0019). */
          float pd = length(2.0 * gl_PointCoord - 1.0);

          /* A point sprite is a quad, and its corners reach pd = 1.41. Without
           * this the halo is still lit out there and every speck renders as a
           * hard little square — which, at 120k of them, is the whole screen. */
          if (pd > 1.0) discard;

          float core = pow(max(0.0, 1.0 - pd / max(0.001, uCoreSize)), uCoreSharp) * uCoreStrength;
          float halo = pow(max(0.0, 1.0 - pd / max(0.001, uHaloWidth)), uHaloFalloff) * uHaloAmount;

          /* Raised from 0.002. Under additive blending anything below ~1/255 of a
           * channel cannot change the framebuffer, so every fragment under that is
           * a blend that costs bandwidth and writes nothing. Discarding them early
           * is free performance: it is not a visual threshold, it is the point
           * below which the visual is already zero. */
          float mask = (core + halo) * vB;
          if (mask <= 0.006) discard;
          gl_FragColor = vec4(vCol, mask);
        }`,
      blending: THREE.AdditiveBlending,
      depthTest: false,
      depthWrite: false,
      transparent: true,
    });
  }

  /* ------------------------------------------------------------------ frame */

  resize() {
    const dpr = clampedPixelRatio();
    this.material.uniforms.uRes.value.set(
      window.innerWidth * dpr,
      window.innerHeight * dpr,
    );
  }

  render({
    t1 = 0,
    t2 = 0,
    appear = 0,
    uniTime = 0,
    maelPhase = 0,
    dissolve = 0,
    pointer,
  }: MorphRenderProps = {}) {
    const u = this.material.uniforms;

    // Live recolour from the dev panel: only when the palette actually changed.
    if (this.paletteSig !== paletteGen()) {
      this.paletteSig = paletteGen();
      this.applyColors();
    }

    u.uMaelPhase.value = maelPhase;

    if (pointer) {
      u.uPointer.value.copy(pointer.world);
      u.uPointerAxis.value.copy(pointer.axis);
      u.uPointerR.value = pointer.radius;
      u.uPointerPush.value = pointer.push;
      u.uPointerSwirl.value = pointer.swirl;
      u.uPointerGlow.value = pointer.glow;
    }

    u.iTime.value = performance.now() / 1000;
    /* The galaxy's clock starts one full lifetime in, so the disc is whole on
     * the first frame rather than painting itself in over six seconds. See
     * `CONFIG.uniPrime`. */
    u.uUniTime.value = uniTime + CONFIG.uniPrime;
    // The cloud dissolves as the logo mark assembles in its place at Impact.
    u.uAlpha.value = appear * (1 - dissolve);
    u.uT1.value = t1;
    u.uT2.value = t2;

    /* Skip the forms nothing is using this frame. These are uniform branches, so
     * the whole draw takes one path — and the plume's domain-warp is the most
     * expensive thing in the shader, evaluated 120k times a frame if left on.
     *
     * The bounds are exact, not approximate: `stagger` only reaches 1 for every
     * point once its weight is 1, and only leaves 0 for any point once its weight
     * leaves 0. So no point is ever blended toward a form that was skipped. */
    u.uNeedUni.value = t1 < 1 ? 1 : 0;
    u.uNeedBurst.value = t1 > 0 && t2 < 1 ? 1 : 0;
    u.uNeedMael.value = t2 > 0 ? 1 : 0;

    /* Live geometry from the dev panel: per-form point sizes and a per-form glow
       multiplier on the in-shader bloom, blended by the morph weights exactly like
       the forms are. Sizes are uniforms, so they retune without a rebuild. */
    const vortex = useSceneConfig.getState().vortex;
    u.uUniSize.value = CONFIG.uniSize * vortex.galaxySize;
    u.uBurstSize.value = CONFIG.burstSize * vortex.burstSize;
    u.uMaelSize.value = CONFIG.maelSize * vortex.maelSize;
    const glow = lerp(
      lerp(vortex.galaxyGlow, vortex.burstGlow, t1),
      vortex.maelGlow,
      t2,
    );

    /* Live shape: the galaxy is computed from these uniforms in the vertex shader,
       so scale / flattening / arm sweep / drift reshape it in real time; the burst
       scale and the disc spin are live too. (The burst filament shape and disc
       radii are baked — see geometry() — and apply on "Apply".) */
    const shape = useSceneConfig.getState().shape;
    u.uUniScale.value = CONFIG.uniScale * shape.galaxyScale;
    u.uUniEllipse.value = CONFIG.uniEllipse * shape.galaxyEllipse;
    u.uUniOmega.value = CONFIG.uniOmega * shape.galaxyPitch;
    u.uUniV0.value = CONFIG.uniV0 * shape.galaxyDrift;
    u.uBurstScale.value = CONFIG.burstScale * shape.burstScale;
    u.uSpin.value = CONFIG.maelSpin * shape.maelSpin;

    const bloom = lerpBloom(lerpBloom(BLOOM.uni, BLOOM.burst, t1), BLOOM.mael, t2);
    u.uCoreStrength.value = bloom.coreStrength * glow;
    u.uCoreSize.value = bloom.coreSize;
    u.uCoreSharp.value = bloom.coreSharp;
    u.uHaloAmount.value = bloom.haloAmount * glow;
    u.uHaloWidth.value = bloom.haloWidth;
    u.uHaloFalloff.value = bloom.haloFalloff;
  }
}

export default Morph;
