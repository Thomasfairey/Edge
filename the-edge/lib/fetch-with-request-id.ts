/**
 * Fetch wrapper that attaches X-Request-Id headers for request correlation.
 * Logs failed requests with the ID for debugging.
 */
export function fetchWithRequestId(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const requestId = crypto.randomUUID();
  const headers = new Headers(options.headers);
  headers.set("X-Request-Id", requestId);

  return fetch(url, { ...options, headers }).then((res) => {
    if (!res.ok) {
      console.error(`[${requestId}] ${res.status} ${url}`);
    }
    return res;
  });
}
