/**
 * Wrapper around fetch that throws on non-OK responses.
 * Ensures React Query enters error state instead of passing
 * error objects where arrays/data are expected.
 */
export async function fetchApi<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText}`);
  }
  return res.json();
}
