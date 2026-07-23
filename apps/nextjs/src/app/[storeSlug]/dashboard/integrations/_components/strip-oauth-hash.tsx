"use client";

import { useEffect } from "react";

/**
 * Facebook's OAuth dialog appends a `#_=_` fragment to the redirect URL after
 * login. It's harmless but shows up in the address bar — strip it on mount.
 */
export function StripOAuthHash() {
  useEffect(() => {
    if (window.location.hash === "#_=_") {
      window.history.replaceState(
        null,
        "",
        window.location.pathname + window.location.search,
      );
    }
  }, []);

  return null;
}
