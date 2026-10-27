---
tags: [meta, decision]
updated: 2026-07-15
---

# Decisions Log (ADRs)

Architecture Decision Records. Each entry captures a choice, its context, and its
consequences. Use [[templates/adr-note]] for new entries. Newest first.

---

## ADR-0044 — Reduced motion / energy-saver freezes the scene on a still frame

- **Status:** Accepted
- **Date:** 2026-07-15

**Context.** `<ReducedMotion>` (`components/common/reduced-motion.tsx`) only flips
react-spring's global `skipAnimation` — DOM springs and the text engine jump to their
end state, but the WebGL scene is not react-spring and kept running its full flight
regardless. On a phone in Low Power Mode that continuous render is exactly what drags
the whole page down, and it also ignores a user who explicitly asked for less motion.

**Decision.** The scene reads its own motion signal (`sceneShouldFreeze()` in
`lib/scene/device.ts`) and, when set, **plays the entrance once and then stops
drawing**. WebGL keeps the last presented frame on the canvas, so the scene settles to
a still image that costs nothing on scroll or idle — the standard render-once pattern.
It trips on `prefers-reduced-motion: reduce` (any device — an accessibility promise) or,
on mobile, an energy-saver heuristic: `navigator.connection.saveData` or
`navigator.deviceMemory ≤ 2` (the nearest web-exposed proxies for iOS Low Power Mode,
which has no API). The ticker subscription in `scene.tsx` keeps rendering until the
loader hands off plus a short settle window (`FREEZE_SETTLE_MS`), so the frozen frame is
a fully-formed galaxy, then sets a `frozen` flag that early-returns every subsequent
tick.

**Consequences.** Reduced-motion users and constrained phones get the look without the
ongoing cost. If the loader never signals loaded the scene simply keeps rendering (safe
fallback, no worse than before). The frozen frame sits at the hero framing — the
scroll-driven scene choreography does not play under reduced motion, which is the
intended trade. Freeze is decided once at mount; a user toggling the OS setting mid-
session is not picked up until reload (acceptable).

---

## ADR-0043 — The mobile scene is a fill budget, not a vertex budget

- **Status:** Accepted
- **Date:** 2026-07-15

**Context.** "Optimise the scene for mobile" reads like *do the transforms on the GPU
and cut the particle count* — but every per-particle transform was already in a vertex
shader (morph blends three forms per-vertex, the warp lifecycle is a `fract()`, the
starfield/logo drift per-vertex), and there is zero per-particle CPU work per frame. The
code's own comments say it repeatedly: these scenes are **fill-bound**. What actually
costs on a phone is fragments — additive halos, overdraw, full-screen post — multiplied
by the render resolution.

**Decision.** Spend the mobile budget on fill, not on vertex count:

- **No MSAA on touch** (`canvas3d.ts`) — multisampling a soft additive point cloud on a
  dense display is antialiasing a blur; keep it on desktop for the hard warp streaks.
- **Skip the bloom pass when strength ≈ 0** (`Composer.ts`, `pass.enabled`). Default
  strength is 0, so on every unmodified session a full-screen down/up-sample chain was
  running each frame for nothing — the largest single win, and it helps every tier.
- **Mobile DPR 0.85×** (`MOBILE_MAX_DPR` in `device.ts`), down from a 1.0 cap — the
  canvas is a decorative background and the sprites are soft, so ~30% fewer fragments is
  invisible on the cloud.
- **Cut mobile counts** ~40–50% (morph, starfield, logo motes) — a secondary win (fewer
  sprites → fewer additive fragments), not the main one. The **foreground logo mark** is
  a special case: it holds a fixed on-screen size (`FRONT_DISTANCE`), so the untiered
  ~20k count packed into a phone's smaller area and the additive sprites saturated to a
  solid white blob rather than the mark's outline — it is tier-scaled hard (`COUNT_SCALE`
  mobile `0.38×`), and its point size is halved on mobile too (`MARK_SIZE_SCALE` `0.5×`)
  so the thinner count reads as a fine outline, not a chunky one.
- `powerPreference: "high-performance"` to bias toward the discrete GPU where offered.

**Consequences.** The phone render is materially cheaper without changing the look on
desktop, and the "already on the GPU" fact is now documented so the next person doesn't
go hunting for CPU transforms to move. Levers are all named constants/tier tables. The
deeper cut for the truly constrained device is not to scale these further but to stop
rendering entirely — see ADR-0044.

---

## ADR-0042 — The warp streaks are quads, not `gl.LINES`

- **Status:** Accepted
- **Date:** 2026-07-15

**Context.** The preloader warp (`objects/warp.ts`, ADR-0031) was drawn as a
`THREE.LineSegments` — one draw call, two vertices per streak. In software WebGL it
read as intended: comet trails rushing the lens. On real GPUs it read as **a field of
loose pixels**. The cause is geometric, not a bug in the lifecycle: a warp points its
streaks nearly straight down the view axis, so perspective foreshortens most of them
to only a few pixels of *screen* length, while their alpha is concentrated at the head
(`pow(vEnd, …)`). A `gl.LINES` primitive is always exactly **one device pixel wide**,
and a hardware rasteriser turns a short, head-weighted 1px segment into a single lit
pixel — the head, with the tail below the coverage threshold. SwiftShader's softer line
AA had been hiding this the whole time.

**Decision.** Give each streak a real, resolution-independent body: expand it into a
**camera-facing quad** (four verts, two triangles, indexed — still one draw call). The
vertex shader projects the streak's head and tail to clip space, takes the screen
direction between them, and offsets the quad's two long edges by a fixed pixel
half-width (`uWidth`, converted through `uResolution`), so the width is constant in CSS
pixels regardless of depth or device pixel ratio. The fragment shader adds a soft
across-the-body falloff (`1 - |vSide|`) on top of the existing head→tail gradient.
Material is `DoubleSide` — a billboarded quad's winding is arbitrary and additive
streaks have no back to cull.

**Consequences.** The warp reads as comets on every GPU, not just in software. Fill
cost is up (triangles vs. lines) but negligible at 1400 streaks over the ~2s the loader
lives. `uWidth`/`uResolution` are the knobs for streak weight; `resize()` must keep
`uResolution` in sync with the viewport. The general lesson — **`gl.LINES` width is not
portable; anything that must have visible thickness is a quad** — already applies to
`morph.ts` (points impersonating the burst's filaments, ADR-0036).

---

## ADR-0041 — Scope the Tailwind scanner; pin the Turbopack root

- **Status:** Accepted
- **Date:** 2026-07-14

**Context.** The build was clean-but-noisy: three warnings that were harmless yet
easy to mistake for real breakage. (1) Tailwind v4 auto-detects source content
across the whole project, so it scanned the `obsidian/` vault — prose that
*documents* Tailwind syntax, including the literal `bg-[image:var(…)]` examples from
the dead-gradient fix (see [[changelog]] 2026-07-12). The scanner took those as real
utilities and emitted invalid CSS (`background-color: var(…)`), producing two
"Unexpected token" warnings. (2) A stray `package-lock.json` in a parent directory
made Next infer the wrong workspace root for Turbopack.

**Decision.** Draw a hard line between *source* and *documentation* for the Tailwind
scanner, and pin the build's roots explicitly rather than relying on inference.

- `@source not "../../obsidian"` in `app/globals.css` — the vault is prose, never a
  source of class names.
- `turbopack.root` set to this project's directory in `next.config.ts`.
- Defence in depth: JSX comments must not contain literal arbitrary-value class
  syntax, since component files *are* scanned. Reworded `logo-mark.tsx` accordingly.

**Consequences.** `yarn build` is warning-free. New docs may freely quote Tailwind
class syntax without corrupting the compiled CSS. If documentation is ever moved out
of `obsidian/`, revisit the `@source not` path.

---

## ADR-0040 — Idle motion sways; it never rotates

- **Status:** Accepted
- **Date:** 2026-07-12

**Context.** The galaxy's camera drifted with `angle = t × rate` — an unbounded
rotation. It looks right for the first minute and is wrong forever after: the eye
keeps going, walks all the way around the galaxy, and a viewer who has sat on the
hero for a few minutes is looking at a framing nobody chose. The burst's idle clock
had the same shape, and was worse — added on top of a *scroll-driven* orbit, it meant
the same scroll position gave a different composition depending on how long the page
had been open.

**Decision.** **Any motion driven by the clock rather than by scroll must be
bounded.** A sine, not a ramp. The camera sways a few degrees either side of its
composed framing and always comes home.

The composed framing is a designed thing; an idle animation has no business
*arriving* anywhere. Its job is to keep the scene breathing, not to relocate it. So:

- clock-driven → `sin(t × rate) × amplitude` (bounded, returns);
- scroll-driven → monotonic in scroll (goes somewhere, and comes back when you do).

Scroll owns *where the camera is*; the clock owns only *that it is alive*.

**Consequences.** `uniOrbit`/`burstOrbit` are now `uniSway`/`burstSway` with a rate
and an amplitude. (`uniRise` was always a sine and was always fine — which is the
tell.) The disc's `maelSpin` is exempt and correctly so: that rotates the *object*,
and an accretion disc that stops turning is wrong. The rule is about the *camera*.

---

## ADR-0039 — The scene exits by flying *through* the hole, not by fading

- **Status:** Accepted
- **Date:** 2026-07-12

**Context.** Below the roadmap there is no scene — Impact and the footer are UI on a
plain background — so `useSceneVisibility` faded the canvas out and that was that.
It threw away the one shape the whole roadmap had been building toward: a hole.

**Decision.** The camera's last movement is to stop orbiting the disc and **fly
through the event horizon**. The orbit radius collapses onto the disc's axis, the
eye accelerates along it and out the far side, the lens flares to 104°, and the fade
finishes on a camera that is already in the black.

All of it is expressed in the disc's own frame (ADR-0037), which is why it is a few
lines rather than a page of trigonometry: the hole is at the local origin and the
axis through it is local z, so "fly through the middle" is just *take the radius to
zero and the height past zero*.

**Two things had to be got right, and both were got wrong first:**

1. **The look-target must be defined relative to the eye, not to the disc.** The
   camera's path passes through the origin — which is exactly where a target fixed
   on the disc's centre sits. They coincide mid-dive, `lookAt` receives a zero-length
   direction, the orientation becomes undefined, and **the frame simply empties**.
   Trailing the target a fixed distance *ahead of the eye* down the axis makes that
   impossible by construction, and is also what the shot wants.
2. **The pacing must be read against the fade.** `useSceneVisibility` has the canvas
   fully transparent by ~0.92 of this ramp, so a plunge that crosses the disc plane
   at 0.6 spends a third of its length looking at an empty void that is still
   two-thirds opaque. Cubed and started later, the camera hangs in the mouth of the
   hole while it is still worth looking at, crosses the plane at ~60% opacity — so
   the arms are *seen* rushing past — and is out the far side as the fade lands.

**Consequences.** The dive leads the fade deliberately (`diveLeadVh` 2.0 against the
fade's 0.85). If either ramp is retuned, retune the other: they are one shot.

---

## ADR-0038 — The cursor is a body in the scene, not a parallax offset

- **Status:** Accepted
- **Date:** 2026-07-12

**Context.** The pointer only ever moved the *camera* (parallax, and the burst's
orbit angle). The matter itself never knew the cursor existed.

**Decision.** Give the cursor a position **in the world** and let it act on the
cloud. It is unprojected into a ray out of the lens and pushed along that ray to the
depth of whatever the camera is aimed at — which is where the form on screen is — so
the result is a world point that tracks the cursor across the glass and sits *inside*
the matter behind it. `Morph` then, within a Gaussian falloff of it:

- **pushes** the cloud out of its way;
- **swirls** it tangentially about the view axis. This is the one that matters: a
  pure radial push reads as a dent being poked in a sheet, and the stir is what makes
  it read as *matter being disturbed*;
- **excites** it — the points it touches burn brighter, so the cursor leaves a wake
  of light rather than a hole.

**Consequences.**

- **Sized per form, and blended with the morph weights** exactly as the framings are.
  A radius that is a firm shove through a galaxy 14 units across is an invisible
  pinprick in a disc 48 wide.
- **Gentle, and that is not timidity.** The first values were three times stronger and
  *evacuated the burst*: the cursor sits at the depth of whatever the camera is aimed
  at, which for a radially symmetric form is its core — so a push that seemed
  reasonable in the abstract emptied out the exact point every filament converges on
  and left a hollow shell. The cursor should let you feel that it is there, not let
  you delete the scene with it.
- Zero on touch (`hasPointer`), and released as the exit dive commits — a cursor that
  can still shove the lens sideways while it is falling through an event horizon makes
  the fall feel optional.
- The falloff is Gaussian on purpose: a hard cutoff pops visibly as points cross it.

---

## ADR-0037 — Orbit the disc in the disc's frame, not the world's

- **Status:** Accepted
- **Date:** 2026-07-12
- **Supersedes:** the camera half of ADR-0033

**Context.** Every version of the roadmap flight so far has circled the maelstrom
about the **world y axis**, and every one of them has run into the same wall,
recorded twice as "the tilt trap": the disc is raked 0.95 rad, so swinging the
camera about y is not an orbit of the disc at all — it swings the eye *in and out of
the disc plane*. The face opens, then foreshortens into a blade. Every attempt to
widen the swing had to be paid for by dropping the camera further, and the whole
thing was a running trade of amplitude against flatness.

**Decision.** Build the orbit in the **disc's own frame** and rotate it out into the
world through the same tilt the disc's points go through (`fromDiscFrame` in
`Controller`, `MAEL_TILT` exported from `morph.ts`).

Put the eye at a fixed height *out of* the disc plane and circle it there. Then
`n · eye` is that height for every azimuth, by construction — so the elevation above
the disc (~28°) is **constant for the entire sweep**. It cannot graze the plane,
whatever the azimuth does.

**Consequences.** The trade-off simply stops existing. The swing goes from 1.15 rad
to 2.6 (~150°) with no flattening to pay for, and the camera can now open the flight
*close* — the disc fills the frame the moment the roadmap lands and the move is the
orbit itself, not an approach to one. The world-y `maelHeightFrom` / `maelHeightTo` /
`maelApproach*` knobs are gone; the flight is `maelOrbitFrom` / `maelOrbitTo` /
`maelOrbitHeight` / `maelSwing`.

**The general lesson.** When a camera move fights the object it is moving around,
check which frame the move is written in before tuning it. Two of these ADRs were
spent tuning inside the wrong one.

---

## ADR-0036 — The middle form is a plasma burst, and points impersonate lines

- **Status:** Accepted
- **Date:** 2026-07-12

**Context.** The middle form is replaced by `getlayers-scenes/plasma-burst.html` —
a white-hot core erupting into hundreds of curling filaments. The source draws
those filaments as `LineSegments`. This scene is a single `THREE.Points` whose
every particle carries all three forms (ADR-0028), and **a point cannot morph into
a line.**

**Decision.** Rebuild the burst as points strung *along* the filaments. The buffer
was already shaped for it — it is arms × points-per-arm, laid out that way for the
maelstrom's spiral, and a filament is just another kind of arm. The curve is the
source's exactly, resolved on the CPU (it is static); only the snaking sway is left
to the shader, and its two cross-axes are rebuilt from the point's own direction
rather than stored, which saves 24 bytes a point across a 120k cloud.

**Three things had to be true for a point cloud to pass as lines**, and each of
them cost an attempt to find:

1. **The sprites must be big enough to touch.** `gl_PointSize` is
   `size × resolution / 1000 / distance`, and at 15 units out a size of 9 — which
   *sounds* like a thin thread — resolves to 0.8px and clamps to the 1px floor.
   Every filament rendered as single-pixel dust and the whole form came out as a
   fuzzy ball. At 44 the sprite is ~3px against a ~1.7px point spacing, so a
   filament overlaps itself into a continuous line. **This is the whole trick.**
2. **The tips must stay lit.** The source fades them to 0.14 of the root, which is
   right for lines (a line always covers its pixels) and fatal for points (the tip
   points are also the sparsest on screen). Fading them out leaves only the crowded
   middle: a ball, again. 0.42.
3. **The filaments must not all be lit equally.** 520 evenly-lit strands is a
   sphere of dust — the eye resolves the average, not the structure. Weighting them
   hard per filament, so only the top third carries the light, leaves clean strands
   with actual silhouettes against a faint haze of the rest. The dark ones then fall
   under the vertex-shader brightness reject (ADR-0035) and cost nothing.

**Amendment (same day) — curl is the wrong instrument for crowding.** The first fix
for (3) was to *snake the filaments harder* (curl 0.62 → 0.95), on the reasoning that
strands which writhe are easier to tell apart than strands which run parallel. It
does separate them, and it destroys the thing that makes the reference read: **you
have to be able to see the lines leave the centre.** At that curl a strand loses its
radial direction within a fraction of its length, the filaments cross each other
constantly, and the burst reads as turbulence rather than as an eruption. Crowding is
a *density* problem and the per-filament brightness weighting is the instrument for
it — fix it there and the curl goes back down to the source's own restraint (0.5),
where a strand leaves the core along a ray, wanders a little, and keeps going.

**Consequences.** `plume.html` is gone from the scene. The burst is radially
symmetric, which makes it far easier to frame than the column it replaces — every
angle is a good angle, and its core lands in the empty centre column the chapter
ledger was designed around. Its scale still obeys ADR-0032: framed against the
*median* filament (~8 units), not the rare long tendrils that run four times
further.

---

## ADR-0035 — The scene's budget is fill, so optimise sprite area — never counts

- **Status:** Accepted
- **Date:** 2026-07-12

**Context.** The scenes grew a lot (ADR-0032/0033) and the obvious lever for
performance is the particle count. It is the wrong one: measured, the **hero is the
slowest frame on the page**, and the hero is the one form whose vertex path has no
domain-warp in it. The cost is fragments, not vertices — 120k additive sprites, each
one a soft halo, all blending with depth-testing off.

**Decision.** Optimise the fragments and leave the counts alone, so the look is
preserved exactly. Four changes, each of which does strictly less work for
provably identical output:

- **The starfield's sprites had no upper size clamp at all.** Its dust hangs in a
  slab *around* the camera, so a mote drifting a couple of units off the lens drew
  a sprite hundreds of pixels across — full-screen additive fill from a single
  vertex, several times over, on a camera that now flies. Clamped (44px dust,
  10px stars). The bokeh look survives; the pathological worst case does not.
- **The corner wash ran its 18-trig domain warp on every pixel**, then multiplied
  most of them by a corner mask of zero. The mask is now evaluated first and the
  warp skipped where it cannot show. Same output, and the great majority of a frame
  no longer pays for a value it throws away.
- **Points that are invisible are clipped in the vertex shader** rather than being
  rasterised and then discarded a pixel at a time. Much of the cloud is dark at any
  instant by design (the galaxy fades each star over its life, the plume fades its
  specks in and out, everything is scaled by the entrance alpha). The threshold is
  below 1/255 of a channel and the blending is additive, so these points *cannot*
  change a pixel.
- **The sprite ceiling comes down 24px → 15px**, and each form's brightness pays
  back what it lost. Sprite area is quadratic in that number, and the points it
  binds on are the nearest ones — which are also the ones that pile up into the
  blown-out white cores.

**Consequences.** Do not reach for the particle counts. They are the wrong knob and
they are the one knob that *does* change the look. If a scene needs to get cheaper,
the questions are: how big are its sprites, how many of them are invisible, and how
much of the frame is being shaded for nothing.

**On benchmarking.** The headless verification harness runs on SwiftShader (a
software rasteriser) with ±30% run-to-run variance, which is enough to see a
pathological case but *not* enough to attribute a 10% delta. Every change above is
justified structurally — strictly less work, identical output — and not by a
measured number. Do not quote frame times from that harness as if they were real.

---

## ADR-0034 — Contrast belongs to the scene scrim, not to the sections

- **Status:** Accepted
- **Date:** 2026-07-12

**Context.** The scenes used to be modest objects in the middle distance, and a
vertical vignette over the canvas was enough to hold the header and the CTAs. They
are not that any more — the plume fills the frame, the disc sweeps across it — and
every section's copy is now set directly on top of moving, additive light.

**Decision.** The copy gets a darkness to sit on, and that darkness lives in exactly
one place: `.scene-overlay`. **No section gets a plate, panel, card or backdrop.**

The scrim darkens the two *edges* of the frame. That is not a compromise, it is the
observation that makes the whole thing work: every section's copy lives at the edges
(the hero's masthead and brief, the chapter ledger's two columns, the roadmap's
rail) and every scene's subject lives in the middle (the galaxy's core, the plume's
spine, the event horizon). The two do not compete for the same pixels, so the middle
of the frame can be left completely untouched and the scene loses nothing anyone was
meant to be looking at.

On a phone that logic collapses — the text spans the full width, so there are no
edges to hide it in — and the horizontal pass is replaced by a flat wash with a
deeper vertical vignette.

**Consequences.** One knob for the whole page's legibility. If copy is hard to read
over a scene, change the scrim; adding a background to a section is how a site that
is one continuous space turns into a stack of boxes floating over a wallpaper.

---

## ADR-0033 — The roadmap flies the disc, and it is the only place the palette moves

- **Status:** Accepted
- **Date:** 2026-07-12

**Context.** The roadmap is 2.5 viewports of stages sliding past, and it is the
only form the viewer *stays* with — the galaxy and the plume are both transitions.
The camera was parked at a fixed framing for all of it, drifting on a clock. So the
one section where the viewer dwells was the one section where nothing happened.

**Decision.** The maelstrom gets a flight of its own, driven by
`scrollState.slideLocalProgress[ROADMAP]` — **local progress, not a clock**. Scroll
down and you fly in; scroll back up and you retreat. A timed animation could not do
the second thing, and it is the whole reason the scene answers scroll at all.

Two overlapping movements, and one colour move:

- **Approach** (0 → 0.45): a dolly from 46 units out to 30. The "falling toward it"
  beat.
- **Pass** (0.35 → 1): the camera swings 0.9 rad around the disc and drops below the
  origin, while the lens widens 58° → 74°.
- **Heat**: `uMaelPhase` widens the lensing crescent (~1.5 → ~2.4 rad of arc) and
  burns it harder, and warms the arms off the cold accent blue. This is the *only*
  colour animation in the scene, and it is spent at the one moment the viewer is
  closing on something. The arms warm toward a pale blue, **not** toward the pink —
  warm both and the disc flattens into one magenta plate, which is exactly what the
  palette's scarcity rule (ADR-0029) exists to prevent.

**Consequences — the tilt trap.** The disc is tilted 0.95 rad about x, so its plane
normal has a *negative* y component: **raising the camera swings it toward edge-on,
and dropping it opens the disc's face.** The first pass at this flight took the eye
down to y = 4.5 on a 1.35-rad swing, which landed it almost exactly in the disc
plane — the spiral foreshortened into a single blown-out blade and the event horizon
left the frame. The pass now ends *below* the origin and swings less far, and
elevation above the plane actually *opens* from ~20° to ~26° as the camera closes.
`morph.ts` `maelTilt` records the same hazard from the other direction.

The disc's aimless lateral drift is faded out as the pass takes over: two lateral
movements on the same axis, one answering scroll and one not, read as a wobble.

---

## ADR-0032 — Scale is framing, not just size

- **Status:** Accepted
- **Date:** 2026-07-12

**Context.** The brief was "make the plume 3× bigger, make the disc 2× bigger, so
they cover the screen". Tripling `plumeScale` and doubling the maelstrom's radii
was the easy half. The plume then rendered *smaller* than before — twice, across
two attempts — because each time the camera was pulled back far enough to keep the
whole object in shot.

**Decision.** An object's size on screen is set by the camera, and the camera is
framed against the part of the object that is **actually bright**, not against its
bounding box.

- The plume's mass is its upper body; its base is a dim, sparse mound by
  construction (brightness is gated on height). Framed to fit the *whole* 46-unit
  column, the ~20 units you can see sit in the middle of the frame with black all
  round them. The camera now stands inside the column's lower half and looks up,
  and the column runs off the top, the bottom and both sides.
- The maelstrom is the mirror image: its camera did **not** move, and that is what
  makes a doubled disc twice as large on screen.
- Coverage also came from **widening** (`plumeWidthGrow`, `plumeBillow`), not from
  scale. A column three times the size, framed three times as far back, is the
  same column. Smoke thrown sideways out of its silhouette is what fills a frame.

**Consequences.** The plume's orbit radius now has a hard floor: the ground flare
reaches ~19 world units, and an orbit inside that puts the camera bodily in the
smoke. There is no automatic fit — every framing in `Controller.FRAMING` is tuned
against a specific form at a specific scale, and changing a form's size means
re-shooting its framing. Verified in-browser at 1440×900 and 390×844.

---

## ADR-0031 — The preloader is a warp tunnel, and the galaxy arrives already formed

- **Status:** Accepted
- **Date:** 2026-07-12

**Context.** The load sequence read as two unrelated events: rain falling
(`objects/trails.ts`), and then a galaxy slowly painting itself into existence over
six seconds while the viewer was already reading the hero.

**Decision.** Make the load the *flight into* the scene that follows it.

- **`objects/warp.ts`** replaces `trails.ts`. Streaks fly at the lens down the z
  axis; perspective alone fans them out from the vanishing point. The load
  percentage **is** `uBoost` — the tunnel visibly winds up as the number climbs —
  and `uSurge` breaks the warp on destroy, stretching the streaks out as the field
  fades and hands the screen to the galaxy.
- **The galaxy's clock is primed one full lifetime** (`CONFIG.uniPrime`). Every
  point has ignited by the first frame, so the arms are drawn at full length
  immediately. The entrance is carried by the camera's dolly and the alpha
  envelope, which is where an entrance belongs; the matter is simply already there.
- The hero camera comes in from z = 15 to z = 12 on a wider 52° lens, so the disc
  overruns the frame rather than sitting politely inside it.

**Consequences.** The "galaxy paints itself" entrance recorded in ADR-0028 is gone
by design — it was an entrance nobody was in place to watch. The preloader contract
is unchanged (`events.LOADING` percent → `events.LOADER_DESTROY`), so `<Scene>` and
`useSections` did not move. Each streak accelerates along its own run (`life²`);
held linear, perspective foreshortening eats the sense of speed and the field reads
as drift.

---

## ADR-0030 — `three` is an explicit dependency, pinned to 0.162

- **Status:** Accepted
- **Date:** 2026-07-12

**Context.** The whole WebGL scene imports `three`, and `three` was not in
`package.json` at all — it had been installed ad hoc and never declared, so a
clean `yarn install` produced a repository that could not typecheck or build. On
adding it, the current release (0.180) fails immediately: `lib/scene/canvas3d.ts`
is built on `THREE.WebGL1Renderer`, which was removed in r163.

**Decision.** Declare `three` and `@types/three`, both pinned to **0.162.0** — the
last release that still ships `WebGL1Renderer`.

**Alternative considered.** Move to a current `three` and swap `WebGL1Renderer` for
`WebGLRenderer`. Three does transparently compile our GLSL ES 1.00 shaders on a
WebGL 2 context, so this would very likely work — but it silently changes the
rendering path of vendored code nobody has reviewed against WebGL 2, and it is not
this change's job. Pinning preserves the existing behaviour exactly.

**Consequences.** The renderer logs a deprecation warning on every boot ("WebGL 1
support was deprecated in r153"), which is expected and harmless. Upgrading `three`
is now a deliberate, separately-testable piece of work: it means porting
`canvas3d.ts` to `WebGLRenderer` and re-verifying every shader on a WebGL 2
context. Until then the pin is load-bearing — do not float it.

---

## ADR-0029 — Deep blue with pink signal accents, replacing the emerald ramp

- **Status:** Accepted
- **Date:** 2026-07-12

**Context.** The new scene (ADR-0028) is a deep-space one: a galaxy, a plume, a
black hole. The emerald accent ramp was chosen when the scene was a forest — an
"accent-900 forest black-green the scenes sit inside" (ADR-0025). Green UI over a
blue-black void has nothing to sit inside; it reads as a second, unrelated brand.

**Decision.** Retone the whole ramp in `globals.css` to **deep blue**
(`accent-900` `#030716` → `accent-200` `#d6e2ff`, with `accent-500` `#3a5cff` the
signature), and swap the signal greens for **pink** (`signal-glow` `#ff5fa8`,
`signal-ring` `#ff8fc4`). `--background` follows to `#02040d`.

The scene and the UI move together, and the tokens stay the only currency
(ADR-0004): no component changed, because none of them ever held a colour. The
one manual step was the handful of `box-shadow`/`gradient` tokens that spell their
channels out as `rgb()` triplets, because CSS cannot take an alpha off a hex token.

**Pink is deliberately scarce.** It is the *only* non-blue hue on the page, so it
has to keep meaning "hot". In the scene it appears in exactly three places — the
galaxy's rarest ~6% of stars, the plume's white-hot tip (gated on height *and* on
the spine, because keyed on brightness alone it bleeds down the whole column and a
pink column is not an accent), and the maelstrom's lensing crescent. In the UI it
carries the CTA glow and the sitemap ring.

**Consequences.** `lib/scene/palette.ts` mirrors `:root` and must be kept in step —
shaders cannot read CSS custom properties. The `FinalPass` corner wash needed no
change: it already reads `accent900`/`accent700` through the palette, so it turned
blue on its own.

---

## ADR-0028 — The scene is one point cloud in three forms, and it flies the camera

- **Status:** Accepted
- **Date:** 2026-07-12

**Context.** The brief was for the hero to "immersively appear" as `universe.html`,
then "immersively transform" into `plume.html`, and then into `maelstrom.html` on
scroll. The obvious implementation — three scene objects, crossfaded — satisfies
the words and none of the intent: a crossfade is two things, one disappearing while
another appears. A transformation is *one* thing, changing.

All three source scenes are additively-blended point clouds. That is the whole
opening.

**Decision.** One `THREE.Points`. Every particle carries the parameters of **all
three forms** — a galaxy ellipse, a plume height/angle/radius, a spiral-disc
position — and the vertex shader blends between them under two scroll-driven
weights, `uT1` (universe → plume) and `uT2` (plume → maelstrom). A speck that was a
star becomes a mote of smoke and then a grain in the accretion disc. It is the same
matter, rearranged. `objects/morph.ts`.

Three things make it read as a transformation rather than a lerp:

- **Stagger.** Each point crosses over at a slightly different time, so the change
  sweeps through the cloud as a wave instead of snapping as one.
- **Arc and swirl.** A straight lerp sends every particle along its shortest path
  and the cloud visibly flattens through the midpoint. The arc bows each path
  outward; the swirl shears the cloud about the vertical — the axis all three forms
  already turn on. Both vanish at either end, so both endpoints stay exact.
- **A mid-transition brightness boost.** Additive glow is a density effect, and the
  arc deliberately thins the cloud — so the morph dimmed exactly where it should be
  most dramatic. The boost pays back a known cause; it is not a fudge factor.

**And the camera is flown.** Every previous scene object left the shared camera
parked at z = 3 and moved its own group, because the objects were positioned against
each other (ADR-0026). Nothing is left to position against — `Morph` is the only
thing in the scene with a shape. So the three forms keep the world scales their
sources were composed at (a galaxy ~7 units across, a column 15.5 tall, a disc 24
wide) and the camera travels between the three framings, blending position, look-at
and **FOV** (45° over the galaxy → 60° over the disc). `Controller` owns the path.

**Consequences.**

- The point count is shared, and the **maelstrom sets it**: its spiral only reads if
  the points are laid along filaments, so the budget is arms × points-per-arm
  (~120k desktop). The galaxy therefore runs at ~6× the density its source assumed.
- **That density is why the whole scene is retuned far darker than its sources.**
  Each source drives its points to a peak intensity of ~13, ~200 and ~1.1
  respectively — deliberately, because each was composed against a near-white ramp
  and *wants* to blow out. Under additive blending anything over 1 clips to white,
  so on a cloud this dense **brightness is not a brightness control, it is a hue
  control**: held at the source values, all three forms render as solid white plates
  with no blue left in them. Every form is now tuned to a per-point peak of roughly
  0.2–0.45. A lone speck reads blue; white is reserved for where the cloud actually
  crowds, which is where a blow-out means something. (`vortex.ts` had reached the
  same conclusion before it was retired — the trap is worth naming twice.)
- **The galaxy's ignition spread must be exactly one lifetime.** Every point ages at
  the same rate, so the spread of ignition *is* the spread of ages, forever. Below 1
  the cloud stays bunched into a band of the life cycle — born together, drifting out
  together, dying together — and the galaxy renders as a hollow ring pulsing outward
  rather than a disc.
- The morph weights are keyed off the **distance between slide tops**, not off
  `sceneProgress`, whose triangular kernel cannot tell arriving from leaving and
  would run the morph forward and then straight back.
- **Retired:** `objects/vortex.ts`, `objects/tree-of-life.ts`, `objects/6.ts`
  (terrain), `objects/points.ts` + `common/flypointpass.ts` (the flying-points layer
  — redundant against the new cloud and its starfield, and it was anchored to a
  camera that now moves), and `extensions/Controls.ts` (an `OrbitControls` built with
  every interaction disabled whose `update()` was never called, so it wrote to the
  camera exactly never).
- The preloader (`objects/trails.ts`, since replaced by `objects/warp.ts` — see
  ADR-0031) is now a **child of the camera**. It was always meant to hang a fixed
  distance in front of the lens — it just used to get that for free, back when the
  lens never moved.
- `Camera.far` goes 80 → 600: the starfield sits on a shell up to 230 units out while
  the camera hangs back at 44 over the disc. Scene fog is removed — it was
  `Fog(0, 15)`, which no material here ever consumed (fog only reaches materials that
  declare it, and these are all raw `ShaderMaterial`), and which is now actively wrong
  rather than merely inert.

---

## ADR-0027 — The tree's reveal is coupled to scroll, not to a clock

- **Status:** Accepted
- **Date:** 2026-07-12

**Context.** `tree-of-life.html` grows its tree from the roots up on a 2.6-second
timer: `uGrow` ramps 0 → 1.25 from the moment the scene is constructed, and the
shader lights each point once `uGrow` passes its height fraction. Lifted verbatim
into a scrolling page, that timer starts when the *scene* is built — several
slides and many seconds before the chapters section is anywhere near the
viewport — so the tree would be fully grown and simply *there* by the time you
arrived. The brief asked for it to "immersively appear".

**Decision.** Drive `uGrow` from the section's **enter ramp** instead of elapsed
time: `uGrow = easedIn * GROW_TRAVEL`. The tree grows in step with the scroll —
roots, then trunk, then branches, then canopy — and it is the scroll that grows
it, not a clock that happens to be running.

**Consequences.**

- The reveal is **scrubbable**: scroll back up and the tree un-grows. This is the
  point, not a side effect; it ties the section's one big gesture to the input.
- `GROW_TRAVEL` overshoots to 1.3 rather than stopping at 1.0. The shader's reveal
  edge runs from `uGrow - 0.05` to `uGrow + 0.12`, so stopping at exactly 1.0
  would leave the topmost canopy still inside that edge and permanently dim.
- Deep-linking into the section lands with `enter` already at 1, so the tree is
  simply fully grown. Correct, and free.
- The same argument applies to any future scene whose entrance is a *reveal*
  rather than a *loop*. A timed entrance is only right when the section owns the
  viewport for a fixed span; ours never do.

---

## ADR-0026 — Ported scenes are rescaled to the shared camera, not given their own

- **Status:** Accepted
- **Date:** 2026-07-12

**Context.** Every scene in `getlayers-scenes/` owns its camera and is tuned
against it. `vortex.html` runs fov 52 at z = 17; `tree-of-life.html` runs fov 45
at z = 3.5. This project shares **one** camera (fov 45 at z = 3) across every
scene object, because the objects are positioned against each other and against
it. Dropping an upstream config in unchanged renders it at roughly 7× the
intended size, mostly off-frame.

**Decision.** Convert lengths at the boundary, in the object's config, against a
single derived constant — and write the derivation down. The frame is
`d · tan(fov/2)` world units tall at the origin, so upstream's 8.29 becomes our
1.243, and `WORLD = 1.243 / 8.29 ≈ 0.15` carries every length across.

**Consequences.**

- **Not every quantity scales the same way**, and this is the part that bites:
  - plain lengths (radii, depth) scale by `WORLD`;
  - quantities that *multiply* a length to yield an angle (`swirl`) scale by
    `1 / WORLD`;
  - quantities that multiply a *squared* length (`coreFall`, in `exp(-r²k)`)
    scale by `1 / WORLD²`;
  - `gl_PointSize` divides by view depth, so sprite scale carries the **camera
    distance** ratio (3/17), not `WORLD`;
  - angles, rates and exponents are dimensionless and carry over untouched.
- Each of these is commented at its config line. Getting one wrong does not error
  — it silently produces a scene that is subtly the wrong shape, which is far
  harder to spot than one that is obviously the wrong size.
- Scene objects **must not** move the shared camera. Where upstream dives the
  camera, the port moves its own group instead (`scrollDiveZ`).

---

## ADR-0025 — Deep emerald palette; brightness is a hue control under additive blending

- **Status:** Accepted
- **Date:** 2026-07-12

**Context.** The brief was "deep immersive green". The old ramp was a **sage** —
a light, yellow-leaning green (`accent-500: #9bc26a`) inherited from the original
HELIOS build.

**Decision.** Move the ramp to a **deep emerald** (`accent-500: #2eb37c`), take
the dark end down to a forest black-green (`accent-900: #04150e`), and tint the
page background green-black (`#020a07`) so the page below the canvas reads as the
same forest the scenes live in. The light end stays a legible mint — the hero
eyebrow and the CTA are drawn from `accent-500`/`accent-300`, so the ramp cannot
simply be darkened wholesale.

**Consequences.**

- **Recolouring an additive scene is not a matter of swapping the colour
  uniforms.** Every scene object here blends additively, and additive blending
  drives *all three channels* toward 1.0 wherever sprites pile up — so a dense
  region saturates to **white regardless of its hue**. Feeding the new green in
  and changing nothing else left both scenes reading silver.
  On a dense additive scene, **`brightness` is really a hue control**: the higher
  it goes, the sooner red saturates and the greener the base colour has to be to
  survive. Both ports therefore run well *below* their upstream brightness
  (vortex 2.3 → 1.15, tree 1.25 → 1.0) and pick base colours with a **low red
  channel**, letting the blow-out to white happen only where it is wanted — the
  vortex's star, the tree's trunk.
- **Do not feed white in.** Upstream's core colours are near-white (`#eaf3ff`,
  `#eaf2ff`) because additive white-on-blue is the look they want. Ours use
  `accent-300`/`accent-400`: the crowding carries them to white on its own, and
  feeding white in as well just bleaches the scene.
- `lib/scene/palette.ts` mirrors `globals.css` for the GPU (shaders cannot read
  CSS custom properties). The two **must** be changed together.
- Hardcoded colour is how a ramp change silently half-lands: `objects/6.ts` held
  the old sage as raw `Vector3`s and went on rendering it after everything else
  had moved. It now reads `color()` from the palette. Rule 4 ("no hardcoded
  values") applies to shader uniforms, not just to CSS.
- CSS tokens that need an alpha (`box-shadow`, gradients) still write the channels
  out longhand, because CSS cannot take an alpha off a hex token without
  `color-mix`. Those are the one place the ramp is duplicated; they are commented
  with the token they mirror.

---

## ADR-0024 — The chapters blob is a lat/long sphere again, by design direction

- **Status:** Accepted
- **Date:** 2026-07-11

**Context.** The blob's particles were built on a **Fibonacci sphere** — the
golden-angle spacing chosen specifically to kill the grid lines and moiré that a
lat/long `SphereGeometry` shows when rendered as points (see the old comment in
`objects/blob.ts`). But the reference the blob is modelled on,
`getlayers-scenes/solaris.html`, uses exactly that lat/long sphere
(`SphereGeometry(4.2, 200, 600)`), and its structured rings-and-meridians look —
the "combing" of the surface, the pole density — is what the design wants. The
even Fibonacci scatter reads as noise by comparison.

**Decision.** Sample the shell as solaris does: `THREE.SphereGeometry` per tier
via `SEGMENTS` (height segments ~3× width, so the streaks run longitudinally),
index dropped so `THREE.Points` draws one point per vertex, `aSeed` re-added for
the per-point brightness jitter. Vertex counts are held near the old
70k/34k/13k so the additive fill budget (ADR-0022) is unchanged.

**Consequences.** This deliberately reverses the anti-moiré rationale: the grid
is now the intended texture, not a defect. The pole hotspots (coincident vertices
at each pole) and any equatorial moiré are accepted as part of the look; if they
ever read as artefacts, tune `SEGMENTS` rather than returning to Fibonacci
without sign-off. Two companion tweaks shipped alongside and are *not* structural:
the entrance now dollies in from the camera (`FLY_FROM.z = 1.0`), and `uBackFloor`
lifts the Fresnel hollow so the far side of the shell stays faintly visible.

---

## ADR-0023 — The horizon's exit surge, and a sanctioned edit to vendored `6.ts`

- **Status:** Accepted
- **Date:** 2026-07-11

**Context.** The roadmap terrain ("horizon") is the last scene before the canvas
dissolves. On the way out it only faded — the landscape sank away quietly, which
read as an anticlimax against the blob's rush-the-camera exit. The ask was for it
to instead **dive into the camera and distort** as the section leaves.

Two obstacles. (1) The terrain has no enter/exit signal of its own — it is driven
by the symmetric `sceneProgress[ROADMAP]` kernel, which cannot tell arriving from
leaving and, worse, falls back to zero as the slide leaves, flattening the field
to its hidden plane exactly when we want it at full relief. (2) `objects/6.ts` is
vendored, `@ts-nocheck`, and ADR-0014 says **regenerate from source, don't edit**.

**Decision.**
- A new `Controller.roadmapExit()` ramp, monotonic in scroll and keyed off
  Impact's top the same way `useSceneVisibility` keys the canvas fade (ADR-0018).
  It leads the fade by a quarter viewport, so the dive is underway before the fade
  dissolves it and both finish together — right as `isSceneVisible()` stops the
  render (ADR-0022).
- `Object6.render` takes an `exit` and holds the field fully formed through the
  surge via `form = max(progress, exit)`, so the kernel can't flatten it mid-dive.
  A `uExit` shader uniform tears the ridges upward and churns the lattice; the
  instance is pushed toward the lens by `EXIT_ZOOM`. The canvas fade still owns the
  actual disappearance, so the terrain's own alpha stays lit through the dive.
- **This is a sanctioned, minimal edit to the vendored file**, not a regeneration.
  It adds one uniform, a few shader lines and a handful of `render` lines, all
  guarded by `exit` so the rest state is byte-for-byte the old behaviour. ADR-0014
  still holds for anything structural; small, `exit`-gated additive tweaks like
  this are allowed and logged here.

**Consequences.** The terrain now has a leaving signal it never had; any future
per-object exit motion (cf. the blob's `chaptersRamps`) should follow the same
pattern — a monotonic ramp in `Controller`, not the kernel. If `6.ts` is ever
regenerated from source, this surge must be re-applied.

---

## ADR-0022 — The scene is fill-bound: tier it, throttle it, skip it

- **Status:** Accepted
- **Date:** 2026-07-10

**Context.** Every scene here is additive point sprites with soft halos. The cost
is **fill rate**, not geometry or draw calls — there are no models, no textures
and no lights to optimise. Three consequences follow, and they were all being
ignored: the renderer ran at raw `devicePixelRatio` (9x the fragments on a 3x
phone), at full rAF on every device, and kept drawing after the canvas had faded
to zero below the roadmap.

**Decision.** `src/lib/scene/device.ts` is the single place that tiers the scene:

| | mobile | tablet | desktop |
|---|---|---|---|
| pixel ratio | capped at 1.0 | 0.75–1.5 | 0.75–1.5 |
| frame budget | 30fps | 45fps | every rAF |

- The cap is applied in **both** `Canvas3d` and `Composer` — the composer owns
  its own render targets, so leaving it at raw DPR silently undoes the saving.
- The ticker throttles subscribers independently, so capping the scene does not
  slow the spring components sharing the loop.
- `isSceneVisible()` in `scroll-state.ts` gates the render: nothing is drawn when
  the tab is hidden or when scroll has carried the canvas past its fade-out.
  Measured: 144 ticks / **0 renders** while Impact is on screen, resuming
  immediately on scroll-back.
- Particle counts are picked per tier from the same helper. Roughly halved
  everywhere; the terrain lattice, previously a fixed 100×100 on every device,
  now steps down to 56×56 on a phone.

**Consequences.** Anything device-dependent in the scene belongs in `device.ts`.
Do not read `window.innerWidth` or `devicePixelRatio` in a scene object — the
counts, the pixel ratio and the frame budget must never disagree about what
"mobile" means. Tier is sampled once at construction: a device does not change
tier mid-session, and rebuilding the buffers on resize costs more than the
mismatch is worth.

Note also that **more points is not more glow**. When the blob doubled in radius
its density collapsed, and the fix was bigger, brighter sprites (`gl_PointSize`
divides by view depth, so pushing an object back shrinks every sprite), not more
of them.

---

## ADR-0021 — Shape-preserving rotation, and the metaball merge contract

- **Status:** Accepted. The *rotation* half stands and still governs
  `objects/pinwheel.ts`. The *merge* half is **superseded**: the three merging
  orbs were replaced by a single blob (`objects/blob.ts`), so no metaball field
  is evaluated any more. It is kept below because the two traps it records —
  group-local fields require pure translations, and a radial pull must be
  released inside its target — will bite again the next time one is written.
- **Date:** 2026-07-10

Two scene rules learned the hard way. They belong next to the traps in
[[decisions-log]] ADR-0017.

**Bounded differential rotation (hero galaxy).** The pinwheel's arms wind because
its rotation term divides by the radius (`uSpinPhase / (r + coreSoftening)`): the
core sweeps faster than the rim. Left unbounded — as the upstream
`pinwheel-galaxy.html` leaves it — that term grows without limit, the core winds
past the rim, and after a minute the spiral smears into a featureless disc. The
entrance looked immersive and the settled state did not.

Rotation is now **two terms**:

- `uSpinPhase` — differential, and **bounded**: it ramps to `CONFIG.windLimit`
  with the entrance and then holds. It creates the unfurl.
- `uRigid` — uniform, unbounded. It turns the settled disc as one body, so the
  silhouette never changes again. The burst's spin boost drives *this* one.

Any radius-dependent rotation must saturate. Only a rigid term may grow forever.

**The merge contract (chapters orbs).** Each orb's vertex shader samples a
metaball field from its two neighbours and drags its surface toward them, so a
neck forms where they overlap instead of two surfaces simply intersecting. The
field is evaluated in **group-local** space as `position + uSelf`, which is only
valid while each orb's child transform is a **pure translation**. The per-orb
spin is therefore deleted; the surface noise supplies that motion instead. Add a
rotation back and the necks will point the wrong way.

Two details that are not obvious:

- Neighbour centres must be written **after** every orb has been positioned for
  the frame, or an orb reads a neighbour's stale position.
- The pull must be released deep inside a neighbour (`smoothstep(0, R*0.5, dist)`).
  Without it, a point that crosses the neighbour's centre keeps being dragged
  toward it while the direction flips, and it shoots out as a stray spike.

---

## ADR-0020 — One page gutter, shared by the header and every section

- **Status:** Accepted
- **Date:** 2026-07-10

**Context.** The header used `container-shell`, which caps width *and* pads; the
hero was full-bleed `px-10`. At 1440px the header wordmark sat ~14px further in
than the hero wordmark, and the gap grew past 1412px. Brief and Impact centred a
`max-w-[48rem]` reading column, so their left edge agreed with neither.

**Decision.** A single `page-gutter` utility owns the left/right inset
(`2.5rem`, `1.5rem` ≤1180px, `1.25rem` ≤656px). The header, hero, chapters,
roadmap, impact and footer all use it. Brief and Impact keep a `max-w-[53rem]`
measure but are **left-aligned to the gutter**, not centred. `container-shell`
is deleted.

**Consequences.** Verified: header and hero `<h1>` share a left edge at 40 / 24 /
20px for desktop / tablet / mobile. Add a gutter step here, not per section.

---

## ADR-0019 — Post-processing is one composer; the bloom chains were dead

- **Status:** Accepted
- **Date:** 2026-07-10

**Context.** The hero flickered. `Composer` ran three chained `EffectComposer`s
inherited from the original helios build: a torus bloom chain, a scene bloom
chain, and a `FinalPass` compositing both.

Every part of it was dead or wrong:

- Every scene object renders on `ENTIRE_SCENE`, so the `TORUS_SCENE` and
  `BLOOM_SCENE` layers were empty and both chains rendered nothing.
- Neither chain set `renderToScreen = false`, so their last passes drew straight
  to the canvas and their render targets went stale.
- `FinalPass` sampled those stale targets *plus* a `haloTexture` that was never
  assigned. An unbound `sampler2D` reads texture unit 0 — whatever was last
  bound — so the composite changed frame to frame. **That was the flicker.**

**Decision.** One `EffectComposer`: `RenderPass` → a new typed
`common/final-pass.ts` that samples only `tDiffuse` and generates the corner
wash. The vendored `common/finalpass.ts` is deleted.

**Consequences.** The glow never came from `UnrealBloomPass`: the point clouds
are additively blended and the terrain draws its own halo in-shader. Output is
unchanged apart from the flicker, and two full-screen bloom passes per frame are
gone. If a future object *does* want real bloom, add the chain back **and** set
`renderToScreen = false` on it.

---

## ADR-0018 — No scene below the roadmap; the canvas dissolves

- **Status:** Accepted
- **Date:** 2026-07-10

**Context.** The Impact section and the footer are the quiet close of the page.
Keeping a scene object alive under them meant the last one lingered at the edge
of the viewport, competing with the metrics.

**Decision.** There is no scene object for Impact. `<Scene>` fades **its own
canvas** to zero as Impact takes the viewport (`useSceneVisibility`), and the
`.scene-overlay` vignette moved *inside* that wrapper so it dissolves with it.
Impact and the footer are UI on the plain `--background`.

The fade is driven by **scroll position** relative to `scrollState.slideRange`,
not by `sceneProgress[IMPACT]`. That was the first implementation and it was
wrong: `sceneProgress` is a triangular kernel — it peaks on Impact and falls away
again on the footer — so the canvas faded out and then faded *back in* underneath
the footer at 64% opacity. Distance past the slide's top is monotonic in scroll.
`scrollState.slideRange` was added for exactly this.

**Consequences.** Anything that must react to "we are at or below slide X" reads
`slideRange`, never `sceneProgress`. The scene keeps rendering while invisible —
those frames cost less than tearing down and rebuilding the WebGL context.

---

## ADR-0017 — The scene set, and how scenes are authored

- **Status:** Accepted
- **Date:** 2026-07-10

**Context.** The ported helios scenes (a preloader spiral, a wave, a flat spiral
galaxy, a terrain, a rising sphere) were replaced wholesale for the VANTA build.
The replacements are new code, not vendored ports, so they are not bound by
ADR-0014's `@ts-nocheck` compromise.

**Decision.** Four scene objects, each fully typed, in
`components/common/scene/three/objects/`:

| Object | Section | Shape |
|--------|---------|-------|
| `trails.ts` | preloader | falling light trails; one `LineSegments` draw, shader-animated lifecycle |
| `pinwheel.ts` | hero | pinwheel galaxy, ported from `getlayers-scenes/pinwheel-galaxy.html` and recoloured |
| `orbs.ts` | chapters | three counter-orbiting particle spheres |
| `6.ts` | roadmap | the vendored terrain, reworked (below) |

Supporting rules that came out of building them:

- **Colours live in `lib/scene/palette.ts`**, mirroring the `globals.css` tokens
  as `Vector3`s. Shaders cannot read CSS custom properties; this is the seam.
  `color()` returns a fresh vector per call — uniforms mutate theirs.
- **Particle spheres use a Fibonacci lattice**, not `SphereGeometry`, whose
  vertices bunch at the poles and line up in rows: as points that shows visible
  grid lines and moiré.
- **Pointer repulsion must be gated on `hasPointer()`.** Before the first
  `mousemove` the cursor resolves to NDC (0,0), so an ungated void punches a hole
  through the middle of the scene — on every touch device, and on any untouched
  page. The upstream `pinwheel-galaxy.html` has this bug; our port does not.
- **`Canvas3d` sizes its surface before objects register `toResize`**, so the
  first resize pass never reaches them. An object deriving values from the aspect
  ratio must call its own `resize()` from its constructor.
- **The terrain only ever runs forward.** `Controller` ratchets its `iAnimation`
  with `Math.max`, because a landscape travelling toward the camera looks like a
  glitch when it rewinds on an upward scroll.
- The hero galaxy does **not** dive the shared camera the way the standalone
  scene does — other objects are positioned against it. Scroll drives expansion,
  spin and jitter, and pulls the group back along z.

**Consequences.** `objects/1.ts`, `2.ts`, `3.ts`, `8.ts`, `common/pointpass.ts`,
`common/addpass.ts` and the 3 MB `light-8.png` are deleted. Bloom in `Composer`
is retuned to the pinwheel's own values. `three` stays pinned at 0.143.0
(ADR-0014).

---

## ADR-0016 — The WebGL scene is driven by the shared ticker, not its own loop

- **Status:** Accepted
- **Date:** 2026-07-10

**Context.** The original helios build ran three independent
`requestAnimationFrame` loops: a bespoke `animator/renderer` registry driving the
Three.js scene, a private loop inside the React `Controller` computing scroll
progress, and one loop per in-flight `Tween`. Lenis adds a fourth. This project
deliberately runs **one** app-wide rAF (`src/lib/animation/ticker.ts`), which the
[[animation-system]] documents as the supported extension point.

**Decision.** Everything the scene needs subscribes to `subscribeToTicker`:

- `Scene` (the client leaf) subscribes `animation.render(time)`.
- `SectionController` subscribes the scroll-progress maths.
- `Tween` (`src/lib/scene/tween.ts`) subscribes per tween and unsubscribes on
  completion.

React never sees per-frame data. Continuous progress is written to a plain
mutable object, `src/lib/scene/scroll-state.ts`, which the scene reads each frame;
only the *discrete* active-section id enters React, via the `useSections` store.
The original's `statechange` / `setchanging` DOM `CustomEvent` bus is deleted —
both were dispatched but either unread or written to a field nothing consumed.

**Consequences.** One rAF for the whole page, spring components and WebGL alike.
`scroll-state.ts` is the single seam between React and the canvas: to drive a new
scene object from scroll, write a progress key there and read it in the scene's
`Controller.render()`. Scrolling 60 times a second causes zero React re-renders.

---

## ADR-0015 — helios does not use the adaptive scaling grid

- **Status:** Accepted
- **Date:** 2026-07-10

**Context.** The starter scales the root font-size with the viewport
(`html { font-size: 4.44vw }` below 640px, a 360px design base) and `AdaptiveGrid`
scales up beyond 1920px, so a rem-based layout stays proportional. The original
helios site was laid out in **fixed px**, with explicit `vw` overrides for the
hero title below 855px (`17vw`, then `19vw`).

Stacking the two compounds: the hero title's `10.5rem` would render at ~224px on a
480px-wide screen, where the original renders ~91px. Mobile breaks.

**Decision.** Fix the root at `font-size: 16px`, drop `<AdaptiveGrid>` from the
root layout, and reproduce the original's media queries as `--breakpoint-*` tokens
(`hero-lg` 1180, `hero-md` 855, `hero-sm` 656, `hero-xs` 480, `menu` 912,
`pad-sm` 991), consumed through Tailwind's `max-*` variants.

**Consequences.** px values port as `px / 16` rem and render 1:1. The starter's
grid components (`components/common/grid/`) are unused here but left in place.
Two `@custom-variant`s (`max-h-828`, `max-h-717`) exist because the Sitemap
reflows on viewport *height* and Tailwind has no built-in max-height variant.

---

## ADR-0014 — The ported WebGL scene is vendored and `@ts-nocheck`

- **Status:** Accepted
- **Date:** 2026-07-10

**Context.** Rebuilding helios required porting ~2,000 lines of Three.js from a
non-strict CRA tsconfig: six scene objects, two custom shader passes, and a bloom
composer. Under this project's `strict: true` it produced 174 implicit-`any` and
null-safety errors. Hard rule #7 says *no `any`, type everything*.

**Decision.** Split the scene by authorship:

- **Newly authored, fully typed:** `lib/scene/*` (canvas3d, tween, easing, lerp,
  mouse, scroll-state, screens), `scene/three/index.ts`, `Controller.ts`,
  `Composer.ts`, `extensions/*`, and the React leaf `scene.tsx`.
- **Vendored, `@ts-nocheck`:** `scene/three/objects/*` and `scene/three/common/*`
  — shader source, buffer geometry and pass plumbing.

Each vendored file carries a header stating its provenance and that it must be
regenerated from the source project rather than edited.

**Consequences.** Retyping shader plumbing that cannot be exercised by tests
carried more regression risk than value; the boundary keeps the *integration*
surface strictly typed while the GPU internals stay verbatim. Precedent exists —
`src/utils/animation/coords.ts` already ships `@ts-nocheck`. `three` is pinned to
**0.143.0**, the original's version: r152+ changed colour management and removed
`WebGL1Renderer`, which the scene constructs, so upgrading would silently alter
every bloom and gamma pass. Treat a `three` upgrade as a visual-regression task.

Note also that these objects animate **GPU uniforms, not the DOM**, so they sit
outside [[animation-system]]'s spring mandate. The original easing curves live on
in `lib/scene/easing.ts` for that reason.

---

## ADR-0013 — `<Inview>` self-observe fix; spring components honour resize

- **Status:** Accepted
- **Date:** 2026-06-07

**Context.** `<Inview>` only animated when an external `trigger` ref was passed.
Without one it never revealed. Root cause: `useDynamicInView` returns its target
attachment as a **callback ref** (`setNode`) in the first tuple slot, but
`in-view.tsx` destructured it as `inViewRef` and wrote `inViewRef.current = node`
in the JSX `ref` callback — assigning `.current` to a function instead of calling
it. `setNode` never ran, the observed `node` stayed `null`, and with no `trigger`
the observer had nothing to watch (`trigger?.current ?? node` → `null`). With a
`trigger` it worked only because `trigger.current` bypassed the dead `node` path.
TypeScript flagged this at build time (`Property 'current' does not exist on type
'TargetRefCallback'`), so the build was already failing.

Separately, `<Inview>`, `<Spring>`, and `<Hover>` tracked `width`
(`useWindowWidth()`) as a `useMemo`/`useEffect` dependency to re-evaluate mobile
gating on resize, but never passed it to `isMobileDisabled()` — so the value was
genuinely unused (ESLint `react-hooks/exhaustive-deps` warning) **and** resize
re-evaluation silently did nothing; the check always read `window.innerWidth` at
call time.

**Decision.** This is the second authorized edit to the `#do-not-modify` engine
(after ADR-0009). Two corrections:
1. In `in-view.tsx`, call the callback ref — `setInViewNode(node)` — instead of
   assigning `.current`, so the component observes itself when no `trigger` is
   given.
2. Pass the React-tracked `width` into every `isMobileDisabled(value, width)`
   call across `in-view.tsx`, `spring.tsx`, and `hover.tsx`. This is the
   documented second parameter of `isMobileDisabled` and makes the `width`
   dependency meaningful, fixing resize re-evaluation and clearing the lint
   warnings.

**Consequences.** `<Inview>` now works standalone (the common case). `yarn build`
and `yarn lint` are both clean (0 errors, 0 warnings). The springs folder remains
`#do-not-modify` by default — these were explicitly signed-off bug fixes.

---

## ADR-0012 — Styling lives in utilities and components, not `globals.css`

- **Status:** Accepted
- **Date:** 2026-05-22

**Context.** ADR-0004 made design tokens the styling currency and ruled that
"new values must be added to `globals.css` first." Combined with the
design-system guidance to *"extract repeated multi-class patterns to
`@layer components`"*, the path of least resistance for any repeated visual
pattern became a named class in `globals.css`. On an animation-heavy,
multi-section marketing site that grows the file without bound — a single
global stylesheet accumulating hundreds of component-specific classes that are
never deleted when their component is. The fix is a placement rule, not a
file-splitting trick: splitting `globals.css` into many files only spreads the
same bloat.

**Decision.** Styling follows a strict placement order; `globals.css` stays
bounded by design.

- One-off styling → **Tailwind utilities** in `className`. Nothing enters CSS.
- A repeated pattern with markup/structure/props → a **React component**
  (`components/ui/`), *not* a CSS class. This is the default answer to "this
  looks repeated" — e.g. an eyebrow label with a `::before` dot is an
  `<Eyebrow>` component, not a `.label-eyebrow` class.
- A repeated pure-utility combo with no structure → a Tailwind v4 `@utility`.
- `@layer components` is reserved **strictly** for what utilities and
  components genuinely cannot express: pseudo-elements (`::before`/`::after`),
  third-party DOM overrides (`!important` on library markup), complex
  descendant/state selectors.
- `globals.css` only ever holds: `@import`, tokens (`:root` + `@theme`), base
  element resets (`@layer base`), and the narrow `@layer components`
  exceptions above. If it grows past that, something was misplaced.
- CSS Modules were considered and **rejected** — a second styling mechanism
  for the rare bespoke-CSS case is not worth the extra mental model when
  motion is spring-based (no keyframes — ADR-0002) and utilities + components
  cover everything else.

**Consequences.** `globals.css` stays a few-hundred-line file indefinitely.
"Repeated thing" pressure now pushes toward React components — which the
project wants anyway. This **amends ADR-0004**: design *tokens* still go in
`globals.css` first, but component-specific *classes* no longer do.
[[design-system]] and [[component-conventions]] updated to match.

---

## ADR-0011 — API layer: `app/api` route handlers, secrets server-side

- **Status:** Accepted
- **Date:** 2026-05-22

**Context.** The starter had no API layer. It needs a convention for reaching
external services that keeps secret keys off the client and gives endpoints a
consistent shape.

**Decision.** External calls go through Next.js Route Handlers —
`src/app/api/<resource>/route.ts`:
- **The handler owns the work** — business logic, multiple upstream calls,
  filtering, and reading secret env vars all live in `route.ts`. No mandatory
  passthrough service layer; extract shared code only when genuinely reused.
- Secrets are safe in handlers because `route.ts` is never bundled to the
  browser. Secret env vars are **unprefixed**; `NEXT_PUBLIC_` only for
  browser-safe values.
- Every endpoint: validates input with `zod`, returns the `{ data }` /
  `{ error }` envelope via the shared `handle()` wrapper (`src/lib/api/`), runs
  on the Node runtime (not Edge).
- `src/env.ts` validates env with zod — `publicEnv` vs `getServerEnv()`.
- Client Components fetch via `apiFetch` (`src/lib/api-client.ts`), same-origin
  only. Render-time data is read in Server Components.
- Added `zod`. The example endpoint is `app/api/contact/route.ts`.
- Codified as **AGENTS.md hard rule #9**.

**Consequences.** A clear, secret-safe API convention (full note:
[[api-architecture]]). Server Actions were considered for mutations but
deferred — for now everything goes through `app/api`. The choice can be
revisited if forms need progressive enhancement. First server dependency
(`zod`) and first server-only env var (`CONTACT_ENDPOINT`) now exist.

---

## ADR-0010 — SEO & performance hardening

- **Status:** Accepted
- **Date:** 2026-05-21

**Context.** A review found gaps that would hurt a production marketing site:
`metadataBase` defaulted to `null` (relative OG/canonical URLs never resolved to
absolute — broken social previews); `themeColor` sat on the deprecated metadata
field; there was no `robots.txt`, `sitemap.xml`, or structured data; the
`next.config.ts` was empty; `ScrollLayout` leaked a `requestAnimationFrame`
loop; the home view was a top-level `"use client"` (violating hard rule #6);
and the animation-heavy starter ignored `prefers-reduced-motion`.

**Decision.**
- **Site config.** `src/lib/site.ts` (`siteConfig`) is the single source of
  truth for SEO, fed by `NEXT_PUBLIC_SITE_URL` (fallback `http://localhost:3000`).
- **Metadata.** `metadataBase` is always set; `themeColor` moved to a
  `generateViewport()` / `viewport` export; dead `keywords` / `other` tags
  dropped; OG dimensions corrected to match the asset.
- **Crawlability.** Added `app/robots.ts`, `app/sitemap.ts`, and a JSON-LD
  `Organization`+`WebSite` helper rendered once in the root layout.
- **App Router files.** Added `loading.tsx` (enables streaming), `error.tsx`,
  `not-found.tsx`.
- **Rendering.** `HomeView` is a Server Component; client-only animation moved
  to the `HomeShowcase` leaf — models hard rule #6 instead of breaking it.
- **Reduced motion.** `<ReducedMotion>` calls react-spring's `useReducedMotion`,
  toggling the global `skipAnimation` — one app-root mount covers every spring
  and `spring-text-engine`. Chosen over per-component handling for its reach.
- **Build config.** `next.config.ts` now sets `removeConsole` (prod),
  AVIF/WebP, `next/image` breakpoints aligned to the adaptive-grid widths, and
  `poweredByHeader: false`. React Compiler is left as a documented opt-in (needs
  `babel-plugin-react-compiler`).
- Fixed the `ScrollLayout` Lenis rAF leak (cancel on unmount).

**Consequences.** Social/SEO metadata is correct in production once
`NEXT_PUBLIC_SITE_URL` is set. The first project env var now exists (see
[[environment-variables]]). `isBot()` stays available but is discouraged — it
opts routes out of static rendering; reduced-motion is the preferred lever (see
[[seo-metadata]]). React Compiler remains opt-in pending a dependency install.

---

## ADR-0009 — Shared animation ticker; authorized engine performance refactor

- **Status:** Accepted
- **Date:** 2026-05-21

**Context.** A performance review of the animation engine found load issues that
scale with the number of animated components on a page:
- `useLoop` started a **private `requestAnimationFrame` loop per hook instance** —
  N scroll-driven components meant N rAF loops, none of which ever stopped.
- `useWindowWidth` attached a **separate debounced `resize` listener per call** —
  one per spring component.
- `useDynamicInView` re-created its `IntersectionObserver` **on every render**
  (effect keyed on an unstable `options` object), and a dead `Proxy` branch
  created observers that were never disconnected.
- `useLoop`'s mount-only effect captured a **stale `onRender`**, so prop changes
  after mount were ignored.
All of this lives under `src/hooks/animation/` and `src/components/animation/springs/`
— `#do-not-modify` (ADR-0002).

**Decision.** With explicit user sign-off, apply a one-time performance refactor
to the protected engine, and introduce a shared, unprotected loop primitive:
- New `src/lib/animation/ticker.ts` — a single app-wide, reference-counted rAF
  loop (`subscribeToTicker`). It starts on the first subscriber, stops on the
  last, and throttles each subscriber independently. **Not** `#do-not-modify` —
  it is the supported extension point.
- `useLoop` now subscribes to the ticker and reads `onRender` / `framerate`
  through refs (fixes the stale-closure bug). Public signature unchanged.
- `useDynamicInView` rewritten without the `Proxy`: one observer, re-created only
  when the observed element or options actually change; exposes a callback ref.
- `use-window-size.ts` (not protected) now serves all three hooks from one
  debounced `resize` listener via `useSyncExternalStore`. The unused
  `debounceDelay` parameter was dropped.
- `mode="forward"` `scroll` listeners in `<Spring>` / `<Inview>` made `passive`.
- Hard rule #2 amended: the engine stays protected by default; changes require
  explicit sign-off.

**Consequences.** A page with N animated components now runs **one** rAF loop and
**one** resize listener instead of N of each, with no observer churn. Public
hook/component APIs are unchanged except `useWindowWidth`/`Height`/`Size`, which
no longer take a `debounceDelay` argument (no caller passed one). This **amends
ADR-0002's** do-not-modify scope.

A follow-up pass then cleared all 13 pre-existing ESLint problems in the engine
(also authorized): `isMobileDisabled` gained an optional `viewportWidth`
argument, missing `disableOnMobile` effect deps were added, a
`trigger.current`-in-cleanup hazard in `<Hover>` was fixed, `<Handle>`'s
transition effects were ref-stabilised, and `useProgressTrigger` now returns
`progress` as a `RefObject<number>` (no consumer affected).

---

## ADR-0008 — Adaptive scaling grid via root font-size

- **Status:** Accepted
- **Date:** 2026-05-21

**Context.** An adaptive scaling system was dropped into `src/components/common/`
to keep a rem-based design proportional across viewports. It shipped as a
`styled-components` implementation (`createGlobalStyle`, a `css` `media` helper,
`rm`/`em` helpers, plus `colors.ts` / `fonts.ts` / `utils.ts`). `styled-components`
is not a project dependency, and global CSS belongs in `globals.css` per ADR-0004.

**Decision.** Keep only the scaling behaviour; rebuild it to the project stack.
- **Scale down** (viewport ≤ largest breakpoint) — `vw`-based `html { font-size }`
  media queries in `globals.css`, inside `@layer base`.
- **Scale up** (viewport > largest breakpoint) — a `<AdaptiveGrid>` client
  component (`useAdaptiveGrid` hook) sets an inline `html` font-size at runtime,
  reusing the existing `useResizeLoop` render loop.
- Breakpoints live in `grid.config.ts` as typed config; the `globals.css` media
  queries mirror them and must be kept in sync (formula in both files).
- The dropped `styled-components` files were deleted, not committed.

**Consequences.** A rem-based layout now scales as one unit on every viewport.
`styled-components` stays out of the dependency tree. The breakpoint set is
duplicated across `grid.config.ts` and `globals.css` by design — the CSS-only
config rule (ADR-0004) forbids generating the media queries from JS.

---

## ADR-0007 — Automate the vault workflow with Claude Code hooks

- **Status:** Accepted
- **Date:** 2026-05-21

**Context.** The "read the vault first, follow the relevant guide, update the docs
after every change" workflow depended on the user reminding the agent each time.
Documentation drifts the moment it relies on memory.

**Decision.** Encode the workflow as Claude Code hooks in `.claude/settings.json`
(committed, team-wide):
- `SessionStart` — injects a pointer to read the vault first.
- `UserPromptSubmit` — on every request, reminds the agent to consult the relevant
  guide and to update docs for any change made.
- `Stop` — at the end of every turn, blocks **once** to confirm the vault was
  updated. A `${TMPDIR}` marker keyed by session id guarantees it blocks at most
  once per turn (no infinite loop).

**Consequences.** The documentation workflow is enforced without user prompting.
`.claude/settings.json` is now a tracked project file. Hooks are reviewable and
disableable via `/hooks`. New hooks take effect on the next session start (or after
opening `/hooks`). See [[ai-agent-guide]].

---

## ADR-0006 — The vault is the single source of truth

- **Status:** Accepted
- **Date:** 2026-05-21

**Context.** ADR-0001 left dense spec files (`project-specs.md`, `text-engine-docs.md`)
at the repo root alongside the vault, creating duplication — the same conventions
existed both as terse specs and as expanded vault notes, which would drift.

**Decision.** The vault is the **only** documentation source.
- `project-specs.md` — deleted; its content was already decomposed into the
  `architecture/` and `frontend/` notes (and `environment-variables.md`).
- `text-engine-docs.md` — moved into the vault as [[text-engine-reference]].
- `generic-layout-prompt.md` — moved into the vault (see ADR via [[changelog]]).
- Root keeps only thin shims: `AGENTS.md` carries the breaking-change warning and
  hard rules and points into the vault; `CLAUDE.md` and `.cursorrules` both
  `@`-import `AGENTS.md`.

**Consequences.** No documentation duplication. Agents bootstrap from `AGENTS.md`
and read vault notes on demand. This **amends ADR-0001** — root files no longer
hold canonical spec content.

---

## ADR-0005 — Use standard `next/link` for navigation

- **Status:** Accepted
- **Date:** 2026-05-21

**Context.** Two conflicting conventions existed: `project-specs.md` specified
standard `next/link` / `useRouter`, while `generic-layout-prompt.md` specified
custom `<AnimLink>` / `useAnimRouter()` wrappers. The custom wrappers were never
built.

**Decision.** Use standard Next.js navigation — `<Link>` from `next/link` and
`useRouter` from `next/navigation`. The `AnimLink` / `useAnimRouter` convention is
dropped. See [[routing]].

**Consequences.** `generic-layout-prompt.md` §5 updated to match. No animated-route-
transition layer exists; if one is needed later, revisit with a new ADR.

---

## ADR-0001 — Adopt an Obsidian vault as the project brain

- **Status:** Accepted — amended by ADR-0006
- **Date:** 2026-05-21

**Context.** Project knowledge was scattered across root markdown files
(`project-specs.md`, `text-engine-docs.md`, `AGENTS.md`). New contributors and AI
agents had no structured map of the system.

**Decision.** Introduce `obsidian/` as an Obsidian vault — a linked, navigable
second brain. Root spec files remain as machine-read sources; the vault expands on
them. See [[ai-agent-guide]].

**Consequences.** Docs must now be maintained alongside code. The vault is the
canonical place to *understand* the project; root files stay canonical for *tooling*.

---

## ADR-0002 — All motion is spring-based (`@react-spring/web`)

- **Status:** Accepted (inherited from starter)
- **Date:** Project baseline

**Context.** Marketing sites need rich, interruptible, physically natural motion.
CSS transitions and keyframes are rigid; competing libraries add weight.

**Decision.** Use `@react-spring/web` for every animation. A custom component layer
(`src/components/animation/springs/`) wraps it. CSS transitions, CSS keyframes, and
`framer-motion` are **banned**.

**Consequences.** All animation goes through the [[animation-system]]. The springs
folder is `#do-not-modify`. Text animation is delegated to [[text-engine]].

---

## ADR-0003 — Routes delegate to Views

- **Status:** Accepted (inherited from starter)
- **Date:** Project baseline

**Context.** Mixing routing concerns with page UI makes `app/` files heavy and hard
to test.

**Decision.** `app/**/page.tsx` files only import and render a component from
`src/views/`. All layout/UI logic lives in the view. See [[routing]].

**Consequences.** Every route is a 3-line file. Views are the real page components.

---

## ADR-0004 — Tailwind v4 with CSS-based config

- **Status:** Accepted (inherited from starter)
- **Date:** Project baseline

**Context.** Tailwind v4 removes `tailwind.config.js` in favour of CSS-native config.

**Decision.** All theme tokens live in `globals.css` under `:root` and `@theme inline`.
No JS config file. Raw values in class names are banned. See [[design-system]].

**Consequences.** Design tokens are the only styling currency. New values must be
added to `globals.css` first.
