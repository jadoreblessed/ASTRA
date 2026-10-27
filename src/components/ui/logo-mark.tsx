// 📖 Docs: obsidian/frontend/components/common.md

/**
 * HELION's brand mark — an event horizon.
 *
 * It is the scene's ending, reduced to a glyph: the accretion disc the page flies
 * through, drawn as an annulus. A conic sweep burns hot through one sector (the
 * lensing crescent — the page's one pink accent, spent here because a brand mark
 * is exactly the place scarcity is supposed to pay off), and the horizon is a
 * **real hole** punched through it in `--background`, ringed by the light that
 * crowds against its inner edge.
 *
 * Pure CSS and pure tokens — no SVG, no image. It costs nothing to ship, it is
 * crisp at any DPR, and it recolours itself for free if the palette moves again.
 *
 * Decorative: it never carries the name. The wordmark beside it is the accessible
 * label, so this is `aria-hidden` and the mark is invisible to a screen reader —
 * announcing it would just read the brand twice.
 */

export interface LogoMarkProps {
  /** Tailwind size classes for the outer disc. Defaults to the header's 28px. */
  className?: string;
}

export const LogoMark = ({ className = "size-7" }: LogoMarkProps) => (
  <span
    aria-hidden="true"
    className={`relative inline-block shrink-0 rounded-full ${className}`}
  >
    {/* The disc: a conic sweep, hot through the crescent's sector. Reach for a
        gradient token with the "image" type hint (see the line below), never a bare
        custom property. Tailwind cannot tell what a bare custom property holds, so it
        guesses background-color — invalid for a gradient, so the element silently
        renders nothing at all. The type hint is what makes a gradient token work. It
        is a quiet failure: it took a logo that came out as an empty ring to notice
        the footer's wash had never rendered either.

        NOTE: do not write literal Tailwind arbitrary-value class syntax in these
        comments — the v4 scanner treats it as a real utility and emits broken CSS. */}
    <span className="absolute inset-0 rounded-full bg-[image:var(--gradient-logo-disc)] shadow-logo-mark" />
    {/* The horizon: a real hole, with the light piling up at its rim. */}
    <span className="absolute inset-[32%] rounded-full bg-background shadow-logo-core" />
  </span>
);
