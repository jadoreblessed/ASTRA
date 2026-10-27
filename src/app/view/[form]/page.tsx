import { notFound } from "next/navigation";

import { HomeView, formParams, formProps } from "@/views/home";

/**
 * The home page in one of its served forms — reached only through the proxy's
 * rewrite of `/` (see `lib/page-forms`). Inherits the root metadata, so its
 * canonical is `/`: whoever reads this document reads it under the home URL.
 */
export const dynamicParams = false;

export function generateStaticParams() {
  return formParams();
}

export default async function HomeForm({
  params,
}: {
  params: Promise<{ form: string }>;
}) {
  const props = formProps((await params).form);
  if (!props) notFound();
  return <HomeView {...props} />;
}
