/**
 * Content for the product screen (`/app`) — the console where you pick a basket
 * and hold it as one token. Mock data only: no wallet is connected and no order
 * is placed; every figure is illustrative. Components take this via props.
 */

export interface Holding {
  /** Tokenized ticker, e.g. "NVDAx". */
  symbol: string;
  name: string;
  /** Share of the basket, in percent. The weights in a basket sum to 100. */
  weight: number;
}

export interface Basket {
  id: string;
  /** Two-digit index shown in the gradient numeral, e.g. "01". */
  number: string;
  /** Short ticker-style code, e.g. "AISC" — shown as the basket's symbol chip. */
  code: string;
  name: string;
  subtitle: string;
  /** Price of one $ASTRA share of this basket. */
  price: string;
  /** 24-hour change, pre-signed, e.g. "+4.2%". */
  change: string;
  holdings: Holding[];
}

export interface WalletState {
  network: string;
  address: string;
  balance: string;
}

export interface AppContent {
  eyebrow: string;
  heading: string;
  wallet: WalletState;
  baskets: Basket[];
}

export const app: AppContent = {
  eyebrow: "Baskets",
  heading: "Hold the whole market.",
  wallet: {
    network: "Solana",
    address: "AStRA…Apex",
    balance: "$12,480.00",
  },
  baskets: [
    {
      id: "ai-supercycle",
      number: "01",
      code: "AISC",
      name: "AI Supercycle",
      subtitle: "The names building the compute buildout",
      price: "$1,042.60",
      change: "+4.2%",
      holdings: [
        { symbol: "NVDAx", name: "NVIDIA", weight: 26 },
        { symbol: "GOOGLx", name: "Alphabet", weight: 18 },
        { symbol: "AVGOx", name: "Broadcom", weight: 16 },
        { symbol: "MSFTx", name: "Microsoft", weight: 14 },
        { symbol: "AMDx", name: "AMD", weight: 14 },
        { symbol: "TSMx", name: "TSMC", weight: 12 },
      ],
    },
    {
      id: "onchain-80-20",
      number: "02",
      code: "8020",
      name: "Onchain 80/20",
      subtitle: "US equities against bitcoin",
      price: "$986.10",
      change: "+1.1%",
      holdings: [
        { symbol: "SPYx", name: "S&P 500", weight: 40 },
        { symbol: "QQQx", name: "Nasdaq 100", weight: 20 },
        { symbol: "AAPLx", name: "Apple", weight: 10 },
        { symbol: "MSFTx", name: "Microsoft", weight: 10 },
        { symbol: "wBTC", name: "Bitcoin", weight: 20 },
      ],
    },
    {
      id: "vision",
      number: "03",
      code: "VSN",
      name: "Vision",
      subtitle: "The onchain and AI frontier",
      price: "$1,318.80",
      change: "+6.8%",
      holdings: [
        { symbol: "wBTC", name: "Bitcoin", weight: 34 },
        { symbol: "SOL", name: "Solana", weight: 26 },
        { symbol: "ANTHx", name: "Anthropic", weight: 22 },
        { symbol: "NVDAx", name: "NVIDIA", weight: 18 },
      ],
    },
    {
      id: "build-your-own",
      number: "04",
      code: "DIY",
      name: "Build your own",
      subtitle: "Up to 14 of 133 assets",
      price: "—",
      change: "",
      holdings: [],
    },
  ],
};
