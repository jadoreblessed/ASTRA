"use client";

import { useLayoutEffect } from "react";
import { getImageProps } from "next/image";

import { isRobotView } from "@/components/common/robot-view";
import { useSections } from "@/hooks/sections/use-sections";

/*
 * The robot form's scene (D-016). Everything on the page waits for the scene to
 * report itself loaded (`useSections().isLoaded` — the nav, the header, the
 * slides' fades); with no scene on the robot form nothing would ever show. So
 * this marks it loaded — at module evaluation when the server's robot marker is
 * in the document, and again before paint — and paints one frame of the galaxy
 * in the canvas's place. Art-directed: the phone frame is its own capture.
 */
if (isRobotView()) useSections.getState().setIsLoaded(true);

export const RobotScene = () => {
  useLayoutEffect(() => {
    useSections.getState().setIsLoaded(true);
  }, []);

  const common = { alt: "", fetchPriority: "high" as const, sizes: "100vw" };
  const {
    props: { srcSet: phone },
  } = getImageProps({
    ...common,
    src: "/assets/scene-still-mobile.webp",
    width: 780,
    height: 1688,
  });
  const { props } = getImageProps({
    ...common,
    src: "/assets/scene-still.webp",
    width: 1920,
    height: 1200,
  });
  return (
    <picture>
      <source media="(max-width: 767px)" srcSet={phone} />
      <img
        {...props}
        alt=""
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 h-lvh w-lvw object-cover"
      />
    </picture>
  );
};
