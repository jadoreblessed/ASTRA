/**
 * The served forms of the home page (D-016 + the phone layout hint).
 *
 * People on a desktop get `/` as is. Every other requester is rewritten by the
 * proxy to a prerendered variant under `/view/<form>` — the URL in the address
 * bar never changes, and every variant stays static and CDN-cached (the UA is
 * read in the proxy, not with `headers()` in a page):
 *
 * - `mobile`        people on a phone — the phone composition in the first HTML.
 * - `robot`         crawlers and lab tools — no warp loader, no WebGL, at rest.
 * - `robot-mobile`  the same, laid out as a phone (mobile-first indexing).
 */
export const pageForms = {
  mobile: { robot: false, mobile: true },
  robot: { robot: true, mobile: false },
  "robot-mobile": { robot: true, mobile: true },
} as const;

export type PageForm = keyof typeof pageForms;

export const isPageForm = (value: string): value is PageForm =>
  value in pageForms;

/** The form a requester gets, or `null` for people on a desktop (plain `/`). */
export const pageFormFor = (
  robot: boolean,
  mobile: boolean,
): PageForm | null =>
  robot ? (mobile ? "robot-mobile" : "robot") : mobile ? "mobile" : null;

/** Internal prefix of the variants — rewritten to, never linked or indexed. */
export const FORM_PREFIX = "/view";
