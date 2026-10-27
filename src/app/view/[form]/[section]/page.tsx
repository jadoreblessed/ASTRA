import { notFound } from "next/navigation";

import * as home from "@/views/home";

/**
 * A deep-link route (`/roadmap`, `/product`, …) in one of its served forms —
 * reached only through the proxy's rewrite (see `lib/page-forms`). Robots read
 * these from the sitemap, so they get the loader-free robot form here too.
 */
export const dynamicParams = false;

export function generateStaticParams() {
  return home
    .formParams()
    .flatMap(({ form }) =>
      home.sectionParams().map(({ section }) => ({ form, section })),
    );
}

export default async function SectionForm({
  params,
}: {
  params: Promise<{ form: string; section: string }>;
}) {
  const { form, section } = await params;
  const props = home.formProps(form);
  const target = home.sectionFor(section);
  if (!props || !target) notFound();
  return <home.HomeView section={target} {...props} />;
}
