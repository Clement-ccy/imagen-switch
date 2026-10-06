import type { AuthConfig, HttpRequestSpec } from "./adapters/types";
import { ProviderError, friendlyHttpError, redactKey } from "./errors";

type RequestOptions = {
  timeoutMs: number;
  maxRetries: number;
  maxBytes?: number;
  validateUrl?: (url: string) => Promise<void>;
};

const DEFAULT_MAX_IMAGE_BYTES = 50 * 1024 * 1024;

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
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), opts.timeoutMs);
    try {
      let currentUrl = url;
      let response: Response | undefined;
      for (let redirects = 0; redirects <= 5; redirects += 1) {
        await opts.validateUrl?.(currentUrl);
        response = await fetch(currentUrl, { method: "GET", redirect: "manual", signal: controller.signal });
        if (response.status < 300 || response.status >= 400) break;
        const location = response.headers.get("location");
        await response.body?.cancel();
        if (!location || redirects === 5) throw new ProviderError("图像下载重定向次数过多或缺少目标地址");
        currentUrl = new URL(location, currentUrl).toString();
      }
      if (!response) throw new ProviderError("图像下载未返回响应");
      if (!response.ok) {
        throw new ProviderError(`图像下载失败 (HTTP ${response.status})：${await response.text()}`, response.status);
      }
      const maxBytes = opts.maxBytes ?? DEFAULT_MAX_IMAGE_BYTES;
      const contentLength = Number(response.headers.get("content-length"));
      if (Number.isFinite(contentLength) && contentLength > maxBytes) {
        await response.body?.cancel();
        throw new ProviderError(`图像下载超过大小限制（最大 ${maxBytes} 字节）`, 413);
      }

      const chunks: Uint8Array[] = [];
      let total = 0;
      const reader = response.body?.getReader();
      if (!reader) throw new ProviderError("图像下载响应没有可读取的内容");
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > maxBytes) {
          await reader.cancel();
          throw new ProviderError(`图像下载超过大小限制（最大 ${maxBytes} 字节）`, 413);
        }
        chunks.push(value);
      }

      const bytes = new Uint8Array(total);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
      }
      const mime = response.headers.get("content-type")?.split(";")[0] || "application/octet-stream";
      return { bytes, mime };
    } finally {
      clearTimeout(timer);
    }
  });
}
