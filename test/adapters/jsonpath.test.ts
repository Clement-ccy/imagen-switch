import { describe, it, expect } from "vitest";
import { extractPath } from "../../src/adapters/jsonpath";

describe("extractPath", () => {
  it("reads nested fields with array index", () => {
    expect(extractPath({ a: { b: [{ c: 1 }, { c: 2 }] } }, "a.b[0].c")).toEqual([1]);
  });

  it("expands [*] wildcard", () => {
    expect(extractPath({ data: [{ url: "x" }, { url: "y" }] }, "data[*].url")).toEqual(["x", "y"]);
  });

  it("returns empty for missing path", () => {
    expect(extractPath({}, "a.b.c")).toEqual([]);
  });
});
