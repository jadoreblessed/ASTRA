import { Suspense } from "react";

import { RobotProvider, RobotView } from "@/components/common/robot-view";
import { HydrateNear } from "@/components/common/hydrate-near";
import { MobileHintProvider } from "@/components/common/device-hint";
import { LoaderCurtain } from "@/components/common/scene/loader-curtain";
import { Scene } from "@/components/common/scene/scene";
import { RobotScene } from "@/components/common/scene/robot-scene";
import { SectionController } from "@/components/common/sections/section-controller";
import { SectionDeepLink } from "@/components/common/sections/section-deep-link";
import { Slide } from "@/components/common/sections/slide";
import { HeroNav } from "@/components/common/chrome/hero-nav";

import { Hero } from "@/views/home/sections/hero";
import { Services } from "@/views/home/sections/services";
import { Timeline } from "@/views/home/sections/timeline";
import { LogoParticles } from "@/views/home/sections/logo-particles";
import { CoinFlight } from "@/views/home/sections/coin-flight";

import { screens, sectionRoutes, type SectionRoute } from "@/lib/scene/screens";
import { isPageForm, pageForms } from "@/lib/page-forms";
import * as content from "@/data/mocks/home";

/**
 * Home view — the whole case study: one scrolling page over a single WebGL
 * scene. A Server Component; every animated piece below is a client leaf.
 *
 * The scene runs across every slide — a vortex (hero), the services burst, the
 * roadmap maelstrom, then the camera dives through its hole and the particle mark
 * assembles on the same starfield for the closing logo scene. The final slide
 * reuses the hero composition (masthead + subtitle, no form) to frame that mark.
 *
 * The roadmap slide is 2.5 viewports tall to give its morph scroll length. The
 * Sitemap opts out of sticky pinning and scrolls with the page.
 */
/** The deep-link segments (`/roadmap`, `/product`, …) — for `generateStaticParams`. */
export const sectionParams = () =>
  Object.keys(sectionRoutes).map((section) => ({ section }));

/** The section a deep-link segment scrolls to, or `null` for an unknown one. */
export const sectionFor = (segment: string): string | null =>
  segment in sectionRoutes ? sectionRoutes[segment as SectionRoute] : null;

/** The served forms under `/view/<form>` — for `generateStaticParams`. */
export const formParams = () =>
  Object.keys(pageForms).map((form) => ({ form }));

/** The view props of a served form, or `null` for an unknown one. */
export const formProps = (form: string) =>
  isPageForm(form) ? pageForms[form] : null;

export interface HomeViewProps {
  /** Set on the deep-link routes (`/roadmap`, `/product`, …) to scroll there. */
  section?: string;
  /** The robot form (D-016): no warp preloader, no WebGL, reveals at rest. */
  robot?: boolean;
  /** The proxy served the phone form: lay the first HTML out as a phone. */
  mobile?: boolean;
}

export const HomeView = ({
  section,
  robot = false,
  mobile = false,
}: HomeViewProps) => {
  return (
    <RobotProvider robot={robot}>
      <MobileHintProvider mobile={mobile}>
        {robot && <RobotView />}
        {robot ? <RobotScene /> : <Scene />}
        <SectionController />
        {section && <SectionDeepLink target={section} />}

        <HeroNav content={content.heroNav} />
        <CoinFlight coins={[...content.hero.orbit.outer, ...content.hero.orbit.inner]} />

        <main className="relative w-full">
          {/* Each slide's height in viewports is the scroll length its scene morph
            is mapped across, so the vh values are also the transition pacing: the
            galaxy→burst morph runs over the hero's scroll, burst→maelstrom over the
            sitemap's, and the dive-through over the roadmap→impact run. They are
            kept a touch long so every scene switch reads as a stretched, gradual
            transition rather than a quick cut. */}
          <Slide id={screens.HERO} vh={1.4}>
            <Hero content={content.hero} />
          </Slide>

          <Slide id={screens.SITEMAP} vh={1.4} sticky={false}>
            <Suspense>
              <HydrateNear id="sitemap">
                <Services content={content.services} />
              </HydrateNear>
            </Suspense>
          </Slide>

          {/* Inter-slide gaps. The roadmap keeps a generous run-in — the terrain
            needs empty scroll to rise into. Impact's gap is small: the canvas is
            already dissolving there, so a long empty band just reads as dead
            space between the last scene and the outcome board. */}
          <Slide
            id={screens.ROADMAP}
            vh={3.2}
            sticky={false}
            className="mt-75 max-hero-md:mt-50 max-hero-xs:mt-35"
          >
            <Suspense>
              <HydrateNear id="timeline">
                <Timeline content={content.timeline} />
              </HydrateNear>
            </Suspense>
          </Slide>

          <Slide
            id={screens.IMPACT}
            vh={2.4}
            className="mt-24 max-hero-md:mt-16 max-hero-xs:mt-12"
          >
            <Suspense>
              <HydrateNear id="impact">
                <LogoParticles content={content.logoScene} />
              </HydrateNear>
            </Suspense>
          </Slide>
        </main>

        {/* People only: the first screen is served at rest under this opaque
          curtain and switches to its entrance's start pose at hydration. */}
        {!robot && <LoaderCurtain />}
      </MobileHintProvider>
    </RobotProvider>
  );
};
