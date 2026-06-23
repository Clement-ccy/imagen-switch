import { describe, it, expect } from "vitest";
import { createOpenAiAdapter } from "../../src/adapters/openai";
import type { NormReq } from "../../src/adapters/types";

const openaiAdapter = createOpenAiAdapter("https://api.openai.com/v1");
const req: NormReq = {
  prompt: "a cat",
  model: "gpt-image-2",
  size: "1024x1024",
  n: 2,
  params: { background: "transparent" },
};

describe("openaiAdapter.buildGenerate", () => {
  it("includes core fields and params in the body", () => {
    const spec = openaiAdapter.buildGenerate(req);
    expect(spec.method).toBe("POST");
    expect(spec.url).toContain("/images/generations");
    const body = spec.body as Record<string, unknown>;
    expect(body.model).toBe("gpt-image-2");
    expect(body.prompt).toBe("a cat");
    expect(body.size).toBe("1024x1024");
    expect(body.n).toBe(2);
    expect(body.background).toBe("transparent");
    expect("response_format" in body).toBe(false);
  });
});

describe("openaiAdapter.buildEdit", () => {
  it("builds multipart with image field and prompt", () => {
    const images = [{ bytes: new Uint8Array([1]), mime: "image/png" }];
    const spec = openaiAdapter.buildEdit(req, images);
    expect(spec.url).toContain("/images/edits");
    expect(spec.body instanceof FormData).toBe(true);
    const fd = spec.body as FormData;
    expect(fd.get("prompt")).toBe("a cat");
    expect(fd.get("model")).toBe("gpt-image-2");
    expect(fd.get("image")).toBeInstanceOf(Blob);
  });

  it("uses image[] for multiple images", () => {
    const images = [
      { bytes: new Uint8Array([1]), mime: "image/png" },
      { bytes: new Uint8Array([2]), mime: "image/png" },
    ];
    const fd = openaiAdapter.buildEdit(req, images).body as FormData;
    expect(fd.getAll("image[]").length).toBe(2);
  });
});

describe("openaiAdapter.parseResponse", () => {
  it("parses b64_json", () => {
    expect(openaiAdapter.parseResponse({ data: [{ b64_json: "AAAA" }] })).toEqual([{ kind: "b64", data: "AAAA" }]);
  });

  it("parses url", () => {
    expect(openaiAdapter.parseResponse({ data: [{ url: "https://img/x" }] })).toEqual([
      { kind: "url", data: "https://img/x" },
    ]);
  });
});
