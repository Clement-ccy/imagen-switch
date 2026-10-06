import { describe, it, expect } from "vitest";
import { isDirectExecution, main } from "../src/index";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

describe("entry", () => {
  it("exports a main function", () => {
    expect(typeof main).toBe("function");
  });

  it("recognizes npm bin symlinks as direct execution", () => {
    const realEntry = resolve("npm-cache", "package", "dist", "index.js");
    const binPath = resolve("npm-cache", "package", "node_modules", ".bin", "imagen-switch-mcp");
    const resolvePath = (path: string) => path === binPath ? realEntry : path;

    expect(
      isDirectExecution(pathToFileURL(realEntry).href, binPath, resolvePath),
    ).toBe(true);
  });
});
