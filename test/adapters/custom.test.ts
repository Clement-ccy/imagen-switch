import { describe, it, expect } from "vitest";
import { createCustomAdapter } from "../../src/adapters/custom";
import type { NormReq } from "../../src/adapters/types";

const custom = {
  generatePath: "/t2i",
  encoding: "json" as const,
  bodyTemplate: "{\"model\":\"{{model}}\",\"prompt\":\"{{prompt}}\",\"num\":{{n}}}",
  responseImagesPath: "output.images[*]",
  responseImageKind: "url" as const,
};
const adapter = createCustomAdapter("https://api.x", custom);
const req: NormReq = { prompt: "hi", model: "m1", n: 3, params: {} };

describe("createCustomAdapter.buildGenerate", () => {
  it("renders the body template", () => {
    const spec = adapter.buildGenerate(req);
    expect(spec.url).toBe("https://api.x/t2i");
    expect(spec.body).toEqual({ model: "m1", prompt: "hi", num: 3 });
  });

  it("supports multipart encoding", () => {
    const mp = createCustomAdapter("https://api.x", { ...custom, encoding: "multipart" });
    const spec = mp.buildGenerate({ ...req, params: { style: "vivid" } });
    expect(spec.body).toBeInstanceOf(FormData);
    const fd = spec.body as FormData;
    expect(fd.get("model")).toBe("m1");
    expect(fd.get("prompt")).toBe("hi");
    expect(fd.get("num")).toBe("3");
    expect(fd.get("style")).toBe("vivid");
  });
});

describe("createCustomAdapter.parseResponse", () => {
  it("extracts urls via the configured path", () => {
    const raw = { output: { images: ["https://a", "https://b"] } };
    expect(adapter.parseResponse(raw)).toEqual([
      { kind: "url", data: "https://a" },
      { kind: "url", data: "https://b" },
    ]);
  });
});
