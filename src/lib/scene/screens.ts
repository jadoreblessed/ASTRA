/**
 * Screen ids — the shared vocabulary between the DOM sections, the section
 * controller, and the WebGL scene. Ported verbatim from the original helios
 * `components/sections/constants.ts` so the Three.js objects keep working
 * against the same keys.
 */
export const screens = {
  NONE: "none",
  HERO: "hero",
  SITEMAP: "sitemap",
  PARTNERS: "partners",
  INVESTORS: "investors",

  PRODUCT: "product",
  PRODUCT__INNER_1: "product-0",
  PRODUCT__INNER_2: "product-1",

  ROADMAP: "roadmap",
  ROADMAP__INNER_1: "roadmap-0",
  ROADMAP__INNER_2: "roadmap-1",
  ROADMAP__INNER_3: "roadmap-2",

  IMPACT: "impact",

  SOCIAL: "social",
} as const;

export type ScreenId = (typeof screens)[keyof typeof screens];

/** Route segments that deep-link to a section, mirroring the original router. */
export const sectionRoutes = {
  sitemap: screens.SITEMAP,
  partners: screens.PARTNERS,
  roadmap: screens.ROADMAP,
  product: screens.PRODUCT,
  social: screens.SOCIAL,
  investors: screens.INVESTORS,
} as const satisfies Record<string, ScreenId>;

export type SectionRoute = keyof typeof sectionRoutes;
