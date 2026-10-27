"use client";

import { createContext, useContext } from "react";

/**
 * The server's guess at the device (`lib/page-forms`): `true` when the proxy
 * served the phone form. It is what the first render — the server's and the
 * hydration's — lays out against, so a phone gets the phone composition in its
 * first HTML instead of building the desktop one and rebuilding at hydration.
 * It also stands in for "touch" where a choice must be made before anything is
 * measured (no hover springs on a phone).
 */
const MobileHintContext = createContext(false);

export const useMobileHint = (): boolean => useContext(MobileHintContext);

export const MobileHintProvider = ({
  mobile,
  children,
}: {
  mobile: boolean;
  children: React.ReactNode;
}) => (
  <MobileHintContext.Provider value={mobile}>
    {children}
  </MobileHintContext.Provider>
);
