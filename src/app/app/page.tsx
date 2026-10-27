import type { Metadata } from "next";

import { generateMetadata } from "@/utils/seo/generate-page-metadata";
import { AppView } from "@/views/app";

export const metadata: Metadata = generateMetadata({
  title: "App",
  description:
    "Pick a basket of tokenized stocks, crypto and memecoins and hold it as one redeemable $ASTRA token in your own Solana wallet.",
  url: "/app",
});

export default function AppPage() {
  return <AppView />;
}
