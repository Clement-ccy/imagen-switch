import { describe, it, expect, vi, afterEach } from "vitest";
import { sendRequest, downloadToBytes } from "../src/http";
import { ProviderError } from "../src/errors";
import type { AuthConfig, HttpRequestSpec } from "../src/adapters/types";

afterEach(() => vi.unstubAllGlobals());

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

const spec: HttpRequestSpec = { method: "POST", url: "https://api/x", headers: {}, body: { a: 1 } };

describe("sendRequest", () => {
  it("injects bearer auth and returns parsed json", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    const auth: AuthConfig = { style: "bearer", apiKey: "k" };

    const out = await sendRequest(spec, auth, { timeoutMs: 1000, maxRetries: 0 });

    expect(out).toEqual({ ok: true });
    const [, init] = fetchMock.mock.calls[0];
    expect((init.headers as Record<string, string>)["Authorization"]).toBe("Bearer k");
    expect(init.body).toBe(JSON.stringify({ a: 1 }));
  });

  it("injects query-style auth into the url", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}));
    vi.stubGlobal("fetch", fetchMock);

    await sendRequest(spec, { style: "query", apiKey: "k", queryName: "key" }, { timeoutMs: 1000, maxRetries: 0 });

    expect(fetchMock.mock.calls[0][0]).toContain("key=k");
  });

  it("retries on 500 then succeeds", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ e: 1 }, 500))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    const out = await sendRequest(spec, { style: "none" }, { timeoutMs: 1000, maxRetries: 1 });

    expect(out).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("throws ProviderError with friendly redacted message on 401", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("bad sk-secret", { status: 401 })));

    await expect(
      sendRequest(spec, { style: "bearer", apiKey: "sk-secret" }, { timeoutMs: 1000, maxRetries: 0 }),
    ).rejects.toMatchObject({
      name: "ProviderError",
      status: 401,
      message: expect.stringContaining("认证失败"),
    });
    await expect(
      sendRequest(spec, { style: "bearer", apiKey: "sk-secret" }, { timeoutMs: 1000, maxRetries: 0 }),
    ).rejects.not.toThrow(/sk-secret/);
  });

  it("retries network errors", async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(new Error("reset")).mockResolvedValueOnce(jsonResponse({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(sendRequest(spec, { style: "none" }, { timeoutMs: 1000, maxRetries: 1 })).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("downloadToBytes", () => {
  it("downloads bytes and preserves content type", async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(bytes, { status: 200, headers: { "content-type": "image/png" } })),
    );

    const out = await downloadToBytes("https://cdn/image.png", { timeoutMs: 1000, maxRetries: 0 });

    expect(out.mime).toBe("image/png");
    expect([...out.bytes]).toEqual([1, 2, 3]);
  });

  it("retries failed image downloads", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("nope", { status: 503 }))
      .mockResolvedValueOnce(new Response(new Uint8Array([4]), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const out = await downloadToBytes("https://cdn/image.png", { timeoutMs: 1000, maxRetries: 1 });

    expect([...out.bytes]).toEqual([4]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("rejects downloads larger than the configured byte limit", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: { "content-type": "image/png", "content-length": "3" },
        }),
      ),
    );

    await expect(
      downloadToBytes("https://cdn/image.png", { timeoutMs: 1000, maxRetries: 0, maxBytes: 2 }),
    ).rejects.toThrow(/大小限制/);
  });

  it("enforces the byte limit when content-length is absent", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { "content-type": "image/png" } })),
    );

    await expect(
      downloadToBytes("https://cdn/image.png", { timeoutMs: 1000, maxRetries: 0, maxBytes: 2 }),
    ).rejects.toThrow(/大小限制/);
  });

  it("keeps the timeout active while reading the response body", async () => {
    vi.useFakeTimers();
    try {
      const fetchMock = vi.fn().mockImplementation(async (_url, init: RequestInit) => {
        const body = new ReadableStream<Uint8Array>({
          start(controller) {
            init.signal!.addEventListener("abort", () => controller.error(init.signal!.reason), { once: true });
          },
        });
        return new Response(body, { headers: { "content-type": "image/png" } });
      });
      vi.stubGlobal("fetch", fetchMock);

      const download = downloadToBytes("https://cdn/image.png", { timeoutMs: 10, maxRetries: 0 });
      const outcome = download.catch((error: Error) => error);
      await vi.advanceTimersByTimeAsync(11);

      expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
      expect(await outcome).toMatchObject({ name: "AbortError" });
    } finally {
      vi.useRealTimers();
    }
  });
});
