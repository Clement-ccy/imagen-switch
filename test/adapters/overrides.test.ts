import { describe, it, expect } from "vitest";
import { applyOverrides } from "../../src/adapters/overrides";
import type { HttpRequestSpec } from "../../src/adapters/types";

describe("applyOverrides", () => {
  it("merges extra headers and query", () => {
    const spec: HttpRequestSpec = { method: "POST", url: "u", headers: { A: "1" }, body: {}, query: { q: "0" } };
    const out = applyOverrides(spec, { headers: { B: "2" }, query: { r: "9" } });
    expect(out.headers).toEqual({ A: "1", B: "2" });
    expect(out.query).toEqual({ q: "0", r: "9" });
  });
});
