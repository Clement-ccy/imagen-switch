import type { AuthDefaults, ImageAdapter, NormImage, NormReq, ResolvedImage } from "./types";
import type { RawConfig } from "../config";
import { ConfigError } from "../errors";
import { extractPath } from "./jsonpath";

export const CUSTOM_META = {
  format: "custom",
  defaultAuth: { style: "bearer" } as AuthDefaults,
  extraParams: {},
};

function escapeTemplateString(value: string): string {
  return JSON.stringify(value).slice(1, -1);
}

function render(template: string, req: NormReq): Record<string, unknown> {
  const filled = template
    .replace(/\{\{prompt\}\}/g, escapeTemplateString(req.prompt))
    .replace(/\{\{model\}\}/g, escapeTemplateString(req.model))
    .replace(/\{\{size\}\}/g, escapeTemplateString(req.size ?? ""))
    .replace(/\{\{n\}\}/g, String(req.n));
  try {
    return JSON.parse(filled) as Record<string, unknown>;
  } catch (e) {
    throw new ConfigError(`渲染 IMAGEN_CUSTOM_BODY_TEMPLATE 后不是合法 JSON：${(e as Error).message}`);
  }
}

function appendFormValue(fd: FormData, key: string, value: unknown): void {
  if (value === undefined || value === null) return;
  if (value instanceof Blob) {
    fd.set(key, value);
    return;
  }
  fd.set(key, typeof value === "object" ? JSON.stringify(value) : String(value));
}

function encodeBody(
  encoding: "json" | "multipart",
  fields: Record<string, unknown>,
  params: Record<string, unknown>,
): Record<string, unknown> | FormData {
  const merged = { ...fields, ...params };
  if (encoding === "json") return merged;
  const fd = new FormData();
  for (const [key, value] of Object.entries(merged)) {
    appendFormValue(fd, key, value);
  }
  return fd;
}

export function createCustomAdapter(baseUrl: string, custom: RawConfig["custom"]): ImageAdapter {
  const kind = custom.responseImageKind ?? "url";
  return {
    ...CUSTOM_META,
    supportsEdit: Boolean(custom.editPath),
    defaultBaseUrl: undefined,
    buildGenerate(req: NormReq) {
      if (!custom.generatePath) throw new ConfigError("custom 格式缺少 IMAGEN_CUSTOM_GENERATE_PATH");
      if (!custom.bodyTemplate) throw new ConfigError("custom 格式缺少 IMAGEN_CUSTOM_BODY_TEMPLATE");
      const body = encodeBody(custom.encoding, render(custom.bodyTemplate, req), req.params);
      return { method: "POST", url: `${baseUrl}${custom.generatePath}`, headers: {}, body };
    },
    buildEdit(req: NormReq, images: ResolvedImage[], _mask?: ResolvedImage) {
      if (!custom.editPath) throw new ConfigError("custom 格式未配置 IMAGEN_CUSTOM_EDIT_PATH，不支持 edit");
      if (!custom.bodyTemplate) throw new ConfigError("custom 格式缺少 IMAGEN_CUSTOM_BODY_TEMPLATE");
      const b64 = Buffer.from(images[0]?.bytes ?? new Uint8Array()).toString("base64");
      const template = custom.bodyTemplate.replace(/\{\{image\}\}/g, escapeTemplateString(b64));
      const body = encodeBody(custom.encoding, render(template, req), req.params);
      return { method: "POST", url: `${baseUrl}${custom.editPath}`, headers: {}, body };
    },
    parseResponse(raw: unknown): NormImage[] {
      if (!custom.responseImagesPath) throw new ConfigError("custom 格式缺少 IMAGEN_CUSTOM_RESPONSE_IMAGES_PATH");
      const values = extractPath(raw, custom.responseImagesPath);
      return values
        .filter((value): value is string => typeof value === "string")
        .map((value) => {
          if (kind === "url") return { kind: "url", data: value };
          if (kind === "dataurl") {
            const match = value.match(/^data:([^;]+);base64,(.+)$/s);
            return { kind: "b64", data: match ? match[2] : value, mime: match?.[1] };
          }
          return { kind: "b64", data: value };
        });
    },
  };
}
