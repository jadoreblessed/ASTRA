import { create } from "zustand";
import { screens } from "@/lib/scene/screens";

/**
 * The discrete half of the scroll state: which section is active, and whether
 * the WebGL scene has finished loading. Continuous per-frame progress lives in
 * `@/lib/scene/scroll-state` and deliberately never enters React.
 *
 * Replaces the original helios `ControllerContext`.
 */
export interface UseSections {
  /** Currently active section id, or `screens.NONE` before the first frame. */
  active: string;
  /** The section that was active immediately before `active`. */
  prevActive: string;
  /** True once the scene preloader has reported completion. */
  isLoaded: boolean;
  /** Whether the mobile menu overlay is open. */
  isMenuOpen: boolean;
  setActive: (active: string) => void;
  setIsLoaded: (isLoaded: boolean) => void;
  setIsMenuOpen: (isMenuOpen: boolean) => void;
}

export const useSections = create<UseSections>((set) => ({
  active: screens.NONE,
  prevActive: screens.NONE,
  isLoaded: false,
  isMenuOpen: false,
  setActive: (active) =>
    set((state) =>
      state.active === active ? state : { prevActive: state.active, active },
    ),
  setIsLoaded: (isLoaded) => set({ isLoaded }),
  setIsMenuOpen: (isMenuOpen) => set({ isMenuOpen }),
}));
