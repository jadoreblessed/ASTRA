import { notFound } from "next/navigation";

import { HomeView, sectionFor, sectionParams } from "@/views/home";

/**
 * Deep-link routes. The original router mapped `/sitemap`, `/partners`,
 * `/roadmap`, `/product`, `/social` and `/investors` all onto the same `Home`
 * page and scrolled to the matching section — these segments do the same.
 */
export const dynamicParams = false;

export function generateStaticParams() {
  return sectionParams();
}

export default async function SectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  const target = sectionFor(section);

  if (!target) notFound();

  return <HomeView section={target} />;
}
