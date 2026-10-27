export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    /** The full JSON error body (e.g. `INVALID_VOICE` carries `message` and `validVoices`). */
    public data: Record<string, unknown> = {},
    /** Seconds until a rate-limited request (429) may be tried again, when the server said so. */
    public retryAfter?: number,
  ) {
    super(code);
  }
}

/** Seconds to wait from a 429: the JSON `retryAfter`, else the `Retry-After` header. */
export function parseRetryAfter(data: { retryAfter?: unknown } | null | undefined, header?: string | null): number | undefined {
  const n = Number(data?.retryAfter ?? header ?? NaN);
  return Number.isFinite(n) && n > 0 ? Math.ceil(n) : undefined;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const isForm = body instanceof FormData;
  const res = await fetch(`/api${path}`, {
    method,
    credentials: "include",
    headers: body && !isForm ? { "content-type": "application/json" } : undefined,
    body: isForm ? body : body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok)
    throw new ApiError(
      res.status,
      data.error ?? (res.status === 429 ? "RATE_LIMITED" : data.message) ?? `HTTP_${res.status}`,
      data,
      res.status === 429 ? parseRetryAfter(data, res.headers.get("Retry-After")) : undefined,
    );
  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body ?? {}),
  put: <T>(path: string, body?: unknown) => request<T>("PUT", path, body),
  patch: <T>(path: string, body?: unknown) => request<T>("PATCH", path, body),
  del: <T>(path: string) => request<T>("DELETE", path),
};
