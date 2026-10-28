import {
  siAirbnb,
  siAnthropic,
  siApple,
  siBinance,
  siBitcoin,
  siBroadcom,
  siCardano,
  siChainlink,
  siDogecoin,
  siEthereum,
  siGmail,
  siGoogle,
  siLitecoin,
  siMeta,
  siNetflix,
  siNvidia,
  siPalantir,
  siPaypal,
  siRobinhood,
  siShopify,
  siSolana,
  siSpotify,
  siSui,
  siTesla,
  siTon,
  siXrp,
} from "simple-icons";

import { TOKEN_ICONS } from "@/data/token-icons";
import { CoinImage } from "./coin-image";

/**
 * An asset's logo as a small glass coin — the brand glyph (Simple Icons, CC0
 * path data, bundled: no request to anyone's CDN) lit by a glow of its own brand
 * colour. Assets without a glyph (index funds, memecoins) get a lettered coin in
 * a flat colour of their own. No hooks: renders on the server or in a client leaf.
 */

interface Glyph {
  hex: string;
  path: string;
}

const GLYPHS: Record<string, Glyph> = {
  airbnb: siAirbnb,
  anthropic: siAnthropic,
  apple: siApple,
  binance: siBinance,
  bitcoin: siBitcoin,
  broadcom: siBroadcom,
  cardano: siCardano,
  chainlink: siChainlink,
  dogecoin: siDogecoin,
  ethereum: siEthereum,
  gmail: siGmail,
  google: siGoogle,
  litecoin: siLitecoin,
  meta: siMeta,
  netflix: siNetflix,
  nvidia: siNvidia,
  palantir: siPalantir,
  paypal: siPaypal,
  robinhood: siRobinhood,
  shopify: siShopify,
  solana: siSolana,
  spotify: siSpotify,
  sui: siSui,
  tesla: siTesla,
  ton: siTon,
  xrp: siXrp,
};

/**
 * Brands whose only glyph is a wordmark (AMD, Coinbase): at coin size the word
 * shrinks to an unreadable sliver, so they get a lettered coin in brand colour.
 */
const WORDMARKS: Record<string, { mark: string; hex: string }> = {
  amd: { mark: "A", hex: "ED1C24" },
  coinbase: { mark: "C", hex: "0052FF" },
  usdc: { mark: "$", hex: "2775CA" },
};

const rgb = (hex: string): [number, number, number] => [
  parseInt(hex.slice(0, 2), 16),
  parseInt(hex.slice(2, 4), 16),
  parseInt(hex.slice(4, 6), 16),
];

/** Near-black brand colours (Apple, Anthropic…) would vanish on the dark coin. */
const readable = (hex: string): [number, number, number] => {
  const [r, g, b] = rgb(hex);
  const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return lum < 0.3 ? [232, 236, 255] : [r, g, b];
};

const rgba = ([r, g, b]: [number, number, number], a: number) =>
  `rgba(${r}, ${g}, ${b}, ${a})`;

/** Lettered coins: a stable hue per symbol, so BONK is always the same coin. */
const hueOf = (symbol: string) =>
  [...symbol].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) % 360, 7);

export interface AssetLogoProps {
  /** A key into the glyph set, e.g. "nvidia". Omitted → lettered coin. */
  logo?: string;
  /** Short mark for the lettered coin, e.g. "S&P". Defaults to the first letter. */
  mark?: string;
  symbol: string;
  size?: number;
  className?: string;
}

/**
 * Real token icons from the backend (Jupiter's list), keyed by symbol. Used for
 * assets with no brand glyph — memecoins, most of crypto — so they show their
 * own logo instead of a letter. Filled by the app's data layer once it loads;
 * empty on the server, so the first render matches.
 */
const ICONS = new Map<string, string>();
export const registerIcons = (assets: { symbol: string; icon?: string }[]) => {
  for (const a of assets) if (a.icon) ICONS.set(a.symbol, a.icon);
};

export const AssetLogo = ({
  logo,
  mark,
  symbol,
  size = 32,
  className = "",
}: AssetLogoProps) => {
  const glyph = logo ? GLYPHS[logo] : undefined;
  // A brand glyph wins; otherwise the token's own logo (live, then bundled);
  // the lettered coin is the last resort and the image's fallback.
  const icon = glyph ? undefined : (ICONS.get(symbol) ?? TOKEN_ICONS[symbol]);

  if (icon) {
    return (
      <span className={`inline-flex shrink-0 ${className}`}>
        <CoinImage src={icon} size={size} fallback={<LetterCoin logo={logo} mark={mark} symbol={symbol} size={size} />} />
      </span>
    );
  }

  if (glyph) {
    const tone = readable(glyph.hex);
    return (
      <span
        aria-hidden="true"
        className={`relative inline-flex shrink-0 items-center justify-center rounded-full ${className}`}
        style={{
          width: size,
          height: size,
          background: "rgb(11 15 34)",
          boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.13)",
        }}
      >
        <svg
          viewBox="0 0 24 24"
          width={Math.round(size * 0.5)}
          height={Math.round(size * 0.5)}
          fill={rgba(tone, 1)}
        >
          <path d={glyph.path} />
        </svg>
      </span>
    );
  }

  return <LetterCoin logo={logo} mark={mark} symbol={symbol} size={size} className={className} />;
};

/** A coin with the asset's letters: brand colour for wordmark-only brands, a stable hue otherwise. */
const LetterCoin = ({ logo, mark, symbol, size = 32, className = "" }: AssetLogoProps) => {
  const word = logo ? WORDMARKS[logo] : undefined;
  const hue = hueOf(symbol);
  const text = word?.mark ?? mark ?? symbol.charAt(0);
  const brand = word ? rgb(word.hex) : null;
  return (
    <span
      aria-hidden="true"
      className={`relative inline-flex shrink-0 items-center justify-center rounded-full font-mulish leading-none font-normal text-white ${className}`}
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * (text.length > 2 ? 0.28 : text.length > 1 ? 0.34 : 0.44)),
        background: brand ? rgba(brand, 1) : `hsl(${hue} 50% 34%)`,
        boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.14)",
      }}
    >
      {text}
    </span>
  );
};

export interface LogoStackProps {
  items: { symbol: string; logo?: string; mark?: string }[];
  size?: number;
  /** How many to draw before collapsing the rest into "+N". */
  max?: number;
  /** Extra assets not in `items`, added to the "+N". */
  more?: number;
}

/** Overlapping coins — a basket's holdings at a glance. */
export const LogoStack = ({ items, size = 30, max = 5, more = 0 }: LogoStackProps) => {
  const shown = items.slice(0, max);
  const rest = items.length - shown.length + more;
  const overlap = Math.round(size * 0.32);
  return (
    <span className="inline-flex items-center">
      {shown.map((item, i) => (
        <span
          key={item.symbol}
          className="relative rounded-full ring-2 ring-background"
          style={{ marginLeft: i === 0 ? 0 : -overlap, zIndex: shown.length - i }}
        >
          <AssetLogo {...item} size={size} />
        </span>
      ))}
      {rest > 0 && (
        <span
          className="relative inline-flex items-center justify-center rounded-full bg-white/[0.07] font-mulish text-white/70 ring-2 ring-background"
          style={{ width: size, height: size, marginLeft: -overlap, fontSize: Math.round(size * 0.36) }}
        >
          +{rest}
        </span>
      )}
    </span>
  );
};
