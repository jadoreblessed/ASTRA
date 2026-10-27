---
tags: [meta, performance, seo, history]
updated: 2026-10-06
---

# Optimization history — Helion

What the GetLayers optimization pipeline changed in this project, why, and what
must not be undone. Maintained by the pipeline
(`getlayers-pipeline/optimization-pipeline`, primary record
`obsidian/Projects/helion.md`; owner decisions `obsidian/Meta/decisions-log.md`).
Condensed for the next agent who edits this repo. Day-to-day change notes stay in
[[changelog]], architecture decisions in [[decisions-log]] — this file links,
not duplicates. Last updated 2026-10-06.

## Current state

| | Desktop | Mobile | measured |
|---|---|---|---|
| Lighthouse Performance (people, production) | 100 | 100 | 2026-10-03 D-029 sweep |
| Accessibility / Best Practices / SEO | 100 / 100 / 100 | 100 / 100 / 100 | 2026-10-03 (people + robot form) |
| Robot form (Googlebot / PSI view) | 100 all | 100 all | 2026-10-03 |
| Scroll test (production) | ideal (0 %, max 16.8 ms) | ideal (0.76 %, max 41.8 ms) | 2026-10-05 D-031 sweep |

- Status: **optimized** (D-028 bar, 2026-10-02; re-checked D-029 / D-031).
- Production: Vercel project `getlayers-helion` (team textura-agency, deploys
  `main`), domain `getlayers-helion-gasldkjfg.vercel.app` (protected except
  custom domains).
- Passes 2–4 (D-033/D-036/D-037, phone fps + phone menu) were checked locally
  only (mobile 95–98 / desktop 100, A11y/BP/SEO 100) — no production
  re-measure after them yet. `repackage: needed` (the owner decides).

## Invariants — do not undo

| what | why / measured effect | where |
|---|---|---|
| **No fixed phone frame cap** — phones draw every rAF tick (budget 0); tablet keeps 45 | the 30 fps budget drew every 3rd/5th frame (20–26 fps); the owner saw it as "low FPS" (D-033). 26 → 120 fps at rest, phone scroll 1.19 → 0.58 % dropped | `src/lib/scene/device.ts` (`frameBudgetMs`), comment in `components/common/scene/scene.tsx` |
| Fonts: Lato + Gilroy are **WOFF2 only, Latin subset**; Lato **not preloaded** | each weight was listed WOFF2 + WOFF, both preloaded: 1.55 MB → 146 KB; unpreloading Lato (unused at first paint): mobile 76 → 84, LCP 3.47 → 2.27 s | `src/lib/fonts.ts` |
| Composer **prewarms** every program against its real output (scene + bloom → render target, final pass → canvas) and runs the bloom pass from frame 1 | bloom switched on by strength mid-scroll → 755 ms three.js task; the old `compileAsync(scene)` compiled for the canvas so frame 1 relinked everything: 1,032 → 48 ms | `components/common/scene/three/Composer.ts` |
| Scene built **in steps after hydration** (renderer, objects, post chain each its own task); first use per program in its own task; `checkShaderErrors` off in production | TBT 469 → 358 ms, mobile 87 → 90 | `components/common/scene/three/index.ts` (`build`), `scene.tsx`, `src/lib/scene/canvas3d.ts` |
| three.js is a **static** import in `scene.tsx` | dynamic import tried twice — slower or no gain (see below) | `components/common/scene/scene.tsx` |
| **Served device forms** — `src/proxy.ts` rewrites `/` **and the section deep links** by UA to prerendered `/view/mobile`, `/view/robot`, `/view/robot-mobile`; `robots.txt` disallows `/view/`; every form stays static | phones no longer hydrate the desktop composition then rebuild the mobile one; robots get no warp loader anywhere (D-016, D-028) | `src/proxy.ts`, `src/lib/page-forms.ts`, `src/app/view/[form]/…`, `src/utils/mobile-ua.ts`, `src/utils/bot-ua.ts` |
| `useIsMobile` answers with the **server hint** during SSR/hydration | ~0.25 s sync re-render on phones removed (part of 66 → 76) | `components/common/device-hint.tsx`, `src/hooks/use-is-mobile.ts` |
| **Hero served at rest under an opaque loader curtain**, switched after a reported paint (2 s backstop); entrance plays when the warp ends | LCP lands at first paint: 4.75 → 3.47 s | `components/common/scene/loader-curtain.tsx`, `loader-readout.tsx`, `src/hooks/use-hydrated.ts`, `restUntilHydrated` on `robot-spring` / `robot-text` / `AnimatedHeading` |
| Robot form: `RobotScene` galaxy still instead of WebGL, marks `isLoaded`; springs → `robot-spring`, `Inview` → `robot-inview`, text engines → `robot-text` (flex row, engine alignment as `text-align`) | D-016; robot PC 74 → 100, mobile 42 → 90+ | `components/common/scene/robot-scene.tsx`, `components/common/robot-*.tsx` |
| AI crawlers (GPTBot, ClaudeBot, PerplexityBot + 14) in the bot list | non-JS crawlers on the people form read streamed copy in `hidden` segments (fleet fix 2026-10-02) | `src/utils/bot-ua.ts` |
| `AnimatedHeading`: **one spring clock per heading**; letters are plain spans at the start pose until first enabled (latched); resting letters on the robot form | hundreds of per-letter springs at hydration: mobile 52 → 60 (TBT 1,814 → 969); robot TBT 1,031 → 21 ms; one clock: 90 → 92 | `components/animation/animated-heading.tsx` |
| Heading **blur once per line**; no `filter` / `will-change` on waiting or settled letters | every letter was its own blurred layer — phone scroll janky → ideal (0.47–0.75 %) | `components/animation/animated-heading.tsx` |
| Timeline rails `will-change: transform` | their per-frame move repainted the slide | `views/home/sections/timeline.tsx` |
| Non-hero slides start at **opacity 0** | fixed full-screen panels stacked over the hero in served HTML (robot LCP + CLS 0.057) | `src/hooks/sections/use-scene-fade.ts` |
| `useSceneFade` / `useSceneVisibility` / `useSlideProgress` don't re-`start` an unchanged target per frame | TBT 952 → 878 ms | `src/hooks/sections/` |
| `HydrateNear` on services / timeline / impact (hydrate on approach after the first gesture) | mobile 92 → 99 (TBT 287 → 91); LoAF later showed the scroll jank was render, not this — kept | `components/common/hydrate-near.tsx` |
| No hover springs on touch | owner rule (D-028) | `components/common/touch-hover.tsx` |
| Hero rings' `loop: true` is still under reduced motion / robot form | fleet freeze: a loop spring with motion off restarts every 0 ms | `views/home/sections/hero-icon.tsx` |
| Phone menu panel is `fixed inset-x-0 top-0 h-dvh` (**not** `lvh`), foot padded `max(32px, env(safe-area-inset-bottom) + 32px)`, `viewportFit: "cover"` | `h-lvh` put the CTA under Safari's bottom bar (D-037). `lvh` is for scene canvases, not menus | `components/common/chrome/hero-nav-menu.tsx`, `globals.css` (`--hero-menu-pad-bottom`), `generateViewport` |
| No `app/loading.tsx` | an empty one hid the h1 from non-JS crawlers (fleet fix) | `src/app/` |
| `siteConfig.url` falls back to Vercel's production domain (D-019); `CONTACT_ENDPOINT: … \|\| undefined` | localhost canonical; an empty env var failed the build | `src/lib/site.ts`, `src/env.ts` |
| `/privacy-policy` exists (sitemap entry added by hand) | the cookie banner linked a 404 | `src/app/privacy-policy/`, `src/app/sitemap.ts` |

Note: `chrome/menu.tsx` + `header.tsx` are unused leftovers of the original
port; the live phone nav is `HeroNavMobile` (`chrome/hero-nav.tsx`) +
`hero-nav-menu.tsx`.

## Owner decisions

- **D-016** (2026-09-29) — robots get a static page: same content, no preloader,
  no animation, no WebGL; served by a proxy rewrite, never `await isBot()`.
- **D-017 / D-026 / D-028 / D-029** — A11y/BP/SEO 100 on every device (people
  and robot forms); performance ≥ 90 desktop **and** mobile. Never cut a mobile
  3D scene without asking (D-026).
- **D-028** (2026-10-02, helion by name) — do the mobile fixes; warp loader
  removed for robots; **no hover effects on mobile**; server-decided layout on
  phones (the `/view/*` forms).
- **D-027 / D-034** — pass branches are fast-forwarded to `main` by the
  coordinator; the owner reviews on the live deploy.
- **D-033** (2026-10-06) — "scene on mobile is rendered in low FPS": lift the
  phone cap. Fleet rule since: no fixed phone frame cap; pay with DPR/particles.
- **D-036** (2026-10-06) — "make proper immersive mobile menu": full-screen
  deep-space menu opened as a circle from the burger.
- **D-037** (2026-10-06) — the menu's bottom button was cut by the iOS bottom
  bar: menus size to the dynamic viewport / safe area.
- **D-038** — this file.

## History by pass

**pass-1 — 2026-09-29, `optimize/pass-1` → `12cdfa9`.** Hosted baseline: PC 75,
mobile 42 (LCP 11.9 s, TBT 1,974 ms), mobile scroll janky (cold 9.3 %, 821 ms
freezes 3/3), robot 74/42, PSI 48/37.
- Bloom pass from frame 1 (compiles under the preloader) — 755 ms mid-scroll task.
- Fonts WOFF2-only Latin subset — 1.55 MB → 146 KB.
- Robot path (RobotScene, robot-spring/inview/text) — D-016.
- Hero rings loop gated; `/privacy-policy`; D-019 origin; `math.ts`; dev panel tokens.
- `robot-text` alignment; resting `AnimatedHeading` letters on robot — robot TBT 1,031 → 21 ms.
- Non-hero slides start hidden — robot CLS 0.057 → 0.
- Result (hosted): PC 75 → **93**, mobile 42 → **57** (LCP 4.56 s), scroll
  **ideal / ideal**; robot **100 / 90**; PSI 48 → 97, 37 → 85.
- Follow-ups: `f51e64d` robot-text typing, `5e30cbd` robot-text flex row,
  `8c7da85` empty `CONTACT_ENDPOINT`.

**D-026 round — 2026-10-01, `b1c3422`** (merged, D-027). Local mobile 52 → 66,
PC 91 → 99: letters plain until enabled, `compileAsync` before frame 1 (a 1.3 s
link wait), no per-frame re-`start`, hidden never-enabled reveals as plain
markup, empty `loading.tsx` deleted. Hosted: PC 99, mobile 71, robot 100/90,
scroll ideal/ideal.

**D-028 round — 2026-10-02, `65024e1`.** Local mobile 66 → 98: device forms +
server hint (→ 76 with the curtain), curtain LCP 4.75 → 3.47 s, Lato unpreloaded
(→ 84), composer prewarm (frame 1 1,032 → 48 ms), stepped build (→ 90), one
clock per heading (→ 92), HydrateNear (→ 99), touch hovers plain. Phone scroll
was janky hosted (2.0 %, 115 ms) → per-line blur + timeline layers. Hosted
record: PC **100**, mobile **99**, robot 100/100, scroll **ideal / ideal**
(mobile cold 0.6 %, max 34 ms). AI-crawler bot list (fleet, same day).

**D-029 sweep — 2026-10-03:** production 100 / 100 / 100 / 100 both devices,
people and robot. **D-031 sweep — 2026-10-05:** scroll ideal / ideal.

**pass-2 (D-033) — 2026-10-06, `f5d7787`.** Phone frame cap removed — fps-probe
at rest 26 → 120, touch scroll 25.6 → 94–101 fps; phone scroll 1.19 → 0.58 %
(ideal); local Lighthouse mobile 96 / desktop 100.

**pass-3 (D-036) — 2026-10-06, `69522ae`.** Full-screen phone menu
(`hero-nav-menu.tsx`: circle reveal from the burger, staggered chapters,
per-line blur focus-pull, Lenis stop + overflow lock, `main` inert, Escape,
focus trap). Local mobile 95 / desktop 100.

**pass-4 (D-037) — 2026-10-06, `1ec5f82`.** Menu panel `h-lvh` → `h-dvh`,
safe-area foot padding, `viewportFit: "cover"`. Local mobile 98 / desktop 100.

## Tried and reverted / didn't help

- **three.js by dynamic `import()`** in `scene.tsx` (pass-1): people PC 90 → 78,
  mobile 56 → 53, robot flat — reverted. Tried again in D-028 (after hydration,
  palette split out of `scene-config`): no gain — reverted.
- **Yielding the WebGL scene mount out of the hydration commit** (D-026): no gain.
- **Blaming `HydrateNear` for the phone scroll jank** (kimi's counter-case):
  LoAF showed render work and no scripts — profile the long frame first.

## Open items / leads

- Passes 2–4 have no production record; a real phone GPU at 3–4× the old draw
  rate and the iOS menu foot are not verifiable here.
- A lost WebGL context is a permanent blank (auralis, D-037 fleet note) — helion
  has the gap; fix only when the owner sees it (D-034).
- `src/lib/scene/scene-config.ts` writes CSS custom properties per frame —
  fleet candidate; check if the scroll test ever names that section.
- Robot form still carries ~785 chars of streamed Suspense text under `hidden`
  (2026-10-03) — lead: the robot form should stream nothing.
- Cookie banner still client-mounted (handoff, 2026-10-02) — on other projects
  server-rendering it was the phone LCP fix; not needed for the bar here.

## How to measure

From `getlayers-pipeline/optimization-pipeline/` (records only via `measure.mjs`):

```sh
node tools/measure.mjs helion --hosted              # production: Lighthouse + scroll, PC + mobile ×3
node tools/measure.mjs helion --hosted --as-bot     # the robot form (what PSI / Googlebot see)
node tools/measure.mjs helion --tag check           # local production build, while iterating
node tools/measure.mjs helion --only scroll --devices mobile --runs 1 --no-build   # iterate on a freeze
node tools/fps-probe.mjs <url>                     # phone scene fps at rest / scrolling — after any device.ts change
node tools/ios-toolbar-probe.mjs --url <url> --out <dir>   # Safari toolbar resize must not clear the scene
node tools/context-loss-probe.mjs --url <url> --out <dir>  # WebGL context-loss recovery (open item)
node tools/axe-sweep.mjs <url> --device both       # A11y sampled through the entrance
```
