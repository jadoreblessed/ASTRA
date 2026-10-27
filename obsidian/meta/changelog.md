---
tags: [meta, changelog]
updated: 2026-10-06
---

# Changelog

Chronological log of notable changes to the project. Newest first.
This is a human-curated log — not a mirror of `git log`.

## 2026-10-06 — the phone menu's foot clears Safari's toolbar (owner review 3, D-037, optimize/pass-4)

The owner: "mobile menu should have some padding at the bottom bc now the
bottom button gets cut by bottom bar menu on IOS".

- **Cause:** the menu panel was `fixed inset-0 h-lvh` — sized to the *large*
  viewport, so with Safari's bottom toolbar showing its foot (the gradient
  "Send Request") sat under the toolbar.
- **`components/common/chrome/hero-nav-menu.tsx`:** the panel is
  `fixed inset-x-0 top-0 h-dvh` (top-anchored, the dynamic viewport — a menu is
  static UI; the large-viewport rule stays for the scene canvas), its foot
  `pb-(--hero-menu-pad-bottom)`.
- **`app/globals.css`:** `--hero-menu-pad-bottom: max(32px, env(safe-area-inset-bottom) + 32px)`.
- **`utils/seo/generate-page-metadata.ts`:** `viewportFit: "cover"`, so the
  inset is real when the toolbar collapses. Checked at 844×390: no in-flow text
  within the 47 px notch inset; the nav pills sit in the top band, clear of it.
- Verified headless 390×844 and 390×664 (toolbar shown): CTA bottom 32 px above
  the viewport edge, panel = viewport, no inner scroll; Escape → focus on the
  burger; scroll lock restored. Lighthouse local mobile 98 / desktop 100,
  A11y/BP/SEO 100. iOS itself not available here.

## 2026-10-06 — a full-screen phone menu (owner review 2, D-036, optimize/pass-3)

The owner: "make proper immersive mobile menu". The live phone nav
(`HeroNavMobile`) opened a 220 px frosted dropdown under the burger.

- **`components/common/chrome/hero-nav-menu.tsx`** (new): a full-screen field
  of the vortex's deep space (`--hero-menu-ground` #000315) opened by a circle
  that grows out of the burger; the CTA's blue → violet glows from that corner
  (`--gradient-hero-menu`) as the circle opens. The four chapters rise out of
  masks 60 ms apart in Mulish light at display size (index in accent-300, on
  hairline rules that draw across), each pulling focus from an 8 px blur — once
  per line, `none` at rest — like the nav pills on load; the gradient
  "Send Request" pill last. Closing runs back, faster. Portalled to `<body>`
  at z 110, **under** the nav bar (z 120): the logo pill and the burger stay
  put and the burger's bars cross into the × in place (offset corrected
  4 → 4.25 px so the strokes meet on the centre).
- **`hero-nav.tsx`**: the dropdown is gone; the burger measures the circle's
  origin, `aria-controls`; Lenis stopped + `html` overflow hidden, `main`
  inert, Escape, focus to the first chapter on open (same commit) and back to
  the burger, Tab loop (burger ↔ menu); a chapter tap closes, then glides
  (280 ms). Desktop pills unchanged. Reduced motion: `skipAnimation`.
- Tokens: `--hero-menu-ground`, `--gradient-hero-menu`, `--hero-menu-rule`.
- Checks: tsc, lint, build, verify.sh 0 FAIL; Lighthouse local ×1 mobile
  95/100/100/100, desktop 100/100/100/100. Shots at 390×844 DPR 3: closed,
  +120 ms, +320 ms, open, closing — looked at; "Works" closes and scrolls
  (y 2503); focus returns to the burger; `scrollWidth` 390.

## 2026-10-06 — the phone scene at the display rate (owner review, optimize/pass-2)

Owner: "it feels like scene on mobile is rendered in low FPS". Cause: the
phone tier's 30 fps budget (`lib/scene/device.ts → frameBudgetMs`). The shared
ticker skips a subscriber while `time - last <= budget`, so on a 60 Hz screen
the scene drew every 3rd frame (20 fps) and on a 120 Hz one every 5th (24–26
fps, measured), unevenly. Phones now draw every rAF tick like desktop; the
phone frame stays cheap (DPR 0.85, ~12k points, bloom off at strength 0), and
all scene motion is clock- or scroll-driven, so nothing speeds up. Tablet (a
narrow desktop window) keeps its 45 fps budget.

- Scene fps, 390×844 mobile profile, 4× CPU, 120 Hz panel, 5 s windows:
  at rest 26 → **120** fps; touch-scrolling 25.6 → **94–101** fps (rAF-bound).
- Phone scroll test ×2: cold 1.19 / 0.56 % dropped, max 50.6 ms → **0.58 /
  0.35 %, max 41.7 ms** (ideal); warm unchanged (one ~60 ms frame both builds).
- Lighthouse ×1: mobile 96, desktop 100; A11y/BP/SEO 100.

Files: `src/lib/scene/device.ts`, `src/components/common/scene/scene.tsx`
(comment).

## 2026-10-02 — phone scroll to ideal (optimize/pass-1, uncommitted)

The hosted phone scroll was janky (cold 115–233 ms frames at the logo slide,
drops at the sitemap and timeline). The long frames had **no script** in them
(LoAF: render ~6 ms, scripts none) and the profiler found no hydration under
the scroll — so not `HydrateNear`; the cost was rendering.

- **Heading blur once per line** (`components/animation/animated-heading.tsx`).
  Every letter animated its own `filter: blur()` with `will-change: filter`,
  and every *waiting* letter of every lower slide carried the blur and the hint
  too — hundreds of filtered layers, re-rasterised over the full-screen canvas
  while a heading cascaded mid-scroll. Letters now animate opacity + lift only;
  each line takes one blur that follows the letter a third of the way along the
  wave and is removed at rest. A settled letter drops its transform and
  `will-change`; a waiting letter has neither filter nor hint.
- **Timeline rails on their own layer** (`views/home/sections/timeline.tsx`):
  the phone station list and the desktop rail move every scroll frame; inside
  the slide's layer each move repainted the slide. `will-change: transform`.

Local, same sitting, phone scroll ×3: smooth (cold 1.31 %, max 58/124 ms) →
heading only: smooth (1.07 %, warm ideal) → both: **ideal** (0.47–0.75 %, no
frame > 50 ms, three runs). Full measure after: PC 100 / mobile 96–99,
A11y/BP/SEO 100, scroll ideal/ideal. Motion compare vs the deploy: settled
frames identical; mid-cascade the leading letters are a touch softer and the
trailing ones a touch clearer than letter-by-letter blur.

## 2026-10-02 — mobile 90 round (optimize/pass-1, uncommitted)

Local Lighthouse, people form, mobile 66 → **98–99** (TBT 636 → ~90 ms, LCP
4.75 → ~1.7–2.2 s), desktop 99 → 100; robot form 99 / 100. Nothing a visitor
sees changed (frame-by-frame motion compare vs the previous build).

- **Served forms** (`src/proxy.ts`, `lib/page-forms.ts`, `app/view/[form]/…`,
  `utils/mobile-ua.ts`). `/robot-view` is replaced by prerendered variants under
  `/view/<form>`: `mobile` (people on a phone), `robot`, `robot-mobile`. The
  proxy rewrites `/` **and the section deep links** by UA (robots read those
  from the sitemap — they used to get the warp loader there). `robots.txt`
  disallows `/view/`. Every form stays static.
- **Phone layout from the server** (`components/common/device-hint.tsx`,
  `hooks/use-is-mobile.ts`). `useIsMobile` answers with the server hint during
  SSR and hydration and yields a boolean from the shared width store — phones no
  longer build the desktop composition and rebuild the mobile one.
- **No hover springs on a phone** (`components/common/touch-hover.tsx`): the
  phone form renders hover targets as plain elements at `from`.
- **Hero served at rest under a curtain** (`scene/loader-curtain.tsx`,
  `scene/loader-readout.tsx`, `hooks/use-hydrated.ts`, `restUntilHydrated` on
  `robot-spring` / `robot-text` / `AnimatedHeading`). The served HTML carries an
  opaque stand-in for the loader (background, vignette, readout at 0 %); the hero
  paints at rest beneath it, switches to its start pose at hydration and plays
  the same entrance when the warp ends. LCP lands at first paint.
- **Lato not preloaded** (`lib/fonts.ts`) — used only by components the page no
  longer renders; 116 KB off a phone's first paint.
- **Scene programs linked for the right output** (`three/Composer.ts` `prewarm`):
  the scene and bloom chain are compiled against the composer's render target,
  the final pass against the canvas — the old `compileAsync(scene)` compiled for
  the canvas, so the first frame relinked everything synchronously (~1 s at 4×).
  Each program's first use (uniform read-back) runs in its own task;
  `checkShaderErrors` off in production (`lib/scene/canvas3d.ts`).
- **Scene built in steps** (`three/index.ts` `build`, `scene.tsx`): renderer, objects,
  post chain each in a task of their own, after hydration.
- **One clock per heading** (`animation/animated-heading.tsx`): the letters read
  their pose off a single spring instead of a spring each — same tween, same
  stagger; the hero entrance's long task is gone.
- **Lower slides hydrate on approach** (`components/common/hydrate-near.tsx`, from
  relay): services / timeline / impact keep their (hidden) server HTML and hydrate
  near the viewport after the first gesture. Robot form unchanged.

Tried and reverted: three.js by dynamic import after hydration (with the palette
split out of `scene-config`) — no gain once LCP no longer waited on the loader.

## 2026-07-15 — mobile perf pass, reduced-motion freeze, metadata + branded icons

A broad optimisation + polish pass, mostly aimed at phones.

- **Scene, mobile budget** (`lib/scene/canvas3d.ts`, `three/Composer.ts`,
  `lib/scene/device.ts`, `objects/{morph,starfield,logo-mark}.ts`). All per-particle
  transforms were *already* on the GPU (vertex shaders) — the cost was fill-rate, so
  this targets fill: **MSAA off on touch** (antialiasing a soft point cloud is pure
  cost), `powerPreference: "high-performance"`, the **inert bloom pass is now skipped**
  when strength ≈ 0 (a full-screen chain elided every frame on every default session),
  **mobile DPR cut to 0.85×**, and mobile particle counts cut ~40–50% (morph ~22k→~12k,
  starfield 1200/220→700/120, logo motes 400→240). The **logo mark** itself (the final
  scene) is now tier-scaled too (`COUNT_SCALE`, mobile `0.38×` of `logo.count`): it holds
  a fixed on-screen size, so at full count the additive sprites piled into a solid white
  blob on a phone instead of the mark's twin-triangle outline. Its point **size** is
  also halved on mobile (`MARK_SIZE_SCALE`) so the reduced count reads as a fine outline
  rather than a chunky one. See [[decisions-log]] ADR-0043.
- **Reduced-motion / energy-saver freeze** (`scene.tsx`, `device.ts`). The WebGL scene
  now honours `prefers-reduced-motion` (any device) and an energy-saver heuristic
  (Save-Data / ≤2 GB memory, mobile): it plays the entrance once, then **stops drawing
  and holds a settled still frame**, so nothing animates on scroll or idle. The old
  `<ReducedMotion>` only skipped react-spring; the scene ran full-tilt regardless. New
  `prefersReducedMotion` / `isEnergySaver` / `sceneShouldFreeze` in `device.ts`. See
  ADR-0044.
- **Responsive.** The dev `SettingsPanel` (the floating ⚙ bottom-right) was first gated
  off in production / on phones, then **removed from `home.tsx` entirely** so the ⚙ never
  shows in the product; the component stays for local tuning (re-add its mount when
  needed). It was previously shipping to prod and covering a 390px screen.
  The pinned full-screen sections moved from `h-screen` (100vh, the *largest* viewport —
  hides content behind iOS Safari's URL bar) to **`h-svh`** (small viewport, stable, no
  scroll reflow): `hero`, `services`, `timeline`, `logo-particles`, and `slide.tsx`.
- **Metadata voice + branded assets.** `siteConfig` description rewritten from the
  leftover fusion placeholder to the studio pitch; a `title` template (`%s — HELION`).
  Icons now flow through **Next file conventions** — `app/icon.svg` (the twin-triangle
  mark, the primary favicon), `app/apple-icon.png`, `app/favicon.ico` (rebuilt, RGBA) —
  so the explicit `icons` block was dropped from the generator. New branded
  **`open-graph.png` at 1200×630** (was 900×600), `manifest.json` given
  `theme_color`/`background_color`/`display`/`start_url` + 192/512 icons,
  `browserconfig.xml` de-dangled, JSON-LD logo → `/icon-512.png`. Orphaned
  `android-icon-*` / old favicons deleted. See [[seo-metadata]].
- Verified: `yarn build` + `yarn lint` clean; scene renders on desktop and at 390px;
  head metadata, OG dimensions, and the three icon links confirmed in the rendered HTML.

## 2026-07-15 — warp streaks are quads, not hairlines (fixes "just pixels" loader)

- **The preloader warp read as a field of loose pixels on real GPUs**, not the comet
  trails it is in software rendering. Cause is geometric: the streaks point nearly down
  the view axis, so most project to a few pixels of screen length, and a
  `THREE.LineSegments` streak is always **one device pixel wide** — a hardware
  rasteriser collapses a short, head-weighted 1px segment to a single lit pixel. Each
  streak is now a **camera-facing quad** of fixed CSS-pixel width (`uWidth` /
  `uResolution`), still one indexed draw call, `DoubleSide` + additive. New `aSide`
  attribute runs the quad's width; the fragment shader adds a soft `1 - |vSide|` body
  falloff over the existing head→tail gradient. `objects/warp.ts` only; see
  [[decisions-log]] ADR-0042.
- Verified in-browser (headless SwiftShader, DPR 1 and forced-2): full comet field at
  180 ms, holds through the load, no regression to the surge/fade on destroy. `yarn
  lint` clean.

## 2026-07-14 — logo moved INTO the main scene (no more overlay pop)

- **Root architecture fix.** The mark was a second canvas layered over the vortex,
  so it always read as a separate scene popping on top and the camera could never
  fly *into* it. It now lives in the main WebGL scene:
  `three/objects/logo-mark.ts` (a billboarded particle object at the world origin,
  on `ENTIRE_SCENE`, so it shares the one starfield, camera and bloom). `Controller`
  owns it: `logoRamp()` (scroll into Impact) drives assembly + opacity, the morph
  gets a `dissolve` so the disc fades as the mark forms in its place, and the dive
  now stops AT the hole (`diveThrough` 1→8, `diveAhead`→4) so the camera arrives
  at the mark instead of flying through to empty space.
- The separate canvas is gone: `views/home/sections/logo-particles.tsx` is now a
  bare scroll spacer; `logo-particle-field.ts` is orphaned. `Controller.dispose`
  added (unhooked in `three/index.ts` unmount) for the mark's rebuild subscription.
  New CONFIG `logoLeadVh` / `logoSpanVh` tune when it forms.
- Verified: `yarn lint` + `yarn build` clean, no console errors. Runtime framing
  is NOT yet visually verified (the WebGL can't be screenshotted here) — tune
  `markSize` (panel), `logoLeadVh`, `diveThrough` against the live scene.

## 2026-07-14 — mark grows from the hole's centre (kills the "empty starfield" beat)

- **Root cause of the empty-starfield frame:** the mark started as a wide shell
  (scatter radius 9–17) and, half-assembled, looked exactly like sparse stars.
  Now it grows out of a **tight central point** (`spreadMin` 9→0, `spreadSpan`
  8→2) — the point the camera flies into — so it always reads as a bright forming
  figure, never a diffuse cloud.
- **Timing tied to the fly-through:** assembly starts ~1vh before the slide top
  and is nearly complete as the camera comes through (`ASSEMBLE_LEAD` 1.9→1.0,
  span 2.0→1.2), and opacity now leads assembly (`ALPHA_GAIN` 1.9) so the emerging
  mark is bright immediately. Net: fly through the hole → the mark is right there,
  forming, on the same starfield — no scene switch, no empty beat. (User chose
  "keep the fly-through, assemble the logo immediately".)
- Verified: `yarn lint` + `yarn build` clean.

## 2026-07-14 — logo assembles across the whole dive (no bare-starfield beat)

- **Closed the gap between the maelstrom leaving and the mark appearing.** With
  the starfield now persistent, the logo assembly was still starting too late
  (0.6vh before the slide top), so there was a beat of empty starfield after the
  disc dived away and before the mark showed. Assembly now runs across the **whole
  camera dive** (`ASSEMBLE_LEAD` 0.6→1.9vh, span 1.2→2.0), matching
  `Controller.diveLeadVh`: the mark starts gathering the instant the camera flies
  into the hole and is well formed by the time the disc has left, so the mark is
  always present on the same starfield — the matter you fly into reorganising into
  the logo, seamlessly.
- Verified: `yarn lint` + `yarn build` clean.

## 2026-07-14 — one continuous scene: keep the starfield, don't blank

- **The starfield now persists through the Impact slide** instead of the whole
  canvas fading to black. `isSceneVisible` keeps the scene rendering until the
  footer (`SCENE_GONE_AT` 0.6→2.3), and `useSceneVisibility` fades the canvas only
  as the reader leaves Impact (`FADE_START_VH` 1.6, span 0.6) rather than as it
  arrives. The maelstrom still leaves frame on its own — the camera dives through
  it — so the logo mark assembles over the **same, unbroken starry backdrop**: it
  reads as one continuous scene rather than a cut to black and a fresh figure.
- Verified: `yarn lint` + `yarn build` clean.

## 2026-07-14 — sequence the dive → black → logo hand-off

- **The vortex→logo hand-off is now sequenced, not overlapped.** The canvas fade
  finishes right as the camera crosses the disc plane (`useSceneVisibility`
  `FADE_LEAD_VH` 0.85→1.1, span 0.6→0.5), hiding the far side of the dive behind
  the black of the hole. The logo assembly then starts *after* that black-out
  (`ASSEMBLE_LEAD` 1.2→0.6vh), so the beat reads: fly into the hole → black → the
  mark builds out of the dark, instead of the half-formed mark cutting in over the
  still-diving maelstrom.
- Verified: `yarn lint` + `yarn build` clean.

## 2026-07-14 — smoother vortex→logo hand-off; maelstrom funnel; 3D-only colours

- **The mark now forms as the vortex dissolves, not after it.** `logo-particles`
  drives assembly from scroll **position** with a 1.2vh lead, so it begins
  gathering while the camera is still diving through the maelstrom; opacity is now
  separate from assembly (`field.render(assembly, alpha, …)`), so it holds
  assembled and fades toward the footer instead of snapping off to an empty field.
- **Maelstrom funnel.** `morph.geometry` curls the disc out of plane toward its
  centre (deepest at the hole, flat at the rim) — a whirlpool the camera flies
  into. New baked shape param `maelFunnel` (default 1), tunable on the Timeline
  tab ("Funnel (Apply)").
- **Panel now edits 3D-scene colours only** — the UI brand-colour rows are gone;
  each scene's Colours section shows just its vortex palette hues (logo keeps its
  A/B). `applyTokensToCss` and the token controls are dropped from the panel.
- Verified: `yarn lint` + `yarn build` clean.

## 2026-07-14 — panel: real shape controls per vortex phase

- **Each vortex tab gained a "Shape" group that reshapes the figure**, not just
  its point size:
  - **Hero / galaxy** (live): scale, flatten (ellipse), arm sweep (omega), drift.
    Computed in the vertex shader, so they morph the disc in real time.
  - **Services / burst**: scale (live) + filament length, curl, bend (baked →
    "Apply").
  - **Timeline / maelstrom**: spin (live) + inner radius, outer radius, winding
    (baked → "Apply").
- New `shape` config group (`VortexShape`, multipliers of the `morph.ts` CONFIG
  defaults); `SHAPE_BAKED` marks the ones that need a remount. `morph.render`
  applies the live ones to their uniforms each frame; `morph.geometry` applies the
  baked ones when it builds the buffers (on "Apply"). Export carries `shape`.
- Verified: `yarn lint` + `yarn build` clean.

## 2026-07-14 — settings panel reorganised into four scene tabs

- **Panel is now one tab per scene** — Hero / Services / Timeline / Logo — each
  with its own **Geometry**, **Colours** and **Bloom**, plus a shared Apply /
  Export / Reset footer. Replaces the earlier flat grouping.
- **Bloom is per scene.** The three vortex phases (galaxy / burst / maelstrom)
  each carry their own bloom, blended by the morph weights `Controller` now
  mirrors into `scrollState.morphT1/T2` and `Composer` reads. The logo scene got
  its own `EffectComposer` + `UnrealBloomPass`, so it blooms independently. All
  default to strength 0 (off).
- **Glow is per phase too** — `morph.ts` blends `galaxyGlow / burstGlow /
  maelGlow` by the weights. Colours per tab: UI tokens + the palette hues that
  dominate that phase (bright accents → Hero, mids → Services, darks + signal
  pinks → Timeline).
- Config regrouped in `scene-config.ts` (`bloom` is a `BloomSet`, vortex gained
  per-phase glow); export carries the lot.
- Verified: `yarn lint` + `yarn build` clean; gear + canvas present.

## 2026-07-14 — panel: vortex geometry + bloom; logo spin removed

- **Logo idle spin removed** — the mark now only tilts to the cursor (no
  auto-rotation), per request. `autoSpin` dropped from the config.
- **Vortex geometry in the panel.** New `vortex` config group: per-form point
  sizes (galaxy / burst / maelstrom) and a glow multiplier are **live** (they
  drive existing uniforms in `objects/morph.ts` each frame); `density` scales the
  baked particle buffers in `morph` + `starfield`, so it applies on "Apply".
- **Bloom.** Added an `UnrealBloomPass` to `three/Composer.ts` (strength / radius
  / threshold), read live from a new `bloom` config group. Default strength 0, so
  it's inert until turned up (fine points flicker through bloom — ADR-0019).
- Panel gained "Vortex geometry" and "Bloom" sections (shared `Range` control);
  export now includes `vortex` + `bloom`.
- Verified: `yarn lint` + `yarn build` clean.

## 2026-07-14 — logo cursor-turn + thickness; dev scene-tuning panel

- **The particle mark now turns to follow the cursor** (eased, with an optional
  idle spin) and takes real **thickness** — targets extrude across a configurable
  z-depth so the turning slab reads as volume. Rotation + depth are config-driven.
- **New dev settings panel** (`components/dev/settings-panel.tsx`, gear toggle,
  bottom-right) backed by `lib/scene/scene-config.ts` (a zustand store):
  - **Logo particles** — count, mark size, thickness, scatter, point size,
    brightness, idle spin, cursor-turn, tilt, two colours. Fully live: the field
    reads uniforms each frame and rebuilds buffers on structural changes.
  - **Brand colours** — the gradients behind hero/services/timeline, live via CSS
    custom properties (`applyTokensToCss` rewrites the `--gradient-*` vars).
  - **Vortex palette** — the GPU palette; those hues are baked at scene
    construction, so `palette.ts` gained a runtime-overridable palette and
    "Apply" bumps `paletteVersion`, remounting `Scene` to re-read them.
  - **Export config** copies the whole tuned look as JSON; **Reset** restores.
- Verified: `yarn lint` + `yarn build` clean; gear button and `#impact` canvas
  present via the rendered tree. (WebGL itself isn't observable in the preview
  pane; tune in a real browser.)

## 2026-07-14 — impact slide: particle mark assembly (no UI)

- **Replaced the Impact metrics board with a WebGL particle moment.** New
  `views/home/sections/logo-particles.tsx` renders a transparent, viewport-pinned
  canvas driven by a self-contained `lib/scene/logo-particle-field.ts` — a second
  Three.js context, independent of the main `Scene`/`Controller`, so it doesn't
  touch the vortex choreography. No DOM UI yet (the slide is `aria-hidden`).
- The field **assembles the two-triangle HELION mark from a drifting cloud**:
  targets are sampled by rasterising the icon's outlines (Path2D, `evenodd`) to an
  offscreen canvas, then given a shallow random depth so the flat mark reads as a
  turning slab. Additive soft sprites tinted along the blue→lilac gradient, same
  as the rest of the scene. The shared ticker feeds it `sceneProgress[IMPACT]`, so
  the cloud gathers as the slide centres and scatters as it leaves; off-slide it
  is skipped and blanked (costs nothing). Slide grown to `vh: 1.8` for an assembly
  runway. Old `Impact` component + `impact` content now unused.
- Verified: `yarn lint` + `yarn build` clean; `#impact` confirmed UI-free with a
  single pinned canvas and the old metrics board gone, via the rendered tree.

## 2026-07-14 — timeline section: getLayers third slide (horizontal rail)

- **Rebuilt the third slide (`ROADMAP`) to the getLayers design** (Figma
  `669:1927`) — `views/home/sections/timeline.tsx` replaces `Brief`. A fixed,
  width-fit, pinned composition like the others, but its content **travels
  right-to-left** across the 2.5-viewport slide: new hook
  `hooks/sections/use-slide-progress.ts` springs `scrollState.slideLocalProgress`
  off the shared ticker and drives the rail's `translateX` (0 → −travel).
- The rail is a wide track (baseline + per-station tick, triangular marker,
  gradient index numeral, Mulish title, body) that scrolls beneath a centred,
  static masthead (mirror-image gradients, reusing the hero tokens). New tokens
  `--timeline-rail` / `--gradient-timeline-tick`; markers/numerals reuse
  `--gradient-hero-icon`.
- **Copy rewritten to follow the earlier sections** — the studio's engagement as
  five steps (Discovery → Identity → Art Direction → Motion → Web), masthead
  "From signal / to system." New content `timeline` / `TimelineContent` in
  `data/mocks/home.ts`; the old `Brief` component + `brief` content are now unused.
- Verified: `yarn lint` + `yarn build` clean; wrapper `fixed`, heading (Mulish
  300, 56/56, both gradients), the five stations, gradient numerals, triangles,
  ticks + baseline, and the `translateX` rail transform confirmed via the
  rendered tree.

## 2026-07-14 — hero + services: fade in place, tighter service gutters

- **The hero and services compositions no longer scroll — they fade in place.**
  Each composition wrapper is now `position: fixed inset-0` (was `absolute`), so
  it is pinned to the viewport and dissolves via `useSceneFade`'s **opacity only**
  (the −32px drift is dropped) as its slide leaves. `pointer-events` follow the
  active slide so the pinned layer never swallows clicks meant for other sections.
  The `useSceneFade` 0.55 threshold keeps a clean gap between adjacent sections,
  so the two fixed layers never overlap.
- **Services side gutters now match the mockup proportion.** `useHeroLayout` gained
  a `fit` param; the services section uses `fit: "width"` (`scale = vw/1440`) so the
  frame spans the full viewport width and the grid's 50px inset stays proportional
  on every screen (previously `contain` letterboxed the sides on wide viewports).
  The hero keeps `contain`; the nav always tracks the `contain` frame.
- Verified: `yarn lint` + `yarn build` clean; both wrappers confirmed
  `position: fixed` with opacity-driven fade via the rendered tree.

## 2026-07-14 — services section: getLayers second slide

- **Rebuilt the second slide (`SITEMAP`) to the getLayers design** (Figma
  `668:1825`) — `views/home/sections/services.tsx` replaces `Sitemap` in the home
  view. Same fixed 1440×800 → `useHeroLayout`-scaled composition as the hero.
- On the frame: the two-line masthead (mirror-image gradients, **reusing the
  hero title tokens**), a **four-cell feature grid** — `Identity / Motion` at the
  left edge (left-aligned), `Art Direction / Web` at the right (right-aligned) —
  each footed by a hairline that fades toward centre (new tokens
  `--gradient-service-rule` blue / `--gradient-service-rule-alt` lilac), and a
  centred footnote. Entrance latches on `active === SITEMAP` (`mode="once"`);
  `useSceneFade` handles exit. The shared fixed `HeroNav` is the section's nav.
- New content `services` / `ServicesContent` in `data/mocks/home.ts`. The old
  `Sitemap` component + `sitemap` content are now unused (left in place).
- Verified: `yarn lint` + `yarn build` clean; heading (Mulish 300, 56/56, both
  gradients clip-text), the eight cells, four rule gradients, and left/right
  alignment confirmed via computed styles on the rendered tree.

## 2026-07-14 — hero redesign: getLayers composition + fixed nav

- **Replaced the hero's editorial masthead with the getLayers design** (Figma
  `665:1694`). The first section is now a fixed **1440×800 composition** rendered
  at literal design pixels and scaled as one unit, preserving the mockup's exact
  proportions at every viewport (`contain` fit: `min(vw/1440, vh/800)`). New hook
  `hooks/use-hero-scale.ts` (`useHeroLayout`) owns the scale + fixed-nav offset.
- **Masthead** is one `<h1>`, two lines in **mirror-image horizontal gradients**
  (`--gradient-hero-title` / `-inv`): white→haze then haze→white, `bg-clip:text`.
- **Twin-triangle mark** (`views/home/sections/hero-icon.tsx`) — the two Figma
  triangles split into independent layers, each spinning clockwise at its own
  rate via a `@react-spring/web` loop (16s / 9s, linear). Keeps their exact
  geometry + blue→lilac gradient stroke.
- **Contact-form pill** (Name / Email / Send Request) as a frosted-glass
  `<form>`, and a new **fixed top nav** (`components/common/chrome/hero-nav.tsx`,
  Figma `666:1817`) — three glass pills (logo / links / gradient CTA) scaled by
  the same factor, `position: fixed` so it stays pinned on scroll. **Removed the
  old global `Header` + `Menu` from the home view.**
- **Typography:** added **Mulish** (300/400) via `next/font/google` in
  `lib/fonts.ts`; the whole hero + nav use it at the mockup's exact sizes /
  line-heights (56px/1 masthead, 16px/1.2 chrome). New tokens in `globals.css`:
  `--gradient-hero-title`(+`-inv`), `--gradient-hero-cta`, `--gradient-hero-icon`,
  `--hero-glass`, `--hero-glass-border`, `--font-mulish`. Assets: `public/assets/
  logo.svg`, `public/assets/icon.svg`.
- Verified: `yarn lint` clean, `yarn build` passes (TypeScript + static gen +
  Mulish fetch). Note: the preview pane can't render the live WebGL/PPR app
  (hydration doesn't complete there — pre-existing), so runtime scale/rotation
  were verified via computed styles on the rendered tree, not a screenshot.

## 2026-07-14 — clean build: two spurious CSS warnings + workspace-root warning

- **Two "Unexpected token Ident(…)" CSS build warnings, silenced at the source.**
  Tailwind v4 auto-scans the whole project for class candidates — including the
  `obsidian/` vault, whose prose documents literal Tailwind syntax like
  `bg-[image:var(…)]`. The scanner matched those and compiled invalid rules
  (`.bg-[var(…)] { background-color: var(…) }`). Fixed by scoping the scanner:
  `@source not "../../obsidian"` in `app/globals.css`. Also reworded the JSX
  comment in `components/ui/logo-mark.tsx` so it no longer contains literal
  arbitrary-value class syntax (belt-and-braces — that file *is* scanned).
- **Workspace-root inference warning removed.** A stray `package-lock.json` in a
  parent directory made Next infer the wrong Turbopack root. Pinned it with
  `turbopack.root` in `next.config.ts`. See [[decisions-log]] ADR-0041.
- Verified: `yarn build` and `yarn lint` are both clean, and `yarn dev` serves
  `/` and `/roadmap` at 200 with no runtime errors.

## 2026-07-12 — renamed HELION; new mark; a dead-gradient bug

- **VANTA → HELION**, wired end to end: `siteConfig` (name, author, twitter handle,
  copyright holder), the hero title, both wordmarks, the sitemap heading, the contact
  domain, and `manifest.json`. The JSON-LD `Organization` / `WebSite` graph and the
  footer's baseline line both resolve from `siteConfig`, so the copyright
  (**© 2026 Helion Studio**) states itself once. Verified against the rendered DOM.
- **New brand mark — an event horizon** (`components/ui/logo-mark.tsx`): the accretion
  disc the page flies through, reduced to a 28px annulus. A conic sweep burns hot
  through one sector (the lensing crescent — the page's one pink accent, spent here
  because a brand mark is exactly where scarcity is meant to pay off) and the horizon
  is a **real hole** punched through it in `--background`. Pure CSS, pure tokens: no
  SVG, no image, crisp at any DPR, and it recolours itself for free if the palette
  moves. Replaces the ringed dot.
- **`bg-[var(--gradient-…)]` renders nothing, and every gradient token in the project
  was written that way.** Tailwind cannot see what a bare custom property holds, so it
  guesses `background-color` — invalid for a gradient, so the declaration is dropped
  silently. **The footer's entire background wash had never rendered once**, nor its
  hairline rule, nor the burger's hover halo. All four now use `bg-[image:var(…)]`.
  It took the new logo coming out as an empty ring to catch it. See [[design-system]].
- **Fixed: the hero's framing walked away over time.** The camera's idle drift was an
  unbounded rotation (`angle = t × rate`), so it kept going — after a few minutes on
  the hero the eye had circled round and settled into a composition nobody chose. Idle
  motion is now a **sway**: a sine that always comes home. The burst's idle clock had
  the same bug, and worse, since it sat on top of a scroll-driven orbit — the same
  scroll position gave a different framing depending on how long the page had been
  open. See [[decisions-log]] ADR-0040.
- Verified at 1440×900: metadata, JSON-LD and copyright read from the DOM; the mark
  renders; and the hero holds its composition after 10 minutes of virtual idle time.

> [!note] Still to do
> `public/favicon*.png`, `apple-icon-*.png`, `android-icon-*.png` and `open-graph.png`
> are the old brand's raster assets. They need regenerating from the new mark — that
> is an image-export job, not a code one.

## 2026-07-12 — the burst turns on scroll

- **The burst's orbit is driven by scroll**, not by a clock. `weights()` now returns
  `burstPhase` and the camera swings ~150° around the eruption across it, rising and
  easing back as it goes.
- **The span opens where the burst starts *existing*, not where it is finished.**
  Keyed to the sitemap's top (the first attempt), the rotation was zero until the
  eruption was already fully formed — so the first thing the viewer ever saw of it was
  a burst standing perfectly still, and it only began to turn once they were reading
  the chapters. The span now opens at `morph1Start`, the moment the galaxy first
  begins to become the burst, and closes at the roadmap: whatever fraction of the form
  has appeared, it is already moving. The swing is widened to keep the rotation per
  unit of scroll about what it was.
  - A radially symmetric form seen from a fixed vantage is the one thing that can make
    a burst read as a **still image**, however much it shimmers. Swinging the eye
    around it rakes the filaments past the lens and shows the core from a genuinely
    different side by the time the chapters are read.
  - The clock is **kept**, just turned down (0.04 → 0.015 rad/s) and *added* to the
    scroll term rather than replaced by it. Scroll is the movement; the clock is the
    breathing — a scene that stops dead the instant the wheel stops is a scene that
    is watching you back.
- Verified at 1440×900 across the burst's whole scroll span: no console errors.

## 2026-07-12 — the cursor touches the matter; the scene exits through the hole

- **The cursor is now a body in the scene**, not a parallax offset. It is unprojected
  into a ray out of the lens and pushed to the depth of whatever the camera is aimed
  at, so it sits *inside* the matter behind the glass; the cloud is then **pushed**
  out of its way, **swirled** around it, and **lit** by it. The swirl is the one that
  matters — a pure radial push reads as a dent poked in a sheet; the stir is what
  makes it read as matter being disturbed. Sized per form and blended with the morph
  weights, exactly like the framings. See [[decisions-log]] ADR-0038.
  - **The first values evacuated the burst.** The cursor sits at the depth the camera
    is aimed at, which for a radially symmetric form is its *core* — so a push that
    seemed reasonable in the abstract emptied the exact point every filament converges
    on and left a hollow shell. It should disturb the matter, not demolish it.
  - Zero on touch, and released as the exit dive commits.
- **The scene now exits by flying through the event horizon.** The canvas used to just
  fade out under Impact, throwing away the one shape the whole roadmap had been
  building toward. Now the orbit collapses onto the disc's axis and the camera
  accelerates through the middle of the hole and out the far side, lens flaring to
  104°, with the fade landing on a camera already in the black. ADR-0039.
  - **The look-target has to be defined relative to the eye.** The dive's path passes
    through the origin, which is exactly where a target fixed on the disc's centre
    sits — they coincide mid-dive, `lookAt` gets a zero-length direction, and the
    frame empties outright. It did.
  - **And the pacing has to be read against the fade.** Crossing the disc plane too
    early spends a third of the dive looking at an empty void that is still
    two-thirds opaque. The plunge is cubed and starts later, so the plane is crossed
    at ~60% opacity — the arms are *seen* rushing past — and the far side arrives as
    the fade lands.
- Verified at 1440×900 (with a real cursor driven over the galaxy and the burst) and
  390×844: no console errors, and the cursor force is inert on touch.

## 2026-07-12 — hero drifts, burst clears, disc is truly orbited

- **The disc is now orbited in the *disc's own frame*** (`fromDiscFrame` in
  `Controller`; `MAEL_TILT` exported from `morph.ts`), and the tilt trap that two
  previous ADRs were spent tuning around simply stops existing. Circling about the
  world y axis on a disc raked 0.95 rad swings the eye *in and out of the disc
  plane*; build the orbit in the disc's frame at a fixed height out of that plane and
  the elevation is constant for the whole sweep, by construction. The swing goes 1.15
  → **2.6 rad (~150°)** with nothing to pay for it, and the flight now opens **close**
  — the disc fills the frame the moment the roadmap lands, and the move is the orbit
  itself rather than an approach to one. See [[decisions-log]] ADR-0037.
- **The burst reads as lines again.** The curl had been pushed to 0.95 to separate 520
  crowded filaments, which separates them and destroys the one thing that matters:
  *you have to see the lines leave the centre*. Crowding is a **density** problem, not
  a curl problem. So the per-filament brightness weighting is sharpened (only the top
  third of strands carries the light) and the curl goes back to the source's own
  restraint (0.5), with the sway halved. ADR-0036, amended.
- **The hero drifts.** `uniScale` 1.2 → 1.55 and the camera in to 10.5 on a 58° lens,
  so the galaxy overruns the frame on every side; and the eye now slowly **circles**
  it and rises as it goes. The galaxy already turned on its own axis, but a rotating
  object seen from a fixed point still reads as an object being *shown* to you —
  move the camera too and the parallax against the starfield makes it a place you are
  drifting through.
- Verified at 1440×900 and 390×844 across loader, hero, burst and the full roadmap
  orbit: no console errors.

## 2026-07-12 — plasma burst replaces the plume; the disc gets depth

- **The middle form is now a plasma burst** (`getlayers-scenes/plasma-burst.html`),
  recoloured to our blue: a white-hot core erupting into hundreds of curling,
  snaking filaments. The plume is gone.
  - **The source draws its filaments as `LineSegments`, and a point cannot morph
    into a line** — this scene is one `THREE.Points` carrying all three forms. So
    the burst is rebuilt as points strung *along* the filaments, which the buffer
    was already shaped for (arms × points-per-arm). See [[decisions-log]] ADR-0036.
  - Three things had to be true to make a point cloud pass as lines, and each cost
    an attempt: the **sprites must be big enough to touch** (at `burstSize: 9` every
    point resolved to under 1px and the form came out as a ball of dust — 44 gives a
    3px thread against 1.7px spacing); the **tips must stay lit** (the source's
    0.14 tip fade is right for lines and fatal for points); and the **filaments must
    not all be lit equally** (520 evenly-lit strands is a sphere, not a burst).
- **The disc has volume.** `maelThickness` 0.44 → 0.9 with an inner bulge: it was a
  spiral painted on a pane of glass, and flying around a plane just gives you a
  plane at another angle. **Depth is bought against structure and the rate is
  brutal** — the first attempt (2.4, bulge 3.2) grew the out-of-plane scatter larger
  than the event horizon itself, so the points spilled across the hole and filled it
  in. A black hole with no hole.
- **The roadmap flight starts earlier and travels further.** The approach now opens
  at the top of the slide (was: idle through its first third) and covers 50 → 27
  units rather than 46 → 30; the pass swings 1.15 rad and drops to y = −8, which
  opens the disc's face to ~32° of elevation by the end (ADR-0033's tilt rule: going
  *lower* opens the face). The lens widens to 78°.
- Verified at 1440×900 and 390×844 across loader, hero, burst and the full roadmap
  scroll: no console errors.

## 2026-07-12 — UI over the bigger scenes: scrim, tablet, fill rate

The scenes outgrew the UI that was built around them. This pass makes the page hold
them: contrast, the tablet range, and the frame budget.

- **The scene scrim is now the page's only contrast.** `.scene-overlay` gains a
  horizontal pass that darkens the two *edges* of the frame and leaves the middle
  untouched — copy lives at the edges in every section, scene subjects live in the
  middle in every scene, so they never compete for the same pixels. On a phone that
  logic collapses (text spans the full width), so it becomes a flat wash with a
  deeper vignette. **No section carries a plate or panel**; if copy is hard to read,
  the scrim is the knob. See [[decisions-log]] ADR-0034.
- **The chapter ledger collapses to one column at 991px, not 768px.** The whole
  tablet range was broken: the three columns held, but the centre column has an
  18rem floor, so the two chapter columns were squeezed to ~200px each and every
  title wrapped. `Sitemap` and `SitemapButton` move their resets to `pad-sm`.
- **Performance: the budget is fill, not particle count.** Measured, the *hero* is
  the slowest frame on the page — and it is the one form with no domain-warp in its
  vertex path. So the counts are untouched (they are the one knob that changes the
  look) and the fragments are attacked instead. ADR-0035.
  - **The starfield's sprites had no upper clamp at all** — its dust hangs in a slab
    *around* the camera, so a mote near the lens drew a sprite hundreds of pixels
    wide: full-screen additive fill from one vertex. Now clamped. The bokeh survives.
  - **The corner wash ran an 18-trig domain warp on every pixel** and then multiplied
    most of them by a corner mask of zero. The mask is evaluated first now and the
    warp skipped where it cannot show — identical output.
  - **Invisible points are clipped in the vertex shader** instead of being rasterised
    and discarded a pixel at a time. Below 1/255 of a channel under additive
    blending, they cannot change a pixel.
  - **Sprite ceiling 24px → 15px**, with each form's brightness paying back what it
    lost. Area is quadratic in that number, and it binds on the nearest points —
    which are also the ones that blow out to white.
  - Benchmarks came from a *software* rasteriser (±30% run-to-run), so every change
    above is justified structurally — strictly less work, identical output — not by
    a quoted frame time.
- Verified at 1440×900, 900×1180 and 390×844 across loader, hero, plume and disc:
  no console errors, no horizontal overflow, and the scenes render as before.

## 2026-07-12 — the roadmap flies the disc

The last scene no longer sits still while you read it. The roadmap is 2.5 viewports
of stages sliding past, and it is the only form the viewer *stays* with — so the
camera now flies across it, and the disc heats up as it comes.

- **A scroll-driven flight** (`Controller`, `CONFIG.maelApproach*` / `maelSwing`),
  keyed off `slideLocalProgress[ROADMAP]` rather than a clock: scroll down and you
  fly in, scroll back up and you retreat. An **approach** dollies from 46 units out
  to 30, then a **pass** swings 0.9 rad around the disc and drops below it while the
  lens widens 58° → 74°. See [[decisions-log]] ADR-0033.
- **The disc heats up on scroll** (`uMaelPhase` in `morph.ts`). The lensing crescent
  widens and burns harder, and the arms warm off the cold accent blue. It is the one
  colour animation in the scene, spent at the one moment the viewer is closing on
  something. The arms warm toward a pale blue and **not** toward the pink — warm
  both and the disc flattens into a single magenta plate.
- **The tilt trap.** The disc is raked 0.95 rad, so its plane normal has a negative
  y component: *raising* the camera swings it toward edge-on and *dropping* it opens
  the disc's face. The first pass at this flight put the eye at y = 4.5 on a
  1.35-rad swing — almost exactly in the disc plane — and the spiral foreshortened
  into one blown-out blade with the event horizon off-frame. The pass now ends below
  the origin, and elevation *opens* from ~20° to ~26° as the camera closes.
- The disc's aimless drift fades out as the pass takes over; two lateral movements
  on one axis, only one of them answering scroll, read as a wobble.
- Verified in-browser at 1440×900 and 390×844 across the slide's full scroll range,
  no console errors.

## 2026-07-12 — warp-tunnel loader, and all three forms scaled up

A pass for immersion. The load is now the flight *into* the scene, the galaxy is
already turning when you arrive, and the plume and the disc are sized to overrun
the frame rather than to sit inside it.

- **The preloader is a warp tunnel** (`objects/warp.ts`, replacing
  `objects/trails.ts`, deleted). Streaks fly at the lens down the z axis and
  perspective fans them out of the vanishing point. The load percentage **is** the
  throttle — the tunnel visibly winds up as the number climbs — and on destroy the
  warp *breaks*: the streaks stretch to full length in one jump as the field fades
  into the galaxy. See [[decisions-log]] ADR-0031.
  - Each streak accelerates along its own run (`life²`). Held linear, perspective
    foreshortening eats the sense of speed and the field reads as drift.
- **The loader readout matches the scene.** The bare `50%` is now a counter set in
  the wordmark's face over a hairline rail, low and centred — off the vanishing
  point, which is the one thing the tunnel is drawing the eye toward. The rail's
  fill is a **spring on `scaleX`**: the preloader emits whole percents, so the raw
  value steps. New `--shadow-loader-rail` token.
- **The galaxy arrives already formed** (`CONFIG.uniPrime`). It used to paint
  itself into existence over six seconds — a lovely entrance, and the wrong one to
  arrive on: the hero opened on a near-empty frame and the disc was only whole once
  you had started reading. Priming its clock by one lifetime lights every point on
  the first frame, so the arms are drawn at full length from the start. The hero
  camera comes in (z 15 → 12) on a wider lens (45° → 52°).
- **The plume is 3× the size, sunk 14 units, and framed from inside it.** Scale is
  applied as one multiplier *after* the billow, so every ratio the source scene
  tuned survives and the turbulence grows with the column. `plumeWidthGrow` and
  `plumeBillow` are up as well — coverage comes from smoke thrown sideways out of
  the silhouette, not from scale.
  - **Scaling an object does not make it bigger on screen.** Two passes at this
    framing rendered the plume *smaller* than before, because each pulled the
    camera back far enough to keep the whole column in shot. The camera is now
    framed against the column's bright body, not its bounding box. ADR-0032.
- **The maelstrom is 2× the size** (`maelRInner`/`maelROuter` 3.2/24 → 6.4/48) with
  the camera held exactly where it was — which is what *makes* it twice as large.
  - **Its sprites come down hard, 110 → 62**, with a tighter core and a faster halo
    falloff. `gl_PointSize` divides by view depth, so doubling the disc halved the
    distance to the near arm and every sprite on it doubled: most of the inner disc
    was pinned at the 24px clamp, and a spiral resolved out of blobs that large is a
    smear. The `sMael` size spread is flattened for the same reason.
  - Brightness pays back what the smaller sprites and the thinner spread cost
    (`maelBright` 0.36 → 0.55, arms lifted, `maelTwinkle` 1 → 0.75 — at 1 it drove
    points to zero and half the disc was unlit at any instant).
- **Copyright and theme-colour.** `themeColor` was still `#010101`, a neutral
  near-black left behind when the palette went deep blue — it paints the iOS status
  bar, and it read as a seam. Now `--background`. `copyrightYear` /
  `copyrightHolder` live in `siteConfig`, feeding both the footer's baseline line
  and a new `copyrightYear` / `copyrightHolder` pair on the JSON-LD `WebSite` node;
  they used to be stated independently.
- Verified in-browser at 1440×900 and 390×844 — loader, hero, plume and disc — with
  no console errors on either.

## 2026-07-12 — one scene in three forms, deep blue + pink

The scene is no longer three objects taking turns. It is **one point cloud that
transforms**: a galaxy that paints itself into existence on load, unravels into a
column of glittering smoke as you scroll into the chapters, and winds down into a
black hole's accretion disc at the roadmap. Same matter throughout. The palette
goes with it — deep blue, with pink kept scarce and hot.

- **`objects/morph.ts`** — the whole scene. Every particle carries the parameters
  of all three forms (ported from `getlayers-scenes/universe.html`, `plume.html`,
  `maelstrom.html`) and the vertex shader blends between them under two
  scroll-driven weights. Stagger, a mid-transition arc and swirl, and a
  mid-transition brightness boost are what make it read as matter being flung and
  re-gathered rather than as a lerp. See [[decisions-log]] ADR-0028.
- **`objects/starfield.ts`** — a far star shell and a near dust drift. They do not
  morph, and that is the point: without a fixed frame of reference the camera's
  flight reads as the *scene* moving rather than the viewer.
- **The camera is now flown** (`Controller`), blending position, look-at and FOV
  across the three framings — 45° over the galaxy, 60° over the disc. The forms keep
  their sources' world scales instead of being squeezed into one fixed frame.
- **Deep-blue ramp, pink signal** (`globals.css` + `lib/scene/palette.ts`).
  `accent-500` is `#3a5cff`; `signal-glow`/`signal-ring` are pink. No component
  changed — none of them ever held a colour. See ADR-0029.
  - Pink appears in exactly three places in the scene: the galaxy's rarest stars,
    the plume's white-hot tip, the maelstrom's lensing crescent.
- **`three` is now an actual dependency**, pinned to 0.162.0 — it was imported
  everywhere and declared nowhere, so a clean install could not build. The pin is
  load-bearing: `canvas3d.ts` uses `WebGL1Renderer`, removed in r163. See ADR-0030.
- **Removed:** `objects/vortex.ts`, `objects/tree-of-life.ts`, `objects/6.ts`,
  `objects/points.ts`, `common/flypointpass.ts`, `extensions/Controls.ts`. Scene fog
  (never consumed by any material here) is gone; `Camera.far` is 80 → 600.

## 2026-07-12 — new hero + chapters scenes, deep emerald palette

Both of the first two scene objects are replaced, and the accent ramp moves off
the sage it inherited from the original HELIOS build.

- **Hero is now a vortex** (`objects/vortex.ts`), ported from
  `getlayers-scenes/vortex.html`. A bright core ringed by a swirling halo of fine
  particle streaks; brightness pulses race outward along each strand, and a
  minority of points render as binary 0/1 glyphs off a canvas atlas. Keeps the
  hero language it replaces: a burst out of the core on entrance (armed on the
  first frame the hero is *visible*, not at construction — the preloader owns the
  screen for ~5s before that), a pointer-driven void, and a scroll response that
  spins, expands and pulls the group back **without moving the shared camera**.
  - Replaces `objects/pinwheel.ts`, deleted.
- **Chapters is now a tree of life** (`objects/tree-of-life.ts`), ported from
  `getlayers-scenes/tree-of-life.html` — canopy dome, braided twisting trunk,
  fanning roots, bright structural branches, all drawn in tangled scribble
  filaments. It grows **from the roots up as you scroll into the section**
  (`uGrow` is driven by the enter ramp, not by a clock — [[decisions-log]]
  ADR-0027), and leaving lifts the camera up through the canopy. It stands in the
  hole the chapter ledger already left in its centre column, so the Sitemap
  layout is unchanged.
  - Replaces `objects/blob.ts`, deleted.
- **Both ports are rescaled to the shared camera** (ADR-0026). The upstream scenes
  own their own cameras; lengths, angles, squared-length falloffs and sprite
  scales each convert differently, and every one is commented at its config line.
- **The accent ramp is a deep emerald** (ADR-0025): `accent-500` `#9bc26a` →
  `#2eb37c`, `accent-900` → `#04150e`, and `--background` is now a green-black
  `#020a07`. `lib/scene/palette.ts` (the GPU mirror) moves with it.
  - **Recolouring an additive scene is not just swapping the colour uniforms.**
    Additive blending drives every channel to 1.0 where sprites crowd, so dense
    regions saturate to white *whatever* their hue — both scenes read silver until
    brightness came down (vortex 2.3 → 1.15, tree 1.25 → 1.0) and the base colours
    moved to low-red greens. On a dense additive scene, brightness is a hue
    control. See ADR-0025.
  - **`objects/6.ts` (roadmap terrain) held the old sage as hardcoded `Vector3`s**
    and went on rendering it after the ramp moved. It now reads `color()` from the
    palette.
- Verified in-browser at 1440×900 and 390×844: hero burst, vortex swirl and star,
  the tree's scroll-coupled growth, its rise-through-the-canopy exit, and no
  shader-compile or console errors on either viewport.

## 2026-07-11 — chapters blob: solaris structure, camera entrance

Second pass on the chapters blob (`objects/blob.ts`), all against
`getlayers-scenes/solaris.html` (shape/structure only — palette unchanged):

- **Particle structure back to solaris' dense lat/long `SphereGeometry`** instead
  of the Fibonacci scatter, so the shell combs into the reference's structured
  rings and meridians. `SEGMENTS` per tier (~3:1 height:width) replaces `COUNT`;
  the index is dropped so `THREE.Points` draws one point per vertex. Reverses the
  earlier anti-moiré decision by design direction — [[decisions-log]] ADR-0024.
- **Entrance now emerges from the camera** and recedes to the settle depth
  (`FLY_FROM = { y: 0, z: 1.0 }`), rather than rising from below the frame.
- **Visible back side.** New `uBackFloor` (0.16) lifts the Fresnel hollow so the
  far side of the shell shows faintly through the additive blend — a translucent
  sphere rather than a bare ring.
- **Smoother bottom gradient.** Bottom colour deepened `accent700 → accent900`
  and the body gradient widened `smoothstep(-0.72, 0.72) → (-1.0, 1.0)`, so the
  deep base eases up into the signal green pole to pole with no flat caps.

## 2026-07-11 — horizon dives into the camera on exit

- **The roadmap terrain ("horizon", the last scene) now surges into the camera and
  distorts as the section leaves**, instead of quietly fading. A new `uExit`
  uniform (0→1) tears the ridges upward and churns the field, while
  `Object6.render` pushes the whole lattice toward the lens by `EXIT_ZOOM`. See
  `objects/6.ts`.
- **Driven by `Controller.roadmapExit`**, a monotonic ramp keyed off Impact's top
  (like `useSceneVisibility`), leading the canvas fade by a quarter viewport so the
  dive is well underway before the fade dissolves it. The terrain is held fully
  formed through the surge (`form = max(progress, exit)`) so the kernel can't
  flatten it mid-dive.
- Editing the vendored `objects/6.ts` is covered by [[decisions-log]] ADR-0023.

## 2026-07-10 — blob takes the solaris shape

- **The chapters blob is reshaped after `getlayers-scenes/solaris.html`**, keeping
  our sage palette. It is no longer a lumpy mass but a *sphere that boils*:
  - Two simplex octaves (full weight + half) replacing three, sampled in
    unit-sphere space at solaris' frequencies (2.1 and 6.3 — its `position * 0.5`
    and `* 1.5` on a 4.2-unit sphere), on fast clocks so the surface boils rather
    than drifts.
  - Displacement cut from 34% of the radius to **12%** (solaris' 0.5 world units
    on a 4.2 sphere). That restraint is the whole difference between a rippling
    sphere and a potato.
  - A hard Fresnel edge fade, `smoothstep(0.4, 0.9, rim)` instead of
    `(0.15, 0.95)`, and alpha that **is** the edge fade rather than a floor plus a
    rim term — this hollows the centre and leaves the glowing ring that is the
    scene's signature.
  - One linear colour gradient across `y + x * 0.5` (normalised to the unit
    sphere), two stops, no per-crest tinting: `accent-700 → signal-glow`. The
    `accent-400` mid stop is gone.
  - `POINT_SIZE` 8 → 9.4 to give the rim body: solaris packs a 200×600 lattice
    into its ring, and we hold 70k Fibonacci points over a larger apparent shell.

- The rise-from-below entry, the zoom-through exit, the per-point halo bloom and
  the device tiering are unchanged.
- Verified at 1440×900 and 390×844: no console errors, palette tokens only. On
  mobile the hollow core is a bonus — the chapter ledger sits inside the dark
  centre.

## 2026-07-10 (earlier) — performance pass + blob scale

- **Loader 5s → 1.8s.** Nothing actually loads (no models, no textures), so the
  tween only has to cover the scene's first paint. Measured ~2.5s from navigation
  to loader gone, including page load.

- **Blob doubled and brightened.** `RADIUS` 1.12 → 2.2; it now fills nearly the
  whole frame. Colour ramp lifted (`accent-700 → accent-400 → signal-glow`) and
  the per-point halo strengthened, so the bloom takes hold instead of settling at
  a flat mid-green.
  - **Point size, not point count.** `gl_PointSize` divides by view depth, so
    pushing the bigger blob back to fit shrank every sprite and the shell read as
    dust. `POINT_SIZE` 3 → 8 restores the density with *half* the points.
  - **Zoom-through exit.** Scrolling on to the roadmap now rushes the blob past
    the camera as it fades. This needed **separate enter/exit ramps**: the
    visibility kernel is symmetric and cannot distinguish arriving from leaving.
    `Controller.chaptersRamps()` derives them from the viewport centre's position
    within the slide. Opacity fades ahead of the zoom (`pow(1-exit, 1.7)`) and
    the geometry jitter was raised — held linear, the camera ends up inside the
    shell where its Fibonacci lattice reads as a dot grid.

- **Corner flames wider and stronger** — `uSpread` and `uIntensity` uniforms on
  the final pass, and the diagonal mask is squared once instead of twice so the
  flames no longer pinch shut.

- **Performance.** See [[decisions-log]] ADR-0022. New `src/lib/scene/device.ts`
  tiers everything in one place.
  - Pixel ratio clamped to 0.75–1.5, and to **1.0 on mobile** — applied in both
    `Canvas3d` and `Composer` (the composer owns its own render targets).
    Verified: a 3x phone now renders a 390px buffer, not 1170px.
  - Scene frame budget: 30fps mobile / 45fps tablet / uncapped desktop. The
    ticker throttles subscribers independently, so springs are unaffected.
  - **On-demand render:** `isSceneVisible()` skips the draw entirely when the tab
    is hidden or the canvas has faded out below the roadmap. Measured 144 ticks /
    0 renders while Impact is on screen, resuming on scroll-back.
  - Particle counts roughly halved per tier: galaxy arms 120k → 55k desktop /
    14k mobile; blob 150k → 70k / 13k; terrain lattice 100×100 (fixed) → 56×56
    on mobile.
  - Mobile scroll lerp 0.08 → **0.22**. At 30fps the render lag and the smoothing
    lag compound, and the scene visibly trailed the thumb.
  - Not applicable: low-res textures and fewer light sources — this scene has
    neither. It is point clouds and one shader pass.

- Verified at 1440×900, 1024×768 and 390×844 (mobile at DPR 3): blob approach /
  settle / hold / zoom-out, no horizontal overflow, no console errors.

## 2026-07-10 (earlier) — one blob, UI around it

- **The chapters scene is now a single large particle blob** (`objects/blob.ts`),
  replacing the three merging orbs (`objects/orbs.ts` deleted). 150k points on
  desktop / 80k tablet / 32k mobile, a Fibonacci shell displaced by three simplex
  octaves running on different clocks and scales, so it swells and folds rather
  than wobbling as a bumpy sphere.
  - **It flies in from the bottom.** Position and scale interpolate from below
    the frame (`FLY_FROM`) to dead centre (`SETTLED`) off the slide's visibility
    kernel, so the rise is tied to scroll rather than a one-shot timer — it sinks
    back out as the section leaves.
  - **Bloom is drawn per point**, a tight core inside a wide additive halo, not
    with `UnrealBloomPass`. Fine point clouds flicker through that pass, which is
    why the post chain still has none. See [[decisions-log]] ADR-0019.
  - `SETTLED_Z` steps back at tablet and mobile: a blob sized against the frame
    height overflows a narrow frame's width.

- **The chapters UI is rebuilt around the blob** — "ring around the core". The
  section is a three-row stack: header top-left, chapter list in the middle, CTA
  bottom-centre. The list stays **one `<ol>`**, laid out on a 3-column grid whose
  **centre column is deliberately empty** (that hole is the blob). Chapters 01–03
  take the left column, 04–05 the right, mirrored and offset down a row so the
  halves interlock. Below 768px it collapses to a single un-mirrored column.
  - `SitemapButton` gains `align?: "left" | "right"`. Mirroring is CSS-only
    (`flex-row-reverse` + `max-md:` resets), never a JS width branch, so the DOM
    and reading order stay 01→05.
  - Tablet's centre column widened to `minmax(18rem,30rem)`; at `20rem` the blob
    overran it and the row arrows landed on the shell.

- Verified at 1440×900, 1024×768 and 390×844, both mid-rise and settled: no
  horizontal overflow, no console errors.

## 2026-07-10 (earlier) — scene shape + merging orbs

- **The hero galaxy now holds its shape.** Its rotation was purely differential
  (dividing by the radius), so the core kept winding past the rim and the spiral
  smeared into a flat disc within a minute — immersive on entry, shapeless after.
  Rotation is split: a **bounded** differential term that ramps with the entrance
  and then holds (`CONFIG.windLimit`), plus an unbounded **rigid** term that
  turns the settled disc as one body. Verified over a 30-second soak. ADR-0021.

- **The chapter orbs merge.** Each shell's vertex shader samples a metaball field
  from its two neighbours and drags its surface toward them, so a bright neck
  forms where they fuse (`MERGE_STRENGTH`, `blob()` in `objects/orbs.ts`). The
  per-orb spin is removed — the field is evaluated in group-local space, which is
  only valid while the child transform is a pure translation. A `smoothstep`
  releases the pull deep inside a neighbour; without it, points crossing the
  neighbour's centre invert their pull direction and shoot out as spikes.

- **Orbs are much bigger and centred.** Radii ~1.6x again (largest ≈ the full
  visible height at its plane), orbits shortened so the shells always
  interpenetrate, cluster pulled back (`VISIBLE_Z`) and in from the left edge so
  it no longer runs off-frame. 42k points per orb on desktop.
  - Trade-off: at this size the cluster passes behind the chapter ledger's index
    numerals and some subtitles. Titles stay legible (white on dark shells).
    `CLUSTER_OFFSET.xFraction` is the knob if it needs pulling further left.

- Verified at 1440×900, 1024×768 and 390×844: no horizontal overflow, no console
  errors, cluster fully in frame at every width.

## 2026-07-10 (earlier) — VANTA polish

- **Hero entrance is a burst from the centre.** The pinwheel used to slide in
  from `z = -20`. Now every point launches radially out of the core with a
  per-point stagger (`uAppear`), the bulge leading the arms, while the disc spins
  hard and decelerates (`CONFIG.appearSpin`). The burst is armed on the first
  frame the hero is *visible*, not at construction — the preloader owns the
  screen for ~5s before that, and a constructor-timed entrance played out unseen.

- **Hero bloom flicker fixed.** Root cause was an unbound `sampler2D` in the
  final pass, not bloom at all. Post-processing collapsed from three
  `EffectComposer`s to one. See [[decisions-log]] ADR-0019.

- **Orbs ~2.4x bigger**, denser (30k points desktop), pushed back and left so the
  cluster reads as an immersive object without swallowing the chapter ledger.
  Added a tablet particle tier for both orbs and the pinwheel.

- **Terrain travels one way and never freezes.** Its second morph stage (which
  slid the lattice along x, reading as the landscape veering right) is deleted;
  only the z travel remains, unclamped, wrapped by `fract()`. The old
  `Math.max(anim, scrollProgress)` ratchet froze the terrain solid on an upward
  scroll — it now advances from elapsed time plus the **absolute** scroll delta,
  so it drifts when idle and keeps travelling whichever way you scroll.
  - Also fixed: `Object6.resize()` was entirely commented out (it referenced a
    `starsPass` that no longer exists), so `iResolution` never updated and the
    point sizing went wrong after any window resize. It now updates, and is
    seeded from the constructor per ADR-0017.

- **Impact + Footer redesigned** to the instrument-panel language: Impact is a
  left-aligned outcome board whose metrics are a hairline-ruled `<ol>` ledger
  rhyming with the chapter ledger; the footer is the closing plate. The
  roadmap→impact gap dropped from `mt-60` to `mt-24`, and the footer's own top
  margin from `60vh` to `16vh`.

- **One page gutter.** `container-shell` deleted in favour of `page-gutter`,
  shared by the header and every section, so the header wordmark lines up with
  the hero wordmark. Brief and Impact are now left-aligned to it rather than
  centred. See [[decisions-log]] ADR-0020.

- Verified at 1440×900, 1024×768 and 390×844: no horizontal overflow, gutters
  aligned, canvas opacity 0 at Impact and through the footer, no console errors.

## 2026-07-10 (earlier) — VANTA

- **Renamed the project HELIOS → VANTA** across content (`data/mocks/home.ts`),
  SEO (`lib/site.ts` → metadata, JSON-LD, sitemap) and the contact domain.
  Provenance comments that describe the port ("ported from the original helios
  build") intentionally keep the old name — they are history, not content.

- **New scene set.** See [[decisions-log]] ADR-0017 / ADR-0018.
  - *Preloader* → **falling light trails** (`objects/trails.ts`), replacing the
    spiral. Keeps the load contract: a 5s tween emitting `LOADING`, then
    self-destruct + `loaderdestroy`.
  - *Hero* → **pinwheel galaxy** (`objects/pinwheel.ts`), ported from
    `getlayers-scenes/pinwheel-galaxy.html` and recoloured to the sage tokens.
  - *Chapters* → **three counter-orbiting particle spheres** (`objects/orbs.ts`),
    noise-churned Fresnel shells on a Fibonacci lattice.
  - *Roadmap* → the terrain keeps its object but gains a **ridged height field**
    (`1 - abs(fbm)` plus two crossed swells) and a **jittered, depth-packed point
    layout**; its morph now **only runs forward**.
  - *Impact* → **no scene at all**. The canvas fades out and the section is UI on
    a plain background. `objects/8.ts` deleted.
  - Deleted: `objects/1.ts`, `2.ts`, `3.ts`, `8.ts`, `common/pointpass.ts`,
    `common/addpass.ts`, `public/assets/scene/light-8.png` (3 MB).
  - New: `lib/scene/palette.ts` (tokens as GPU vectors), `lib/scene/glsl.ts`
    (shared simplex-noise chunk), `hasPointer()` in `lib/scene/mouse.ts`,
    `scrollState.slideRange`, `hooks/sections/use-scene-visibility.ts`.
  - `scene/three/constants.ts`: the load event was the string
    `'three/objects/1:loading'`, naming a file that no longer exists — renamed to
    `scene:loading`, and the `loaderdestroy` literal is now `events.LOADER_DESTROY`
    rather than being repeated at each call site. The dead `STATECHANGE` id is
    dropped (its listener went in ADR-0016); `SETCHANGING` stays, still unheard.

- **Sections redesigned** to an instrument-panel editorial language, replacing
  the centred/scattered layouts that suited the old scenes:
  - *Hero* — asymmetric masthead: eyebrow index top-left over a hairline, the
    wordmark anchoring the lower-left, brief + CTA bottom-right.
  - *Chapters* — a two-column **chapter ledger** (heading left, five hairline-
    ruled rows right) replacing the five-node constellation. `SitemapButton` lost
    its glow/dot/mirrored props; `useCursorParallax` and the `glow-node*`,
    `node-dot`, `sitemap-card` utilities are deleted.
  - *Roadmap* — a **timeline rail** with stations and ghosted numerals, replacing
    the alternating left/right stages.
  - Verified at 1440×900 and 390×844: no horizontal overflow, canvas opacity 1 →
    0 across the roadmap→impact boundary and staying 0 through the footer.

## 2026-07-10

- **Rebuilt the HELIOS site into this starter.** Ported the original Create React
  App build (`../helios`) — a single scrolling case study over a persistent
  Three.js scene — onto Next 16, Tailwind v4 tokens, and the spring animation
  system.
  - **New dependency:** `three@0.143.0`, pinned. See [[tech-stack]] and
    [[decisions-log]] ADR-0014.
  - **Motion rewritten.** The original's SCSS transitions, its hand-rolled rAF
    reveal in `Sitemap.tsx` (a workaround for `backdrop-filter` transitions
    misfiring on iOS), and its `IntersectionObserver` + `-in` class pattern in
    `Brief`/`Impact` are all gone, replaced by `<Spring>`, `<Inview>`, `<Hover>`
    and `TextEngine`. The original's `cubic-bezier` curves survive as
    `@/utils/animation/easing`, so the timing is unchanged.
  - **One render loop.** The scene, the scroll-progress controller, and every
    `Tween` now subscribe to `src/lib/animation/ticker.ts` instead of opening
    three separate rAF loops. ADR-0016.
  - **No adaptive grid.** Root font-size is a fixed 16px; `<AdaptiveGrid>` is
    dropped from the layout. ADR-0015.
  - **`<LazyCookie>` removed from the root layout** — the consent banner rendered
    over the hero and the original site has none. The component is untouched;
    restore it by rendering it inside `ScrollLayout` in `src/app/layout.tsx`.
  - **`<Menu>` stays mounted while closed** (inert + `pointer-events-none`) so its
    exit spring can play, rather than unmounting and snapping away.
  - **Fonts:** Onest replaced by self-hosted Gilroy + Lato (`src/lib/fonts.ts`).
  - **Routes:** `/` plus the six section deep-links (`/sitemap`, `/partners`,
    `/roadmap`, `/product`, `/social`, `/investors`) as a static `[section]`
    segment, replacing react-router.
  - New catalog entries in [[components/common]], [[hooks]], and [[utils]].

## 2026-06-07

- **Fixed `<Inview>` standalone reveal + spring resize gating** — `<Inview>`
  never animated unless an external `trigger` ref was passed. The JSX `ref`
  callback wrote `inViewRef.current = node`, but that tuple slot is a *callback
  ref* (`setNode`), so the element was never observed and the `node` stayed
  `null`. Now calls `setInViewNode(node)`. This was also a build-breaking type
  error. Additionally, `<Inview>`, `<Spring>`, and `<Hover>` tracked `width` as a
  hook dependency but never passed it to `isMobileDisabled` — fixed by passing the
  tracked `width`, restoring resize re-evaluation and clearing the
  `react-hooks/exhaustive-deps` warnings. `yarn build` and `yarn lint` are now
  clean. See [[decisions-log]] ADR-0013 and [[components/animation-springs]].

## 2026-06-05

- **Home view emptied** — removed the animation showcase (`src/views/home-showcase.tsx`
  deleted) and reduced `HomeView` to an empty `<main>`. The home view is now the
  blank starting point for new work. Documented the convention — *if the project
  is empty and no other instructions are provided, start developing in the home
  view on route `/`* — in [[ai-agent-guide]] and [[new-page]].

## 2026-05-23

- **README — setup + Vercel deploy steps added** — *Getting started* expanded
  into a four-step flow (clone the template → delete bundled `.git` →
  initialise your own GitHub repo → install & run), with a macOS hint for
  revealing the hidden `.git` folder (`⇧ + ⌘ + .`). Added a *🚀 Deploy to
  Vercel* section covering the CLI flow (`vercel` / `vercel --prod`) and the
  dashboard import path, plus an `env pull` pointer to
  [[environment-variables]].
- **README rewritten to lead with the AI workflow** — root `README.md`
  reorganised so the AI usage guide is the first section: how the three
  `.claude/settings.json` hooks (`SessionStart`, `UserPromptSubmit`, `Stop`)
  enforce the vault workflow automatically, how to write a good request
  against this convention layer, and a cost-expectations note recommending
  **Claude Max (5×)** as the minimum plan (the vault-fan-out + hook
  re-injection on every turn is token-intensive by design). Technical
  *Getting started* and the existing AI-agents entry-point pointer stay
  below.

## 2026-05-22

- **Styling-placement convention added** — to stop `globals.css` accumulating
  hundreds of component-specific classes, styling now follows a strict
  placement order: one-offs are Tailwind utilities, repeated patterns become
  **React components** (not `@layer components` classes), and `@layer
  components` is reserved strictly for pseudo-elements and third-party
  overrides. `globals.css` stays bounded — `@import`, tokens, base resets only.
  No CSS Modules. Codified in [[decisions-log]] ADR-0012; [[design-system]]
  (new *Where a style goes* section) and [[component-conventions]] updated.
- **Semantic-HTML / SEO-markup convention added** — new [[html-semantics]]
  rulebook: landmarks, one `<h1>` + heading outline, native elements over
  `div`s, forms/images/ARIA, JSON-LD over microdata, a `data-*` convention, and
  passing a semantic `tag` to animation components. Codified as AGENTS.md hard
  rule #10; cross-linked from [[component-conventions]] and [[new-page]]. Fixed
  the demo (`home-showcase.tsx`) to a single `<h1>` to follow it.
- **API layer added** — a convention for reaching external services.
  `app/api/<resource>/route.ts` Route Handlers own their logic and read secret
  env vars directly (safe — route files never reach the browser). New: `zod`
  dependency; `src/env.ts` (validated env, public/server split); `src/lib/api/`
  (`handle` wrapper + `ApiError` + `{ data }`/`{ error }` envelope);
  `src/lib/api-client.ts` (typed same-origin fetch); example
  `app/api/contact/route.ts`. Codified as AGENTS.md hard rule #9. See
  [[decisions-log]] ADR-0011 and [[api-architecture]].

## 2026-05-21

- **Asset convention added** — site content assets (images, videos) now live
  under `public/assets/<section>/`, one folder per section; meta/PWA/SEO assets
  stay at the `public/` root. Documented in [[folder-structure]],
  [[component-conventions]], and the [[new-page]] playbook; `public/assets/`
  created with a `.gitkeep`.
- **SEO & performance hardening** — a broad pass on the starter. **SEO:** new
  `src/lib/site.ts` config (single source of truth, fed by `NEXT_PUBLIC_SITE_URL`);
  `metadataBase` is now always set (relative OG/canonical URLs resolve);
  `themeColor` moved to a `viewport` export; added `app/robots.ts`,
  `app/sitemap.ts`, and an `Organization`+`WebSite` JSON-LD helper; OG image
  dimensions corrected to match the asset; dead `keywords`/`other` tags dropped.
  **Performance:** populated `next.config.ts` (`removeConsole` in prod,
  AVIF/WebP, `next/image` breakpoints aligned to the grid, `poweredByHeader:
  false`); fixed a `requestAnimationFrame` leak in `ScrollLayout` (Lenis loop
  never cancelled on unmount); `HomeView` is now a Server Component with the
  animation demo split into the `HomeShowcase` client leaf; added
  `<ReducedMotion>` (honours `prefers-reduced-motion` via react-spring's global
  `skipAnimation`); removed a per-frame `console.log` from the demo; added
  `app/loading.tsx` / `error.tsx` / `not-found.tsx`. See [[decisions-log]]
  ADR-0010, [[seo-metadata]], and [[environment-variables]].
- **Animation engine — lint pass** — cleared all 13 pre-existing ESLint problems
  in the engine (2 errors + 11 warnings), an authorized engine edit (ADR-0009).
  `isMobileDisabled` now takes an optional `viewportWidth` argument, so the
  `active` memos in `<Spring>` / `<Hover>` / `<Inview>` / the trigger hooks
  depend on it genuinely. Added missing `disableOnMobile` effect deps; fixed a
  `trigger.current`-in-cleanup hazard in `<Hover>`; ref-stabilised `<Handle>`'s
  transition effects. **API change:** `useProgressTrigger` now returns `progress`
  as a `RefObject<number>` (read `.current`) instead of a render-time ref read —
  no consumer was affected (`<ProgressTrigger>` discards the return).
- **Animation engine — performance refactor** — fixed load issues that scaled
  with the number of animated components. Added `src/lib/animation/ticker.ts`, a
  single reference-counted `requestAnimationFrame` loop; `useLoop` (and all loop
  hooks) now subscribe to it instead of each starting its own rAF. `useWindowWidth`
  / `Height` / `Size` now share one debounced `resize` listener via a
  `useSyncExternalStore` store (the `debounceDelay` param was dropped — unused).
  `useDynamicInView` rewritten without the per-render `Proxy`/observer churn.
  Fixed a stale-closure bug in `useLoop`. `mode="forward"` scroll listeners made
  `passive`. This was an **authorized edit to `#do-not-modify` engine files** —
  hard rule #2 amended. See [[decisions-log]] ADR-0009 and [[animation-system]].
- **`spring-text-engine` updated** — bumped `^0.1.3` → `^0.1.5` (latest). The
  public API, types, and dependencies are unchanged between these versions
  (verified) — an internal-only patch bump, no code changes required.
- **Adaptive scaling grid added** — a root-font-size scaling system landed in
  `src/components/common/grid/` (`<AdaptiveGrid>` + `useAdaptiveGrid` hook +
  `grid.config.ts`), with `vw` media queries in `globals.css` for scale-down.
  It was dropped into `common/` as a `styled-components` system; ported to the
  project stack — config-driven TS + CSS-only Tailwind, no `styled-components`.
  The unused dropped files (`colors.ts`, `fonts.ts`, `utils.ts`, `index.ts`,
  the `styled-components` `grid.tsx`) were removed. Mounted via `<AdaptiveGrid>`
  in the root layout. See [[components/common]] and [[decisions-log]] ADR-0008.
- **Vault created** — `obsidian/` Obsidian vault initialised as the project's
  second brain. Architecture, frontend, and workflow docs populated. See [[decisions-log]] ADR-0001.
- **Root README rewritten** — replaced `create-next-app` boilerplate with a real
  project README that points into this vault.
- **`generic-layout-prompt.md` moved** — relocated from repo root to
  `obsidian/workflows/` as [[generic-layout-prompt]].
- **Navigation convention resolved** — standard `next/link` confirmed; the unbuilt
  `<AnimLink>` / `useAnimRouter()` convention dropped. See [[decisions-log]] ADR-0005.
- **Docs consolidated into the vault** — `project-specs.md` deleted (decomposed into
  vault notes + new [[environment-variables]]); `text-engine-docs.md` moved in as
  [[text-engine-reference]]. `AGENTS.md` rewritten as a thin shim; `.cursorrules`
  repointed to `@AGENTS.md`. The vault is now the single source of truth.
  See [[decisions-log]] ADR-0006.
- **Vault renamed & restructured** — vault folder `getlayers.io/` → `obsidian/`;
  number prefixes dropped from section folders (`00-meta` → `meta`, etc.). Project
  name standardised to **`next16-claude-starter`** across docs and `package.json`.
- **Components linked to docs** — every file in `src/components/` now carries a
  `// 📖 Docs:` pointer comment to its catalog note, so agents can jump from code
  to docs and back.
- **Vault workflow automated** — added `.claude/settings.json` with `SessionStart`,
  `UserPromptSubmit`, and `Stop` hooks that make agents read the vault first,
  follow the relevant guide, and update docs after every change — with no manual
  reminder. See [[decisions-log]] ADR-0007 and [[ai-agent-guide]].
- **Cookie component replaced** — the `react-cookie-consent`-based `cookie.tsx`
  was replaced by an in-house `Cookie/` component (banner + category preferences
  modal + Zustand store). `react-cookie-consent` removed from dependencies. The
  component shipped using `styled-components` + an external design system; it was
  ported to the project stack — Tailwind v4 tokens and `@react-spring/web` motion.
  Mounted via `<LazyCookie>`. See [[components/common]].
- **Fixed TextEngine spring type mismatch** — the `mode="once"` heading in
  `views/home.tsx` mixed `lineIn={{ y: 0 }}` (number) with `lineOut={{ y: "100%" }}`
  (string), throwing *"Cannot animate between _AnimatedString and _AnimatedValue"*.
  Changed to `y: "0%"`. The buggy pattern in [[text-engine]] / [[text-engine-reference]]
  examples was corrected and a type-matching gotcha note added.

## Project baseline (git history)

| Commit | Description |
|--------|-------------|
| `94b0870` | feat: update starter |
| `5280ef2` | fix: linter errors & build |
| `b2b84e6` | initial — `next16-claude-starter` scaffold |

> [!note]
> The starter shipped with: Next.js 16.2, React 19.2, Tailwind v4, `@react-spring/web`,
> `spring-text-engine`, Lenis, and Zustand. See [[tech-stack]] for the current state.
