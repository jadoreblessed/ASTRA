---
tags: [frontend, stable]
updated: 2026-05-21
---

# Catalog — Common Components

Files in `src/components/common/` — shared infrastructure that may depend on
providers. Conventions: [[component-conventions]].

## Cookie — `Cookie/`

Self-contained cookie consent system — a bottom-right **banner** plus a full
category **preferences modal**. No third-party library (the old
`react-cookie-consent` dependency was removed). Lives in `src/components/common/Cookie/`.

| File | Role |
|------|------|
| `Cookie.tsx` | Mount component — hydrates the store, renders banner + modal |
| `LazyCookie.tsx` | `next/dynamic` `ssr:false` wrapper — keeps cookie JS out of first-load |
| `CookieBanner.tsx` | Bottom-right consent banner |
| `CookiePreferencesModal.tsx` | Category preferences dialog with per-category toggles |
| `CookieButton.tsx` | Local button primitive — `primary` / `secondary` variants |
| `cookieStore.ts` | Zustand store + `localStorage` persistence |
| `index.ts` | Barrel exports — `Cookie`, `LazyCookie`, `useCookieStore`, `CookieConsent` |

**Mounting** — the root layout renders `<LazyCookie />` inside `ScrollLayout`:
```tsx
import { LazyCookie } from "@/components/common/Cookie";
```

**State** — `useCookieStore` (Zustand). `consent` is `null` until the user decides;
the banner shows only after hydration confirms `consent === null`. Persisted to
`localStorage` under key `cookie-consent-v1`. Three categories: `necessary`
(always on), `analytics`, `marketing`.

**Styling & motion** — ported to the project stack: Tailwind v4 with the
`background` / `foreground` design tokens (dark-mode adaptive, no hardcoded hex),
and `@react-spring/web` for all motion — `useTransition` drives the banner and
modal mount/unmount, `useSpring` drives the toggle knob. No CSS transitions.
The modal locks scroll through the Lenis [[smooth-scroll|scroll store]]
(`useScroll.stop()`), not `body` overflow.

> [!note] `#todo`
> The privacy-policy link points to `/privacy-policy` — that route does not exist
> yet. Placeholder consent copy should be reviewed before launch.

## Grid — adaptive scaling (`grid/`)

The **adaptive scaling grid** keeps a rem-based layout proportional across every
viewport by scaling the root (`<html>`) font-size. Design in `rem` once, and the
whole UI scales as one unit. Lives in `src/components/common/grid/`.

| File | Role |
|------|------|
| `grid.config.ts` | Breakpoints + `FONT_BASE` — the single source of truth for the grid |
| `adaptive-grid.tsx` | `<AdaptiveGrid>` client component — drives the scale-up, renders `null` |
| `index.ts` | Barrel exports — `AdaptiveGrid`, `GRID_BREAKPOINTS`, … |

**How it works** — two halves cover the whole viewport range:

- **Scale down** (viewport ≤ 1920px) — `vw`-based `html { font-size }` media
  queries in `globals.css`. At each breakpoint's design base width the root
  font-size resolves to 16px; between breakpoints it tracks the viewport.
- **Scale up** (viewport > 1920px) — the `<AdaptiveGrid>` component sets an
  inline `html` font-size at runtime via [[hooks|`useAdaptiveGrid`]], so the
  design keeps growing (damped by `coef`) on large displays.

The `globals.css` media queries and `grid.config.ts` describe the same
breakpoints — **keep them in sync** (formula: `font-size = 16 * 100 / baseWidth vw`).

**Mounting** — the root layout renders `<AdaptiveGrid />` inside `ScrollLayout`:
```tsx
import { AdaptiveGrid } from "@/components/common/grid";
```
Mount it once. Props: `baseWidth` (defaults to the largest breakpoint) and
`coef` (0–1 scale-up damping, default `0.6666`).

> [!note]
> This replaced a `styled-components`-based scaling system that was dropped into
> `common/` — see [[decisions-log]] ADR-0008. `styled-components` is **not** a
> project dependency; the scale-down CSS lives in `globals.css` per [[design-system]].

## ReducedMotion — `reduced-motion.tsx`

`<ReducedMotion>` — a client leaf that calls react-spring's `useReducedMotion()`.
It watches the `prefers-reduced-motion` media query and toggles react-spring's
global `skipAnimation`, so every spring — and `spring-text-engine` — jumps to its
end state instead of animating. Renders `null`; mounted once in the root layout.
See [[animation-system]] and [[seo-metadata]].

> [!note] This governs **react-spring only**, not the WebGL scene. The scene reads
> its own `sceneShouldFreeze()` (`lib/scene/device.ts`) and freezes on a still frame
> under reduced motion / energy-saver — see [[decisions-log]] ADR-0044. The two
> honour the same OS setting by separate paths.

## Skeleton loaders

Three skeleton components for `loading` states of async-data components — every
async component must mirror its final layout with one of these
(see [[component-conventions]]).

| Component | File | For |
|-----------|------|-----|
| `<SkeletonImage>` | `skeleton-image.tsx` | image placeholders |
| `<SkeletonLoader>` | `skeleton-loader.tsx` | generic block placeholders |
| `<SkeletonVideo>` | `skeleton-video.tsx` | video placeholders |

## Scene — `common/scene/`

The WebGL backdrop. It runs for the first three slides and then dissolves. See
[[decisions-log]] ADR-0014, ADR-0016, ADR-0017, ADR-0018.

> [!important] The scene is **one object in three forms**, not three objects
> A galaxy appears on load, erupts into a plasma burst as you scroll into the
> chapters, and winds down into a black hole's accretion disc at the roadmap. It is
> the same matter throughout — a single point cloud whose vertex shader blends
> between three forms. Nothing crossfades. **Read ADR-0028 before touching any of
> it**, and ADR-0036 before adding a form: whatever you add must be expressible as
> *positions for the points that already exist*. The burst's source draws its
> filaments as `LineSegments`, and a point cannot become a line.

| Component | File | Role |
|-----------|------|------|
| `<Scene>` | `scene/scene.tsx` | Client leaf. Owns the canvas, the Three.js instance, the pointer subscription, the loader readout, and the vignette. Subscribes `render(time)` to the shared ticker; fades its own canvas out below the roadmap. The loader readout is a counter set in the wordmark's face over a hairline rail; the rail's fill is a **spring on `scaleX`**, because the preloader emits whole percents and the raw value steps. Under reduced-motion / energy-saver (`sceneShouldFreeze()`) it plays the entrance, then **stops the ticker render and holds the last frame** (ADR-0044). |
| `<SettingsPanel>` | `dev/settings-panel.tsx` | Scene-tuning dev tool (a floating ⚙ + slider panel). **No longer mounted** — removed from `views/home.tsx` so the ⚙ never appears in the product. The component (and its `NODE_ENV`/`useIsMobile` self-gating) is kept for local tuning: re-add `<SettingsPanel />` to `home.tsx` when you need it, and drop it again before shipping. |
| `Controller` | `scene/three/Controller.ts` | Owns *when*: the two scroll-driven morph weights, the entrance, and the **camera flight path**, blending position, look-at and FOV across the three framings. The galaxy is a slow clock-driven orbit; the burst is a **scroll-driven** one (`burstPhase` — from `morph1Start`, where the galaxy first begins to become the burst, to the roadmap's top) with a slow clock added under it, so the very first filaments to appear are already turning, and it never stops dead when the wheel does; the maelstrom is a **scroll-driven orbit across the roadmap slide**, built in the **disc's own frame** (`fromDiscFrame` + `MAEL_TILT`) so the camera's elevation above the disc stays constant for the whole 150° sweep — circling about the world y axis on a disc this raked swings the eye in and out of its plane instead. Keyed off `slideLocalProgress`, so scrolling back up flies the camera back. See [[decisions-log]] ADR-0037 (and ADR-0033 for the trap it replaces). It also owns the **exit dive** — the camera stops orbiting and flies *through* the event horizon as Impact arrives, leading the canvas fade (ADR-0039) — and resolves the **cursor's world position**, the force `Morph` applies to the cloud (ADR-0038). |

### Scene objects — `scene/three/objects/`

| Object | Section | Notes |
|--------|---------|-------|
| `warp.ts` | preloader | A warp tunnel: streaks flying at the lens down the z axis, fanned out of the vanishing point by perspective alone. The load percentage **is** the throttle (`uBoost`), and `uSurge` breaks the warp on destroy — the streaks stretch out as the field fades and hand the screen to the galaxy. Emits `LOADING` percent, then `loaderdestroy`. A **child of the camera**, not of the scene — it hangs a fixed distance in front of a lens that now moves. Each streak is a **camera-facing quad** of fixed pixel width (`uWidth`/`uResolution`), not a `gl.LINES` primitive: a warp points its streaks nearly down the view axis, so most project to a few pixels of length, and a 1-device-pixel line rasterises those to lone dots on a real GPU — the field read as pixels rather than comets (ADR-0042). Replaces `trails.ts`; see [[decisions-log]] ADR-0031. |
| `morph.ts` | hero → chapters → roadmap | **The scene.** One `THREE.Points`; every particle carries the parameters of all three forms, and the vertex shader blends between them under `uT1` (universe → burst) and `uT2` (burst → maelstrom). Ported from `getlayers-scenes/universe.html`, `plasma-burst.html` and `maelstrom.html`. The burst's filaments are `LineSegments` in the source and **a point cannot become a line**, so they are rebuilt as points strung *along* the filaments — which only reads as lines if the sprites are big enough to touch (ADR-0036). The galaxy's whole CPU lifecycle collapses to a closed form (a point's spawn angle is just the sweep angle at its birth time), so nothing is rebuilt on the CPU, ever. Stagger + a mid-transition arc, swirl and brightness boost are what make it read as matter being flung and re-gathered rather than as a lerp. Glow is a per-point halo, **not** a post pass (ADR-0019). `uMaelPhase` carries the roadmap's scroll into the disc: the lensing crescent widens and burns harder and the arms warm off the accent blue — the scene's only colour animation (ADR-0033). `uPointer*` makes the cursor a **body in the scene**: within a Gaussian falloff the cloud is pushed out of its way, swirled about the view axis, and lit by it. Sized per form and blended with the morph weights; zero on touch (ADR-0038). |
| `starfield.ts` | all | A far star shell and a near dust drift. **Deliberately does not morph** — without a fixed frame of reference the camera's flight reads as the scene moving rather than the viewer. |

Everything in `scene/` is now typed code you may edit — the vendored `@ts-nocheck`
objects are gone. Adding a scene object? Read ADR-0017 first: it records the
pointer-gating, Fibonacci-lattice and constructor-`resize()` traps.

> [!warning] Brightness is a hue control, not a brightness control
> The scene is additively blended and very dense (~120k points). Anything whose
> per-point peak exceeds 1 clips to **white** — so turning brightness up does not
> make the scene brighter, it makes it *greyer*, and the blue dies. All three source
> scenes ship with peaks of ~13, ~200 and ~1.1 because each was composed against a
> near-white ramp and *wants* to blow out; every one is retuned to a peak of
> ~0.2–0.45 here. If a form ever renders as a white plate, this is why. ADR-0028.

`Composer` is a **single** `EffectComposer` (`RenderPass` → `common/final-pass.ts`).
The old torus/bloom chains rendered empty layers and their stale targets caused
the hero flicker — see [[decisions-log]] ADR-0019 before adding a pass.

> [!important] The scene is fill-bound
> Counts, pixel ratio and frame budget all come from `lib/scene/device.ts`, and
> `isSceneVisible()` skips the draw when nothing can see it. Never read
> `innerWidth` or `devicePixelRatio` directly in a scene object. ADR-0022.

> [!warning] Backticks in shader templates
> Shaders are template literals. A backtick inside a GLSL comment terminates the
> literal and produces a wall of confusing TypeScript syntax errors. Write GLSL
> comments without backticks.

## Sections — `common/sections/`

| Component | File | Role |
|-----------|------|------|
| `<SectionController>` | `section-controller.tsx` | Renders nothing. Once per frame on the shared ticker, computes each slide's scene progress (triangular kernel), local progress, and the active section (with hysteresis), writing them to `lib/scene/scroll-state.ts`. |
| `<Slide>` | `slide.tsx` | Scroll anchor. Emits `data-slide-id`, optional multi-viewport height (`vh`), and the sticky pin. |
| `<SectionDeepLink>` | `section-deep-link.tsx` | Renders nothing. Scrolls to a section once the scene has loaded, for the `/[section]` routes. |

## Chrome — `common/chrome/`

| Component | File | Role |
|-----------|------|------|
| `<Header>` | `header.tsx` | Fixed header; nav state derives from the active section. |
| `<Menu>` | `menu.tsx` | Mobile overlay. Locks Lenis while open. |
| `<Footer>` | `footer.tsx` | Sits below the slides, in normal flow. |

## `components/ui/`

| Component | File | Role |
|-----------|------|------|
| `<LogoMark>` | `logo-mark.tsx` | HELION's brand mark — an **event horizon**: a conic disc that burns hot through the crescent's sector, with a real hole punched through it in `--background`. Pure CSS and pure tokens (no SVG, no image), so it is crisp at any DPR and recolours with the palette. Decorative and `aria-hidden` — the wordmark beside it is the label. Note `bg-[image:var(…)]`: a bare `bg-[var(…)]` compiles to `background-color` and silently renders **nothing**. |
| `<SitemapButton>` | `sitemap-button.tsx` | One row of the chapter ledger: index, title, subtitle, arrow. Hover crossfades by springing **opacity** on a token colour — react-spring cannot interpolate token-derived colours. `align="right"` mirrors the row in CSS only; the reset breakpoint is `pad-sm` (991px) and **must match `Sitemap`'s grid collapse** — the mirrored layout only makes sense while the ledger has two columns. |

## Related

[[component-conventions]] · [[components/animation-springs]] · [[decisions-log]]
