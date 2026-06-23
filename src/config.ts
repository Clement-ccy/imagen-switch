import { ConfigError } from "./errors";
import type { AuthConfig, AuthDefaults, AuthStyle } from "./adapters/types";

export type RawConfig = {
  format: string;
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  authStyle?: AuthStyle;
  authHeaderName?: string;
  authQueryName?: string;
  outputDir?: string;
  returnInline: boolean;
  timeoutMs: number;
  maxRetries: number;
  extraBody: Record<string, unknown>;
  extraHeaders: Record<string, string>;
  extraQuery: Record<string, string>;
  custom: {
    generatePath?: string;
    editPath?: string;
    encoding: "json" | "multipart";
    bodyTemplate?: string;
    responseImagesPath?: string;
    responseImageKind?: "b64" | "url" | "dataurl";
  };
};

function parseJsonEnv(name: string, value: string | undefined): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw new Error("not an object");
    }
    return parsed as Record<string, unknown>;
  } catch (e) {
    throw new ConfigError(`环境变量 ${name} 不是合法的 JSON 对象：${(e as Error).message}`);
  }
}

function parseIntEnv(name: string, value: string | undefined, fallback: number): number {
  if (value === undefined || value === "") return fallback;
  const n = Number(value);
  if (!Number.isFinite(n)) {
    throw new ConfigError(`环境变量 ${name} 必须是数字，收到：${value}`);
  }
  return n;
}

function optionalCustomImageKind(value: string | undefined): "b64" | "url" | "dataurl" | undefined {
  if (value === undefined || value === "") return undefined;
  if (value === "b64" || value === "url" || value === "dataurl") return value;
  throw new ConfigError(`IMAGEN_CUSTOM_RESPONSE_IMAGE_KIND 必须是 b64|url|dataurl，收到：${value}`);
}

export function loadRawConfig(env: Record<string, string | undefined>): RawConfig {
  const style = env.IMAGEN_AUTH_STYLE as AuthStyle | undefined;
  if (style && !["bearer", "header", "query", "none"].includes(style)) {
    throw new ConfigError(`IMAGEN_AUTH_STYLE 必须是 bearer|header|query|none，收到：${style}`);
  }

  const encoding = (env.IMAGEN_CUSTOM_ENCODING as "json" | "multipart" | undefined) ?? "json";
  if (!["json", "multipart"].includes(encoding)) {
    throw new ConfigError(`IMAGEN_CUSTOM_ENCODING 必须是 json|multipart，收到：${encoding}`);
  }

  return {
    format: env.IMAGEN_FORMAT ?? "openai",
    baseUrl: env.IMAGEN_BASE_URL,
    apiKey: env.IMAGEN_API_KEY,
    model: env.IMAGEN_MODEL,
    authStyle: style,
    authHeaderName: env.IMAGEN_AUTH_HEADER_NAME,
    authQueryName: env.IMAGEN_AUTH_QUERY_NAME,
    outputDir: env.IMAGEN_OUTPUT_DIR,
    returnInline: env.IMAGEN_RETURN_INLINE === "true",
    timeoutMs: parseIntEnv("IMAGEN_TIMEOUT_MS", env.IMAGEN_TIMEOUT_MS, 120000),
    maxRetries: parseIntEnv("IMAGEN_MAX_RETRIES", env.IMAGEN_MAX_RETRIES, 2),
    extraBody: parseJsonEnv("IMAGEN_EXTRA_BODY", env.IMAGEN_EXTRA_BODY),
    extraHeaders: parseJsonEnv("IMAGEN_EXTRA_HEADERS", env.IMAGEN_EXTRA_HEADERS) as Record<string, string>,
    extraQuery: parseJsonEnv("IMAGEN_EXTRA_QUERY", env.IMAGEN_EXTRA_QUERY) as Record<string, string>,
    custom: {
      generatePath: env.IMAGEN_CUSTOM_GENERATE_PATH,
      editPath: env.IMAGEN_CUSTOM_EDIT_PATH,
      encoding,
      bodyTemplate: env.IMAGEN_CUSTOM_BODY_TEMPLATE,
      responseImagesPath: env.IMAGEN_CUSTOM_RESPONSE_IMAGES_PATH,
      responseImageKind: optionalCustomImageKind(env.IMAGEN_CUSTOM_RESPONSE_IMAGE_KIND),
    },
  };
}

export function resolveBaseUrl(raw: RawConfig, defaultBaseUrl?: string): string {
  const url = raw.baseUrl ?? defaultBaseUrl;
  if (!url) {
    throw new ConfigError(`缺少 IMAGEN_BASE_URL，且 format "${raw.format}" 无内置默认值`);
  }
  return url.replace(/\/+$/, "");
}

export function resolveAuth(raw: RawConfig, defaults: AuthDefaults): AuthConfig {
  return {
    style: raw.authStyle ?? defaults.style,
    headerName: raw.authHeaderName ?? defaults.headerName,
    queryName: raw.authQueryName ?? defaults.queryName,
    apiKey: raw.apiKey,
  };
}
