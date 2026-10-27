import { NextResponse, type NextRequest } from "next/server";

import { isBotUserAgent } from "@/utils/bot-ua";
import { isMobileRequest } from "@/utils/mobile-ua";
import { FORM_PREFIX, pageFormFor } from "@/lib/page-forms";
import { sectionRoutes } from "@/lib/scene/screens";

/**
 * Each requester gets the form of the page made for it (owner rule D-016 +
 * the phone layout hint — see `lib/page-forms`).
 *
 * A crawler or a lab tool (Lighthouse, PageSpeed) asking for `/` or a section
 * deep link is rewritten to the robot form: the same view, content, metadata
 * and canonical — without the warp loader and the motion a robot never
 * watches. A phone is rewritten to the phone form, so its first HTML is the
 * phone composition. Every form stays static: reading the UA here, not with
 * `headers()` in the page, keeps each one prerendered and CDN-cached. Anyone
 * who types another form's `/view/…` address is sent to the public URL.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const ua = request.headers.get("user-agent");
  const form = pageFormFor(
    isBotUserAgent(ua),
    isMobileRequest(ua, request.headers.get("sec-ch-ua-mobile")),
  );

  /* A `/view/…` address asked for directly. Its own requester's form is let
   * through — that is also how a rewrite arrives when Next proxies it (the
   * request URL's host differs from the server's, e.g. `next start -H
   * 127.0.0.1`), and redirecting it looped. Anyone else goes to the public URL. */
  if (pathname.startsWith(`${FORM_PREFIX}/`)) {
    const [, , asked, section] = pathname.split("/");
    if (asked === form) return NextResponse.next();
    const url = request.nextUrl.clone();
    url.pathname = `/${section ?? ""}`;
    return NextResponse.redirect(url);
  }

  const section = pathname.slice(1);
  if (!form || (section !== "" && !(section in sectionRoutes))) {
    return NextResponse.next();
  }

  // `nextUrl`, not `request.url`, so the rewrite stays on this origin.
  const url = request.nextUrl.clone();
  url.pathname = `${FORM_PREFIX}/${form}${section ? `/${section}` : ""}`;
  return NextResponse.rewrite(url);
}

/** Literal (Next reads it statically): `/`, the variants, `sectionRoutes`. */
export const config = {
  matcher: [
    "/",
    "/view/:path*",
    "/sitemap",
    "/partners",
    "/roadmap",
    "/product",
    "/social",
    "/investors",
  ],
};
