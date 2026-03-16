export class ApiError extends Error {
  status: number;
  reason?: string;

  constructor(status: number, statusText: string, reason?: string) {
    super(`${status} ${statusText}`);
    this.status = status;
    this.reason = reason;
  }
}

/**
 * Wrapper around fetch that throws on non-OK responses.
 * Ensures React Query enters error state instead of passing
 * error objects where arrays/data are expected.
 */
export async function fetchApi<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    let reason: string | undefined;
    try {
      const body = await res.json();
      reason = body?.reason;
    } catch { /* ignore parse errors */ }
    throw new ApiError(res.status, res.statusText, reason);
  }
  return res.json();
}
