import { describe, it, expect } from "vitest";
import { createAdapter } from "../../src/adapters/registry";
import { loadRawConfig } from "../../src/config";

describe("createAdapter", () => {
  it("selects openai with default base url and bearer auth", () => {
    const { adapter, baseUrl, auth } = createAdapter(loadRawConfig({ IMAGEN_FORMAT: "openai", IMAGEN_API_KEY: "k" }));
    expect(adapter.format).toBe("openai");
    expect(baseUrl).toBe("https://api.openai.com/v1");
    expect(auth).toEqual({ style: "bearer", headerName: undefined, queryName: undefined, apiKey: "k" });
  });

  it("selects gemini with x-goog-api-key header auth", () => {
    const { auth } = createAdapter(loadRawConfig({ IMAGEN_FORMAT: "gemini", IMAGEN_API_KEY: "k" }));
    expect(auth.style).toBe("header");
    expect(auth.headerName).toBe("x-goog-api-key");
  });

  it("throws on unknown format", () => {
    expect(() => createAdapter(loadRawConfig({ IMAGEN_FORMAT: "nope" }))).toThrow(/format/);
  });
});
