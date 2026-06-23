import { describe, it, expect } from "vitest";
import { main } from "../src/index";

describe("entry", () => {
  it("exports a main function", () => {
    expect(typeof main).toBe("function");
  });
});
