import { describe, it, expect } from "vitest";
import { loadRawConfig, resolveBaseUrl, resolveAuth } from "../src/config";

const base = { IMAGEN_FORMAT: "openai", IMAGEN_API_KEY: "k", IMAGEN_MODEL: "gpt-image-2" };

describe("loadRawConfig", () => {
  it("parses core fields with defaults", () => {
    const c = loadRawConfig({ ...base });
    expect(c.format).toBe("openai");
    expect(c.apiKey).toBe("k");
    expect(c.returnInline).toBe(false);
    expect(c.timeoutMs).toBe(120000);
    expect(c.maxRetries).toBe(2);
  });

  it("defaults format to openai", () => {
    expect(loadRawConfig({}).format).toBe("openai");
  });

  it("parses IMAGEN_EXTRA_BODY json", () => {
    const c = loadRawConfig({ ...base, IMAGEN_EXTRA_BODY: "{\"quality\":\"hd\"}" });
    expect(c.extraBody).toEqual({ quality: "hd" });
  });

  it("throws ConfigError on invalid EXTRA_BODY json", () => {
    expect(() => loadRawConfig({ ...base, IMAGEN_EXTRA_BODY: "{bad" })).toThrow(/EXTRA_BODY/);
  });

  it("throws ConfigError on non-numeric timeout", () => {
    expect(() => loadRawConfig({ ...base, IMAGEN_TIMEOUT_MS: "abc" })).toThrow(/TIMEOUT/);
  });
});

describe("resolveBaseUrl", () => {
  it("prefers env base url", () => {
    expect(resolveBaseUrl(loadRawConfig({ ...base, IMAGEN_BASE_URL: "https://x/v1" }), "https://default")).toBe(
      "https://x/v1",
    );
  });

  it("falls back to adapter default", () => {
    expect(resolveBaseUrl(loadRawConfig({ ...base }), "https://default")).toBe("https://default");
  });

  it("throws when neither present", () => {
    expect(() => resolveBaseUrl(loadRawConfig({ ...base }), undefined)).toThrow(/BASE_URL/);
  });
});

describe("resolveAuth", () => {
  it("uses adapter default style, overridable by env", () => {
    const a = resolveAuth(loadRawConfig({ ...base }), { style: "bearer" });
    expect(a).toEqual({ style: "bearer", headerName: undefined, queryName: undefined, apiKey: "k" });
    const b = resolveAuth(
      loadRawConfig({ ...base, IMAGEN_AUTH_STYLE: "query", IMAGEN_AUTH_QUERY_NAME: "key" }),
      { style: "bearer" },
    );
    expect(b.style).toBe("query");
    expect(b.queryName).toBe("key");
  });
});
