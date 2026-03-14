/** Polling intervals in milliseconds */
export const POLLING = {
  /** Active downloads - high frequency for progress updates */
  DOWNLOADS: 3_000,
  /** System health checks */
  HEALTH: 30_000,
  /** Recently added media */
  RECENTLY_ADDED: 60_000,
  /** Pending requests */
  REQUESTS: 60_000,
  /** Calendar / upcoming releases */
  CALENDAR: 5 * 60_000,
  /** Dashboard stats */
  STATS: 5 * 60_000,
  /** Library data */
  LIBRARY: 5 * 60_000,
  /** VPN status */
  VPN: 10_000,
  /** Docker service status */
  SERVICES: 30_000,
  /** Network stats */
  NETWORK: 5_000,
} as const;

/** Stale times for TanStack Query caching */
export const STALE_TIME = {
  DOWNLOADS: 1_000,
  HEALTH: 15_000,
  RECENTLY_ADDED: 30_000,
  CALENDAR: 2 * 60_000,
  LIBRARY: 2 * 60_000,
  STATS: 2 * 60_000,
  SERVICES: 15_000,
  NETWORK: 3_000,
} as const;

/** Debounce delay for search inputs */
export const SEARCH_DEBOUNCE_MS = 300;
