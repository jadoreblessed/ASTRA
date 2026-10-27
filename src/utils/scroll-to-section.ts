import { useScroll } from "@/hooks/smooth-scroll/use-scroll";

/** Duration of the eased scroll the section nav performs, in seconds. */
const SCROLL_DURATION = 1.4;

/**
 * Smooth-scroll to a section's slide anchor.
 *
 * Routes through Lenis so a programmatic jump is smoothed by exactly the same
 * pipeline as user wheel input, falling back to native smooth scroll before
 * Lenis has mounted. The generic `@/utils/scroll-to` helper can't be used here:
 * it looks elements up by `id` and always calls native `window.scrollTo`.
 */
export const scrollToSection = (id: string) => {
  const el = document.querySelector<HTMLElement>(`[data-slide-id="${id}"]`);
  if (!el) return;

  const top = el.getBoundingClientRect().top + window.scrollY;
  const lenis = useScroll.getState().lenis;

  if (lenis) {
    lenis.scrollTo(top, { duration: SCROLL_DURATION });
    return;
  }
  window.scrollTo({ top, behavior: "smooth" });
};
