import { AstraMark } from "@/components/ui/astra-mark";

/**
 * ASTRA's brand mark in the header — the A in orbit (`AstraMark`), sized by
 * the caller's Tailwind classes. Decorative: the wordmark beside it is the
 * accessible label.
 */

export interface LogoMarkProps {
  /** Tailwind size classes for the mark. Defaults to the header's 28px. */
  className?: string;
}

export const LogoMark = ({ className = "size-7" }: LogoMarkProps) => (
  <span aria-hidden="true" className={`relative inline-block shrink-0 ${className}`}>
    <AstraMark className="block h-full w-full" />
  </span>
);
