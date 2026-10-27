---
tags: [frontend, stable]
updated: 2026-05-21
---

# Catalog — Utilities

Pure helper functions in `src/utils/` (no side effects, unless noted).

## `is-bot.ts`

`isBot(): Promise<boolean>` — **server-only**. Reads the `user-agent` header,
returns `true` for crawlers/audit tools. Used to skip heavy animation for bots.
See [[seo-metadata]].

## `scroll-to.ts`

`scrollTo(id?, immediate?)` — programmatic scroll to an element id (string) or a
numeric position. Integrates with the Lenis [[smooth-scroll|scroll store]];
temporarily disables scroll state during the animation. Has `//if lenis` guards so
the Lenis dependency can be stripped if smooth scroll is removed.

## `math.ts`

| Function | Purpose |
|----------|---------|
| `transformRange(value, min, max, newMin, newMax)` | remap a value between ranges (clamped) |
| `lerp(start, end, t)` | linear interpolation |
| `debounce(...)` | debounce helper (used by `useWindowSize`) |

## `lvh.ts`

CSS-string builders for viewport-height units with fallbacks
(`vh` → `lvh` → `calc(var(--vh) …)`): `heightLvh`, `minHeightLvh`, `marginTopLvh`,
`marginBottomLvh`. Solves mobile-browser viewport-height inconsistencies.

## `animation/coords.ts`

Element-coordinate helpers — `getElementCoords`, `getScrollCoordsFromElement` —
used internally by the scroll/animation system. Marked `@ts-nocheck`. `#do-not-modify`

## `seo/generate-page-metadata.ts`

`generateMetadata(props?)` — shared page-`Metadata` builder. `generateViewport()`
— the `Viewport` export (carries `themeColor`). See [[seo-metadata]].

## `seo/structured-data.ts`

`getSiteStructuredData()` — builds the `Organization` + `WebSite` JSON-LD graph
rendered by the root layout. See [[seo-metadata]].

## `utils/animation/easing.ts`

`cubicBezier(x1, y1, x2, y2)` — returns a plain easing function equivalent to the
CSS `cubic-bezier()` of the same control points, for passing to react-spring's
`config.easing`. The original helios build expressed its reveals as CSS
transitions with bespoke curves; the transitions are gone but the curves are kept
so the rebuilt reveals land on the same timing.

Also exports `easeReveal` (`cubic-bezier(.16,.77,.3,1)`, the hero/chrome reveal)
and `easeOutQuartic` (the Sitemap sequence).

## `utils/scroll-to-section.ts`

`scrollToSection(id)` — smooth-scrolls to a slide anchor (`[data-slide-id]`)
through Lenis, so a programmatic jump is smoothed by the same pipeline as user
wheel input. Distinct from `scroll-to.ts`, which looks elements up by `id` and
always calls native `window.scrollTo`.

## `lib/scene/` — WebGL support modules

Not utils strictly (they carry state), but the scene's shared vocabulary:

| File | Role |
|------|------|
| `screens.ts` | Screen ids + the deep-link route map |
| `device.ts` | **The only** place the scene decides what "mobile" means: particle counts, clamped pixel ratio (mobile `0.85×`, ADR-0043), frame budget. Also owns the motion signals — `prefersReducedMotion()`, `isEnergySaver()` (Save-Data / ≤2 GB), and `sceneShouldFreeze()`, read by `scene.tsx` to freeze the WebGL scene on a still frame (ADR-0044). Never read `innerWidth`/`devicePixelRatio` in a scene object — see [[decisions-log]] ADR-0022 |
| `scroll-state.ts` | The per-frame seam between React and the canvas. `slideRange` is the only monotonic-in-scroll signal (ADR-0018). `isSceneVisible()` gates the render loop (ADR-0022) |
| `palette.ts` | The `globals.css` colour tokens as GPU `Vector3`s. Shaders can't read CSS custom properties; keep the two in step |
| `glsl.ts` | Shared shader chunks (`SNOISE`, 3D simplex noise) |
| `mouse.ts` | Reference-counted pointer tracking. `hasPointer()` gates cursor-repulsion effects — ungated, they punch a void through the scene centre on touch devices |
| `tween.ts` · `easing.ts` · `lerp.ts` | Scene interpolation, on the shared ticker |
| `canvas3d.ts` | Renderer/scene base class. Note it resizes **before** objects register `toResize` |

## Adding a util

Keep utilities **pure** and side-effect-free (server-only ones like `isBot` are the
exception — note it clearly). Group by domain under `utils/<domain>/`.

## Related

[[hooks]] · [[seo-metadata]] · [[smooth-scroll]] · [[decisions-log]]
