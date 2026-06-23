import type { AuthConfig, HttpRequestSpec } from "./adapters/types";
import { ProviderError, friendlyHttpError, redactKey } from "./errors";

type RequestOptions = { timeoutMs: number; maxRetries: number };

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shouldRetryStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

function appendQuery(url: string, query?: Record<string, string>): string {
  const out = new URL(url);
  for (const [key, value] of Object.entries(query ?? {})) {
    out.searchParams.set(key, value);
  }
  return out.toString();
}

function applyAuth(url: string, headers: Record<string, string>, auth: AuthConfig): string {
  if (auth.style === "none" || !auth.apiKey) return url;
  if (auth.style === "bearer") {
    headers.Authorization = `Bearer ${auth.apiKey}`;
    return url;
  }
  if (auth.style === "header") {
    headers[auth.headerName ?? "Authorization"] = auth.apiKey;
    return url;
  }
  const queryName = auth.queryName ?? "key";
  return appendQuery(url, { [queryName]: auth.apiKey });
}

function bodyAndHeaders(body: HttpRequestSpec["body"], headers: Record<string, string>): BodyInit {
  if (body instanceof FormData) return body;
  if (!Object.keys(headers).some((key) => key.toLowerCase() === "content-type")) {
    headers["Content-Type"] = "application/json";
  }
  return JSON.stringify(body);
}

async function withTimeoutFetch(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function retrying<T>(maxRetries: number, operation: (attempt: number) => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      return await operation(attempt);
    } catch (e) {
      lastError = e;
      if (e instanceof ProviderError && !shouldRetryStatus(e.status ?? 0)) break;
      if (attempt === maxRetries) break;
      await sleep(Math.min(50 * 2 ** attempt, 1000));
    }
  }
  throw lastError;
}

export async function sendRequest(spec: HttpRequestSpec, auth: AuthConfig, opts: RequestOptions): Promise<unknown> {
  return retrying(opts.maxRetries, async () => {
    const headers = { ...spec.headers };
    let url = appendQuery(spec.url, spec.query);
    url = applyAuth(url, headers, auth);
    const response = await withTimeoutFetch(
      url,
      {
        method: spec.method,
        headers,
        body: bodyAndHeaders(spec.body, headers),
      },
      opts.timeoutMs,
    );

    if (!response.ok) {
      const providerBody = redactKey(await response.text(), auth.apiKey);
      throw new ProviderError(friendlyHttpError(response.status, providerBody), response.status);
    }

    return response.json();
  });
}

export async function downloadToBytes(
  url: string,
  opts: RequestOptions,
): Promise<{ bytes: Uint8Array; mime: string }> {
  return retrying(opts.maxRetries, async () => {
    const response = await withTimeoutFetch(url, { method: "GET" }, opts.timeoutMs);
    if (!response.ok) {
      throw new ProviderError(`图像下载失败 (HTTP ${response.status})：${await response.text()}`, response.status);
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    const mime = response.headers.get("content-type")?.split(";")[0] || "application/octet-stream";
    return { bytes, mime };
  });
}
