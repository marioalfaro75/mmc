'use client';

import { useEffect, useState } from 'react';

/**
 * The hostname the user typed to reach this UI — useful when displaying URLs
 * for sibling services that share the same host (Sonarr, Seerr, etc.).
 *
 * Returns `'localhost'` during SSR / before hydration; updates to
 * `window.location.hostname` on mount. Handles localhost, LAN IPs, and DNS
 * names identically without needing extra config.
 */
export function useBrowserHost(): string {
  const [host, setHost] = useState<string>('localhost');
  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.hostname) {
      setHost(window.location.hostname);
    }
  }, []);
  return host;
}
