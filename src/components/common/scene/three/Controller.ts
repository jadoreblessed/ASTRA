import * as THREE from "three";

import Warp from "./objects/warp";
import Morph, { MAEL_TILT } from "./objects/morph";
import Starfield from "./objects/starfield";
import LogoMark from "./objects/logo-mark";

import { screens } from "@/lib/scene/screens";
import { scrollState } from "@/lib/scene/scroll-state";
import { getMouseCoords, hasPointer } from "@/lib/scene/mouse";
import { Lerp } from "@/lib/scene/easing";
import { LOGO_STRUCTURAL, useSceneConfig } from "@/lib/scene/scene-config";

/**
 * Drives the scene from the shared scroll state, once per frame.
 *
 * The scene is one continuous transformation, not three scenes in a row: the
 * galaxy that appears on load becomes the plasma burst, and the burst becomes the
 * maelstrom. `Morph` owns the matter; this class owns *when* — the two scroll
 * weights that drive it, the entrance, and the camera.
 *
 * The camera is genuinely flown, which is new. Every previous scene object here
 * left the shared camera parked at z = 3 and moved its own group instead, because
 * the objects were positioned against each other and against a fixed frame. There
 * is nothing left to position against: `Morph` is the only thing in the scene with
 * a shape, and `Starfield` is deliberately a fixed backdrop. So the three forms
 * keep the world scales their source scenes were composed at — a galaxy about 7
 * units across, a column 15.5 tall, an accretion disc 24 wide — and the camera
 * travels between the three framings instead of each form being squeezed into one.
 * That is what makes the transformation feel like something happening *around* the
 * viewer rather than in front of them. See [[decisions-log]] ADR-0028.
 *
 * There is no scene below the roadmap: Impact and the footer are UI on a plain
 * background, and the canvas itself is faded out by `<Scene>`.
 */

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

const smoothstep = (edge0: number, edge1: number, x: number): number => {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
};

/** A camera framing: where it sits, what it looks at, how wide it sees. */
interface Framing {
  position: THREE.Vector3;
  target: THREE.Vector3;
  fov: number;
  /** Positional mouse parallax, in world units at full deflection. */
  parallax: THREE.Vector2;
}

const CONFIG = {
  /**
   * Where each form's morph begins, as a fraction of the scroll between one
   * slide and the next. The lead-in is dead space on purpose: the galaxy holds
   * while you read the hero, and the burst holds through the sitemap. Without it
   * the scene starts dissolving the instant you touch the wheel, which reads as
   * twitchy rather than as a place you are moving through.
   */
  morph1Start: 0.25,
  morph2Start: 0.3,
  /** The maelstrom arrives just before the roadmap lands, not with it. */
  morph2End: 0.95,

  /** The galaxy dive: how far the camera pulls in over the hero's scroll. */
  scrollDive: 3.5,
  /**
   * The galaxy's idle drift — a **sway**, not a rotation, and that distinction is
   * a bug fix.
   *
   * This was `angle = t × rate`: an unbounded rotation. It looks right for the
   * first minute and is wrong forever after — the eye simply keeps going, walks
   * all the way around the galaxy, and by the time anyone has sat on the hero for
   * a few minutes it has settled into a framing nobody chose, viewing the disc
   * from behind. An idle animation has no business *arriving* anywhere.
   *
   * A sine sways the eye a few degrees either side of the composed framing and
   * always comes home. The composition is now a fixed point of the motion rather
   * than the starting point of a slow escape. (`uniRise` was always a sine, and
   * was always fine — which is the tell.)
   */
  uniSway: 0.16,
  uniSwayRate: 0.035,
  uniRise: 2.2,
  uniRiseRate: 0.05,
  /**
   * The burst's orbit — mostly scroll, with a little clock under it.
   *
   * `burstScroll` is the whole point: the camera swings ~150° around the eruption
   * across the burst's whole life, so the filaments rake past the lens and the core
   * is seen from a genuinely different side by the time the chapters are read. A
   * radially symmetric form seen from a fixed angle is the one thing that can make
   * a burst read as a *still*, however much it shimmers.
   *
   * The swing is spread over a span that opens as the galaxy *starts* becoming the
   * burst (see `burstPhase`), not once it has arrived — so the very first filaments
   * the viewer sees are already turning. It is widened to compensate for the longer
   * span, so the rotation per unit of scroll stays about what it was.
   *
   * `burstSway` (the clock) is kept, but small, and it **sways rather than
   * rotates** — for the same reason the galaxy's does. An unbounded idle rotation
   * added on top of a scroll-driven one silently walks the scroll's composition
   * away over time: the same scroll position gives a different framing depending
   * on how long the page has been open, which is not a thing a scene should do.
   * A sine keeps the scroll term in charge of *where* the camera is and leaves the
   * clock in charge only of *breathing*.
   */
  burstScroll: 2.6,
  burstSway: 0.09,
  burstSwayRate: 0.05,
  burstOrbitParallax: 0.6,
  /** The eye also rises and eases back across the same span. */
  burstRise: 6,
  burstPull: 1.8,
  /** The maelstrom's aimless lateral drift, scaled with its doubled disc. */
  maelDrift: 2.4,
  maelDriftRate: 0.1,

  /**
   * The roadmap flight — a true orbit of the disc, **in the disc's own frame**.
   *
   * The maelstrom is the only form the viewer stays with (2.5 viewports of stages
   * sliding past), so it gets a flight driven by the slide's local progress rather
   * than by a clock: scroll down and you fly around it, scroll back up and you fly
   * back, which a timed animation could never do.
   *
   * **The frame is the whole thing.** Earlier versions orbited about the *world* y
   * axis, and on a disc raked 0.95 rad that is not an orbit at all — it swings the
   * camera in and out of the disc plane, so the spiral opens and then foreshortens
   * into a blade, and every fix meant trading amplitude against flatness (the trap
   * ADR-0033 records). Orbit in the *disc's* frame instead and the problem simply
   * evaporates: put the eye at a fixed height **out of the disc plane** and circle
   * it there, and the elevation is constant for the entire sweep. The disc keeps
   * its face turned toward you all the way round, and the swing can be as wide as
   * you like.
   *
   * The flight now opens **close** rather than distant — the disc is already
   * filling the frame when the roadmap lands, and the move is the orbit itself
   * rather than an approach. The camera drifts back a little as it goes, which is
   * enough to keep the sweep from feeling like a turntable.
   */
  /** Orbit radius within the disc plane: close on arrival, easing back. */
  maelOrbitFrom: 26,
  maelOrbitTo: 28,
  /**
   * Height **above the disc plane**, in the disc's own frame — not a world y.
   *
   * This is the number that used to be a trap and no longer is. Because the orbit
   * is built in disc-local coordinates, `n · eye` *is* this value for every point
   * of the sweep, so the elevation above the plane (~28°) never changes: it cannot
   * accidentally graze the plane, whatever the azimuth does.
   */
  maelOrbitHeight: 14,
  /** How far around the disc the orbit sweeps, radians. ~150°. */
  maelSwing: 2.6,
  maelFovFrom: 66,
  maelFovTo: 76,

  /** Entrance: the alpha envelope, and how far back the camera starts. */
  appearMs: 1800,
  introDolly: 8,

  /** Pointer smoothing, and how fast the parallax eases in once a pointer exists. */
  pointerEase: 0.05,
  pointerActivate: 0.03,

  /**
   * The cursor's influence on the *matter*, per form — sized against each one.
   *
   * A radius that reads as a firm shove through a galaxy 14 units across would be
   * an invisible pinprick in a disc 48 wide, so all three numbers are blended with
   * the morph weights exactly like the framings are. `push` parts the cloud,
   * `swirl` stirs it around the cursor (a pure radial push reads as a dent; the
   * swirl is what makes it read as matter being disturbed) and `glow` lights what
   * it touches, so the cursor leaves a wake rather than a hole.
   */
  /* Deliberately gentle. The first pass at these was three times stronger and it
   * *evacuated* the burst — the cursor sits at the depth of whatever the camera is
   * aimed at, which for a radially symmetric form is its core, so a push that felt
   * reasonable in the abstract emptied out the exact point every filament converges
   * on and left a hollow shell. The cursor should disturb the matter, not demolish
   * it: you want to feel that it is *there*, not to be able to delete the scene
   * with it. Most of the life comes from `swirl` and `glow` anyway — the stir and
   * the wake — rather than from the size of the dent. */
  pointerForce: {
    uni: { radius: 3.4, push: 0.42, swirl: 0.75, glow: 1.1 },
    burst: { radius: 3.6, push: 0.5, swirl: 0.95, glow: 1.3 },
    mael: { radius: 10, push: 1.3, swirl: 2.2, glow: 0.9 },
  },

  /**
   * The exit dive — the scene's last movement, and the only one that is not an
   * orbit.
   *
   * The canvas used to simply fade out under Impact, which threw away the one shape
   * the scene had spent the whole roadmap building: a hole. So instead of dissolving
   * in place, the camera **flies through the event horizon**. The orbit's radius
   * collapses to nothing, the eye drops onto the disc's axis, and it accelerates
   * through the middle of the disc and out the other side into the dark — with the
   * lens flaring wide as it goes. The fade then finishes on a camera that is already
   * inside the black.
   *
   * It leads the canvas fade deliberately (`useSceneVisibility` starts 0.85vh before
   * Impact's top; this starts at 2.0vh), so the dive is well under way — the arms
   * already rushing past the lens — before the opacity starts taking it away.
   */
  diveLeadVh: 2,
  diveSpanVh: 2.4,
  /**
   * Where the dive ends, in disc-local z. It used to fly *through* to −22 — out
   * the far side of the hole into empty space, which is the bare-starfield frame
   * the logo then had to cover. Now it flies UP TO the mouth of the hole and holds
   * just above the plane (small positive z): the funnel fills the frame, the eye
   * looks down into the dark throat, and the logo mark assembles right there over
   * the same starfield. No far side, so nothing to blank.
   */
  diveThrough: -22,
  /** How far ahead of the eye the look-target rides, down the dive axis. */
  diveAhead: 40,
  diveFov: 104,

  /* The logo mark's assembly, in viewports of scroll around Impact's top. It only
   * begins once the camera has flown *through* the hole (the disc grows
   * continuously the whole way in — it is not dissolved during the flight), so the
   * mark forms only after the dive, over the same starfield. */
  logoLeadVh: 0.35,
  logoSpanVh: 1.3,
} as const;

/** The three framings, lifted from the source scenes' cameras. */
const FRAMING: Record<"uni" | "burst" | "mael", Framing> = {
  uni: {
    /* In from 15, and a much wider lens than the source's 45°. The galaxy is now
     * ~14 units across once its arms have drifted out (`morph.ts` `uniScale`), so
     * from 10.5 units on a 58° lens it overruns the frame on every side and the
     * hero opens *inside* it. Sitting further back kept the whole disc politely in
     * shot, which is the composition of an illustration, not of a place.
     *
     * The eye also sways around the galaxy and rises as it goes (`uniSway`). The
     * galaxy already turns on its own axis, but a rotating object seen from a fixed
     * point still reads as an object being *shown* to you; move the camera as well
     * and the parallax against the starfield turns it into somewhere you are
     * drifting through. It is the cheapest immersion in the scene — and it *sways*
     * rather than orbits, so it always comes home to this framing. */
    // x/z are the orbit, recomputed each frame; y is the base camera height.
    position: new THREE.Vector3(0, 0, 10.5),
    target: new THREE.Vector3(0, 0, 0),
    fov: 58,
    parallax: new THREE.Vector2(0.6, 0.6),
  },
  burst: {
    /* The burst is radially symmetric — a core with filaments erupting in every
     * direction — which makes it a far easier thing to frame than the column it
     * replaces. There is no "up it" or "along it": every angle is a good angle,
     * so the camera simply orbits it at eye level and looks straight at the core.
     * The empty centre column of the chapter ledger is exactly where the core
     * lands, which is the layout that section was designed around in the first
     * place.
     *
     * Distance is set against the *median* filament — about 8 world units out
     * (`morph.ts` `burstScale`) — and not against the rare long tendrils, which run
     * four times further. At 15 units on a 62° lens the lens sees ~18 units of
     * height: the body of the burst fills the frame and the stragglers leave it.
     * Framed against the long ones instead, the burst sat in the middle of the
     * screen as a small bright ball with nothing around it. Inside the burst, not
     * in front of it. */
    // x/z are the orbit, recomputed each frame; y is the camera height.
    position: new THREE.Vector3(0, 2, 11),
    target: new THREE.Vector3(0, 0, 0),
    fov: 62,
    /* The burst answers the pointer by swinging its *orbit* rather than sliding
     * the camera sideways, so it takes no lateral parallax of its own. */
    parallax: new THREE.Vector2(0, 2.2),
  },
  mael: {
    /* Position is a placeholder: the real eye is `maelEye`, recomputed every frame
     * as an orbit in the *disc's* frame (see `CONFIG.maelOrbit*`). Only the target
     * and the parallax are read from here. */
    position: new THREE.Vector3(0, 0, CONFIG.maelOrbitFrom),
    target: new THREE.Vector3(0, 0, 0),
    fov: CONFIG.maelFovFrom,
    parallax: new THREE.Vector2(8.85, 7.08),
  },
};

/**
 * Rotate a point out of the disc's frame into the world.
 *
 * The disc's points live in the xy plane and are tilted into place by a rotation
 * of `MAEL_TILT` about x (`morph.ts`, `uMaelRot`). The camera's orbit is built in
 * that same frame and brought out through the same rotation, which is what keeps
 * its elevation above the disc constant for the whole sweep.
 */
const fromDiscFrame = (
  out: THREE.Vector3,
  x: number,
  y: number,
  z: number,
): THREE.Vector3 => {
  const c = Math.cos(MAEL_TILT);
  const s = Math.sin(MAEL_TILT);
  return out.set(x, y * c - z * s, y * s + z * c);
};

class Controller {
  private readonly preloader: Warp;
  private readonly morph: Morph;
  private readonly starfield: Starfield;
  private readonly logoMark: LogoMark;
  private readonly unsubscribeLogo: () => void;
  private readonly camera: THREE.PerspectiveCamera;

  private readonly pointer = new THREE.Vector2(0, 0);
  /** 0 until the pointer moves, then eased to 1 — see `hasPointer`. */
  private pointerActive = 0;

  /** Scratch, so the flight path allocates nothing per frame. */
  private readonly eye = new THREE.Vector3();
  private readonly look = new THREE.Vector3();
  private readonly uniEye = new THREE.Vector3();
  private readonly burstEye = new THREE.Vector3();
  private readonly maelEye = new THREE.Vector3();
  private readonly maelLook = new THREE.Vector3();

  /** The cursor as a body in the scene, handed to `Morph` each frame. */
  private readonly pointerForce = {
    world: new THREE.Vector3(),
    axis: new THREE.Vector3(0, 0, -1),
    radius: 1,
    push: 0,
    swirl: 0,
    glow: 0,
  };

  /** Set on the first frame after the preloader clears; null until then. */
  private appearStart: number | null = null;

  constructor(scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
    this.camera = camera;
    // The preloader hangs off the camera — it has to stay in front of a lens
    // that now moves. See `objects/warp`.
    this.preloader = new Warp(camera);
    this.starfield = new Starfield(scene);
    this.morph = new Morph(scene);
    this.logoMark = new LogoMark(scene);

    // Rebuild the mark's buffers when a structural tuning value changes.
    let prevKey = LOGO_STRUCTURAL.map(
      (k) => useSceneConfig.getState().logo[k],
    ).join("|");
    this.unsubscribeLogo = useSceneConfig.subscribe((state) => {
      const key = LOGO_STRUCTURAL.map((k) => state.logo[k]).join("|");
      if (key !== prevKey) {
        prevKey = key;
        this.logoMark.rebuild();
      }
    });
  }

  dispose() {
    this.unsubscribeLogo();
    this.logoMark.dispose();
  }

  /* ------------------------------------------------------------------ scroll */

  /**
   * The two morph weights, from scroll position.
   *
   * Keyed off the distance between slide *tops*, not off `sceneProgress`. That
   * value is a triangular kernel — it peaks mid-slide and falls away again — so it
   * cannot tell arriving from leaving, and a morph driven by it would run forward
   * and then straight back. Distance between tops is monotonic in scroll, and
   * still reverses correctly when the user scrolls back up, which is exactly what
   * a transformation should do.
   */
  private weights(): {
    t1: number;
    t2: number;
    dive: number;
    burstPhase: number;
  } {
    const hero = scrollState.slideRange[screens.HERO];
    const sitemap = scrollState.slideRange[screens.SITEMAP];
    const roadmap = scrollState.slideRange[screens.ROADMAP];
    if (!hero || !sitemap || !roadmap)
      return { t1: 0, t2: 0, dive: 0, burstPhase: 0 };

    const { scrollY } = scrollState;

    const s1 = clamp01(
      (scrollY - hero.top) / Math.max(1, sitemap.top - hero.top),
    );
    const s2 = clamp01(
      (scrollY - sitemap.top) / Math.max(1, roadmap.top - sitemap.top),
    );

    /* The burst's span, measured from the moment it starts *existing* — not from
     * the moment it is finished.
     *
     * This used to be `s2`, which is zero until the sitemap's top. By then the
     * eruption is already fully formed, so the first thing the viewer ever sees of
     * it is a burst standing perfectly still, and it only begins to turn once they
     * are reading the chapters. The rotation has to be under way *before* the form
     * is: whatever fraction of it has appeared, it should already be moving.
     *
     * So the span opens where the galaxy first begins to become the burst —
     * `morph1Start` through the hero's scroll — and closes at the roadmap. The
     * first filaments now arrive into a camera that is already swinging. */
    const burstBegins =
      hero.top + CONFIG.morph1Start * (sitemap.top - hero.top);
    const burstPhase = clamp01(
      (scrollY - burstBegins) / Math.max(1, roadmap.top - burstBegins),
    );

    return {
      t1: smoothstep(CONFIG.morph1Start, 1, s1),
      t2: smoothstep(CONFIG.morph2Start, CONFIG.morph2End, s2),
      // The dive answers the wheel immediately, ahead of the morph.
      dive: s1,
      burstPhase,
    };
  }

  /* ------------------------------------------------------------------ camera */

  private trackPointer() {
    this.pointerActive = Lerp(
      this.pointerActive,
      hasPointer() ? 1 : 0,
      CONFIG.pointerActivate,
    );

    const { x, y } = getMouseCoords().window;
    const tx = x === null ? 0 : (x / window.innerWidth) * 2 - 1;
    const ty = y === null ? 0 : (y / window.innerHeight) * -2 + 1;

    this.pointer.x = Lerp(this.pointer.x, tx, CONFIG.pointerEase);
    this.pointer.y = Lerp(this.pointer.y, ty, CONFIG.pointerEase);
  }

  /**
   * Fly the camera along the blend of the three framings.
   *
   * Each form's framing is evaluated first — including the parts that answer the
   * clock or the pointer, like the burst's orbit — and only then blended, so the
   * path between them is a smooth flight rather than a cut. FOV is blended too:
   * the lens widens from 45° over the galaxy to 60° over the disc, which is a
   * good part of why the maelstrom feels like it is swallowing the frame.
   */
  private flyCamera(
    t1: number,
    t2: number,
    dive: number,
    appear: number,
    phase: number,
    exit: number,
    burstPhase: number,
  ) {
    const t = performance.now() / 1000;
    const { x: mx, y: my } = this.pointer;
    const active = this.pointerActive;

    /* Universe: a slow circle of the galaxy, pulling in as you scroll through the
     * hero. The camera is genuinely moving, so the near dust and the far stars
     * shear against each other and the hero reads as a place rather than a plate. */
    const uniDist = FRAMING.uni.position.z - CONFIG.scrollDive * dive;
    const uniAngle = Math.sin(t * CONFIG.uniSwayRate) * CONFIG.uniSway;
    this.uniEye.set(
      Math.sin(uniAngle) * uniDist,
      FRAMING.uni.position.y +
        Math.sin(t * CONFIG.uniRiseRate) * CONFIG.uniRise,
      Math.cos(uniAngle) * uniDist,
    );

    /* Burst: an orbit of the core driven by **scroll**, with the clock and the
     * pointer layered on top. This is the one framing whose lateral mouse response
     * is an angle, not an offset.
     *
     * The eruption is radially symmetric, so a fixed vantage is the one thing that
     * can make it read as a still image however much it shimmers. Swinging the eye
     * around it as the chapters are read — while it also rises and eases back —
     * rakes the filaments past the lens and shows the core from a genuinely
     * different side by the end of the section. */
    const orbit =
      burstPhase * CONFIG.burstScroll +
      Math.sin(t * CONFIG.burstSwayRate) * CONFIG.burstSway +
      mx * CONFIG.burstOrbitParallax * active;
    const burstDist = FRAMING.burst.position.z + CONFIG.burstPull * burstPhase;
    this.burstEye.set(
      Math.sin(orbit) * burstDist,
      FRAMING.burst.position.y + CONFIG.burstRise * burstPhase,
      Math.cos(orbit) * burstDist,
    );

    /* Maelstrom: an orbit of the disc, in the disc's own frame, driven by scroll.
     *
     * The eye is placed in disc-local coordinates — circling in the disc's plane at
     * a fixed height *out* of it — and then rotated into the world through the same
     * tilt the disc's own points go through. Because the height out of plane is held
     * constant, the camera's elevation above the disc is constant for the entire
     * sweep: it can circle as far as it likes and never graze the plane. The whole
     * amplitude-versus-flatness fight that the world-axis version had is gone.
     *
     * The sweep runs from the very top of the slide — the disc is close and already
     * turning as the first stage is read — and the radius eases back a little as it
     * goes, so it does not read as a turntable. */
    const pass = smoothstep(0, 1, phase);
    const swing = pass * CONFIG.maelSwing;

    /* ...and then, at the very end, it stops orbiting and goes *through*.
     *
     * The dive collapses the orbit into the disc's axis and drives the camera out
     * the far side of the hole. Both terms are in disc-local coordinates, which is
     * the whole reason this is three lines rather than a page of trigonometry: the
     * hole is at the local origin and the axis through it is local z, so "fly
     * through the middle" is just "take the radius to zero and the height past
     * zero". Squaring the ramp makes it accelerate — matter falling into a black
     * hole does not do so at a constant speed, and neither should the camera.
     *
     * The out-of-plane height is what carries it through the hole, so the disc
     * itself rushes past the lens on the way — which is the shot. */
    /* Three ramps, and the order they fire in is the whole shot.
     *
     *  - `onAxis` collapses the orbit radius first, so the camera slides onto the
     *    disc's axis *while still looking at the hole* — the hole grows and centres.
     *  - `through` then drives it along that axis and out the far side, squared so
     *    it accelerates: matter falling into a black hole does not do so at a
     *    constant speed, and neither should the camera.
     *  - `ahead` finally slides the look-target down the axis, and only once we are
     *    nearly through. Held on the origin, the lens would whip through 180° the
     *    instant it crossed the disc plane — suddenly looking back at where it came
     *    from. Slid too early (the first attempt), the camera is still 20 units off
     *    the axis and spends the dive staring at the empty space *beside* the disc.
     */
    const onAxis = smoothstep(0, 0.65, exit);
    /* Cubed, not squared, and starting later. The pacing has to be read against
     * `useSceneVisibility`: the canvas is fully faded by the time this ramp reaches
     * ~0.92, so a plunge that crosses the disc plane at 0.6 (the first attempt)
     * spends a third of the dive looking at an empty void that is still two-thirds
     * opaque. Cubed, the camera hangs in the mouth of the hole while it is still
     * worth looking at, crosses the plane around 0.72 — at ~60% opacity, so the
     * arms are *seen* rushing past — and is out the far side just as the fade
     * finishes taking the scene away. */
    const through = Math.pow(smoothstep(0.15, 1, exit), 3);
    const ahead = smoothstep(0.12, 0.5, exit);

    const maelRadius =
      Lerp(CONFIG.maelOrbitFrom, CONFIG.maelOrbitTo, pass) * (1 - onAxis);
    const eyeZ = Lerp(CONFIG.maelOrbitHeight, CONFIG.diveThrough, through);
    fromDiscFrame(
      this.maelEye,
      Math.cos(swing) * maelRadius,
      Math.sin(swing) * maelRadius,
      eyeZ,
    );

    /* The look-target is defined **relative to the eye**, and that is not a detail.
     *
     * The camera's whole path passes through the middle of the hole — which is the
     * origin — and the origin is exactly where a target fixed on the disc's centre
     * sits. The two coincide mid-dive, `lookAt` is handed a zero-length direction,
     * and the camera's orientation becomes undefined: the frame simply empties. (It
     * did.) Trailing the target a fixed distance *ahead of the eye* down the axis
     * makes that impossible by construction, and it is also what the shot wants —
     * once you are committed to the hole you are looking through it, not back at it.
     */
    fromDiscFrame(
      this.maelLook,
      0,
      0,
      Lerp(0, eyeZ - CONFIG.diveAhead, ahead),
    );

    /* The aimless drift is retired as the flight takes over. Left running, it
     * fights the swing — two lateral movements on the same axis, one of them
     * answering the scroll and one of them not, which reads as a wobble. */
    const drift =
      Math.sin(t * CONFIG.maelDriftRate) * CONFIG.maelDrift * (1 - pass);

    // Blend the three eyes, then the three targets, then the two lenses.
    this.eye
      .copy(this.uniEye)
      .lerp(this.burstEye, t1)
      .lerp(this.maelEye, t2);
    this.eye.x += drift * t2;

    this.look
      .copy(FRAMING.uni.target)
      .lerp(FRAMING.burst.target, t1)
      .lerp(this.maelLook, t2);

    // Parallax, at the blended strength of whichever forms are on screen.
    const px = Lerp(
      Lerp(FRAMING.uni.parallax.x, FRAMING.burst.parallax.x, t1),
      FRAMING.mael.parallax.x,
      t2,
    );
    const py = Lerp(
      Lerp(FRAMING.uni.parallax.y, FRAMING.burst.parallax.y, t1),
      FRAMING.mael.parallax.y,
      t2,
    );
    /* Parallax is released as the camera commits to the dive. A cursor that can
     * still shove the lens sideways while it is falling through an event horizon
     * makes the fall feel optional, which is the opposite of the intent. */
    const held = active * (1 - onAxis);
    this.eye.x += mx * px * held;
    this.eye.y += my * py * held;

    /* The entrance dolly. The camera arrives — it starts further out than any
     * framing calls for and settles in as the galaxy ignites, so the scene reads
     * as something you are falling into rather than something switched on. */
    this.eye.z += (1 - appear) * CONFIG.introDolly;

    this.camera.position.copy(this.eye);
    this.camera.lookAt(this.look);

    /* The disc's lens widens as the camera drops into its plane — the last thing
     * that happens on the page is the frame opening up around you. */
    const maelFov = Lerp(
      Lerp(CONFIG.maelFovFrom, CONFIG.maelFovTo, pass),
      CONFIG.diveFov,
      through,
    );
    const fov = Lerp(Lerp(FRAMING.uni.fov, FRAMING.burst.fov, t1), maelFov, t2);
    if (Math.abs(this.camera.fov - fov) > 1e-3) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }

    this.trackPointerForce(t1, t2, held);
  }

  /**
   * Put the cursor *in* the scene.
   *
   * Screen-space alone is not enough: the cloud is a volume, and a force has to
   * have a position in it. So the cursor is unprojected into a ray out of the lens
   * and pushed along that ray to the depth of whatever the camera is looking at —
   * which is exactly where the form on screen is. The result is a world point that
   * tracks the cursor across the glass and sits *inside* the matter behind it.
   *
   * Must run **after** the camera is placed and its projection matrix rebuilt: the
   * unprojection is only correct against this frame's camera, and the camera moves
   * every frame.
   */
  private trackPointerForce(t1: number, t2: number, strength: number) {
    const f = this.pointerForce;
    const { uni, burst, mael } = CONFIG.pointerForce;

    // The eye's own forward axis — the axis the swirl curls about.
    f.axis.copy(this.look).sub(this.eye).normalize();

    // The cursor's ray, at the depth of the thing the camera is aimed at.
    const depth = this.look.distanceTo(this.eye);
    f.world
      .set(this.pointer.x, this.pointer.y, 0.5)
      .unproject(this.camera)
      .sub(this.eye)
      .normalize()
      .multiplyScalar(depth)
      .add(this.eye);

    // Blended with the morph weights, exactly as the framings are.
    f.radius = Lerp(Lerp(uni.radius, burst.radius, t1), mael.radius, t2);
    f.push = Lerp(Lerp(uni.push, burst.push, t1), mael.push, t2) * strength;
    f.swirl = Lerp(Lerp(uni.swirl, burst.swirl, t1), mael.swirl, t2) * strength;
    f.glow = Lerp(Lerp(uni.glow, burst.glow, t1), mael.glow, t2) * strength;
  }

  /**
   * The exit dive's ramp, 0..1.
   *
   * Keyed off Impact's top, monotonically in scroll — the same shape
   * `useSceneVisibility` uses for the canvas fade, but **leading** it, so the
   * camera is already falling through the hole by the time the opacity starts
   * taking the scene away.
   */
  private exitRamp(): number {
    const impact = scrollState.slideRange[screens.IMPACT];
    if (!impact) return 0;
    const { scrollY, vh } = scrollState;
    const past = scrollY + vh * CONFIG.diveLeadVh - impact.top;
    return clamp01(past / Math.max(1, vh * CONFIG.diveSpanVh));
  }

  /* ------------------------------------------------------------------- frame */

  render() {
    const isLoaded = scrollState.activeScreen !== screens.NONE;

    /* Preloader: the warp runs until the first scroll state arrives, then the
     * streaks stretch out, the field fades, and the object leaves the scene. */
    if (this.preloader.state.alive) {
      this.preloader.render(isLoaded ? { destroy: true } : {});
    }

    /* The entrance is armed when the preloader clears, not at construction: it
     * owns the screen for several seconds, and a galaxy igniting behind it would
     * play out entirely unseen. */
    if (this.appearStart === null && isLoaded) {
      this.appearStart = performance.now();
    }

    const elapsed =
      this.appearStart === null ? 0 : (performance.now() - this.appearStart) / 1000;
    // Cubic ease-out: most of the arrival happens early, then it settles.
    const appear = 1 - Math.pow(1 - clamp01((elapsed * 1000) / CONFIG.appearMs), 3);

    const { t1, t2, dive, burstPhase } = this.weights();
    // Mirror the morph weights so the Composer can blend its per-scene bloom.
    scrollState.morphT1 = t1;
    scrollState.morphT2 = t2;

    /* Where we are *within* the roadmap slide — 0 at its top, 1 once its 2.5
     * viewports are scrolled through. It drives the disc's flight and its colour.
     * Local progress, not a clock: scrolling back up flies the camera back out,
     * which is the whole reason the scene answers scroll at all. */
    const phase = scrollState.slideLocalProgress[screens.ROADMAP] ?? 0;

    /* The last movement on the page: the camera stops orbiting the disc and flies
     * through the hole it has been circling. See `CONFIG.diveLeadVh`. */
    const exit = this.exitRamp();

    this.trackPointer();
    this.flyCamera(t1, t2, dive, appear, phase, exit, burstPhase);

    /* The logo mark takes over from the disc at Impact, in this same scene: the
     * cloud dissolves as the mark assembles at the origin — the hole the camera
     * has just dived into — so it is one continuous scene, not an overlay. Driven
     * by scroll into Impact, so scrolling back up dissolves the mark and brings
     * the disc back. */
    const logoAmt = this.logoRamp();
    const time = performance.now() / 1000;

    this.starfield.render({ appear });
    this.morph.render({
      t1,
      t2,
      appear,
      uniTime: elapsed,
      maelPhase: phase,
      dissolve: smoothstep(0.15, 0.9, logoAmt),
      pointer: this.pointerForce,
    });
    this.logoMark.render({
      camera: this.camera,
      assembly: logoAmt,
      alpha: clamp01(logoAmt * 1.6),
      time,
    });
  }

  /**
   * The logo assembly ramp, 0..1, keyed off Impact's top (monotonic in scroll).
   * It leads the camera's arrival at the hole so the mark is forming as the eye
   * dives in, and holds once assembled.
   */
  private logoRamp(): number {
    const impact = scrollState.slideRange[screens.IMPACT];
    if (!impact) return 0;
    const { scrollY, vh } = scrollState;
    const past = scrollY - impact.top;
    return clamp01((past + vh * CONFIG.logoLeadVh) / (vh * CONFIG.logoSpanVh));
  }

  resize() {
    this.preloader.resize();
    this.starfield.resize();
    this.morph.resize();
  }
}

export default Controller;
