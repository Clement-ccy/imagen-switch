import { describe, it, expect } from "vitest";
import { redactKey, friendlyHttpError, ConfigError } from "../src/errors";

describe("redactKey", () => {
  it("replaces the api key with ***", () => {
    expect(redactKey("Authorization: Bearer sk-secret123", "sk-secret123")).toBe("Authorization: Bearer ***");
  });

  it("returns text unchanged when no key given", () => {
    expect(redactKey("hello", undefined)).toBe("hello");
  });
});

describe("friendlyHttpError", () => {
  it("maps 401 to an auth message including the provider body", () => {
    const msg = friendlyHttpError(401, "invalid key");
    expect(msg).toContain("认证");
    expect(msg).toContain("invalid key");
  });
});

describe("ConfigError", () => {
  it("is an Error subclass", () => {
    expect(new ConfigError("x")).toBeInstanceOf(Error);
  });
});
