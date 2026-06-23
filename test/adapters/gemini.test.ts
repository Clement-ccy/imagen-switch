import { describe, it, expect } from "vitest";
import { createGeminiAdapter } from "../../src/adapters/gemini";
import type { NormReq } from "../../src/adapters/types";

const adapter = createGeminiAdapter("https://gl/v1beta");
const req: NormReq = { prompt: "a dog", model: "gemini-2.5-flash-image", n: 1, params: {} };

describe("geminiAdapter.buildGenerate", () => {
  it("posts to generateContent with the prompt in parts", () => {
    const spec = adapter.buildGenerate(req);
    expect(spec.url).toBe("https://gl/v1beta/models/gemini-2.5-flash-image:generateContent");
    const body = spec.body as any;
    expect(body.contents[0].parts[0].text).toBe("a dog");
    expect(body.generationConfig.responseModalities).toEqual(["TEXT", "IMAGE"]);
  });
});

describe("geminiAdapter.parseResponse", () => {
  it("parses inline_data base64 (snake_case)", () => {
    const raw = { candidates: [{ content: { parts: [{ inline_data: { mime_type: "image/png", data: "AAAA" } }] } }] };
    expect(adapter.parseResponse(raw)).toEqual([{ kind: "b64", data: "AAAA", mime: "image/png" }]);
  });

  it("parses inlineData base64 (camelCase)", () => {
    const raw = { candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/png", data: "BBBB" } }] } }] };
    expect(adapter.parseResponse(raw)).toEqual([{ kind: "b64", data: "BBBB", mime: "image/png" }]);
  });
});

describe("geminiAdapter.buildEdit", () => {
  it("appends an inline_data image part", () => {
    const spec = adapter.buildEdit(req, [{ bytes: new Uint8Array([1, 2]), mime: "image/png" }]);
    const body = spec.body as any;
    const parts = body.contents[0].parts;
    expect(parts.some((p: any) => p.inline_data)).toBe(true);
  });
});
