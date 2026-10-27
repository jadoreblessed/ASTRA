/**
 * Phones, told apart on the server — the layout hint the proxy hands the view
 * so a phone's first HTML is already the phone composition (no desktop build
 * and rebuild at hydration). A phone user agent, or `Sec-CH-UA-Mobile: ?1`
 * where Chromium sends it. A hint, not a verdict: the client still measures
 * the real width after hydration and corrects a wrong guess.
 */
const MOBILE_UA = /Mobi|iPhone|iPod|Android.+Mobile|Windows Phone|BlackBerry/i;

export const isMobileRequest = (
  userAgent: string | null | undefined,
  chMobile: string | null | undefined,
): boolean => MOBILE_UA.test(userAgent ?? "") || chMobile === "?1";
