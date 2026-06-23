import { describe, it, expect } from "vitest";
import { placeholder } from "../src/index";

describe("smoke", () => {
  it("imports the entry module", () => {
    expect(placeholder).toBe(true);
  });
});
