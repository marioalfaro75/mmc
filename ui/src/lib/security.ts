/**
 * Sanitize error messages for API responses.
 * Strips stack traces and internal paths that could leak details.
 *
 * Also unwraps `err.cause` so that opaque Node.js fetch errors
 * (e.g. "fetch failed") surface their underlying cause (e.g. ECONNREFUSED).
 */
export function sanitizeError(err: unknown): string {
  if (err instanceof Error) {
    const cause = (err as Error & { cause?: unknown }).cause;
    if (cause instanceof Error) {
      const code = (cause as Error & { code?: string }).code;
      if (code) return `${err.message} (${code}: ${cause.message})`;
      return `${err.message} (${cause.message})`;
    }
    return err.message;
  }
  return String(err);
}
