import { describe, it, expect } from "vitest";
import { isDirectExecution, main } from "../src/index";

describe("entry", () => {
  it("exports a main function", () => {
    expect(typeof main).toBe("function");
  });

  it("recognizes npm bin symlinks as direct execution", () => {
    const realEntry = "D:\\npm-cache\\package\\dist\\index.js";
    const resolvePath = (path: string) =>
      path.includes(".bin") ? realEntry : path.replaceAll("/", "\\");

    expect(
      isDirectExecution(
        "file:///D:/npm-cache/package/dist/index.js",
        "D:\\npm-cache\\package\\node_modules\\.bin\\imagen-switch-mcp",
        resolvePath,
      ),
    ).toBe(true);
  });
});
