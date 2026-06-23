import type { AuthConfig, ImageAdapter } from "./types";
import { type RawConfig, resolveAuth, resolveBaseUrl } from "../config";
import { ConfigError } from "../errors";
import { createOpenAiAdapter, OPENAI_META } from "./openai";
import { createGeminiAdapter, GEMINI_META } from "./gemini";
import { createCustomAdapter, CUSTOM_META } from "./custom";

export function createAdapter(raw: RawConfig): { adapter: ImageAdapter; baseUrl: string; auth: AuthConfig } {
  if (raw.format === "openai") {
    const baseUrl = resolveBaseUrl(raw, OPENAI_META.defaultBaseUrl);
    return { adapter: createOpenAiAdapter(baseUrl), baseUrl, auth: resolveAuth(raw, OPENAI_META.defaultAuth) };
  }
  if (raw.format === "gemini") {
    const baseUrl = resolveBaseUrl(raw, GEMINI_META.defaultBaseUrl);
    return { adapter: createGeminiAdapter(baseUrl), baseUrl, auth: resolveAuth(raw, GEMINI_META.defaultAuth) };
  }
  if (raw.format === "custom") {
    const baseUrl = resolveBaseUrl(raw, undefined);
    return { adapter: createCustomAdapter(baseUrl, raw.custom), baseUrl, auth: resolveAuth(raw, CUSTOM_META.defaultAuth) };
  }
  throw new ConfigError(`未知 format / IMAGEN_FORMAT "${raw.format}"，受支持：openai | gemini | custom`);
}
