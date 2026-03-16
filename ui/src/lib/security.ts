/**
 * Sanitize error messages for API responses.
 * Strips stack traces and internal paths that could leak details.
 */
export function sanitizeError(err: unknown): string {
  if (err instanceof Error) {
    return err.message;
  }
  return String(err);
}
