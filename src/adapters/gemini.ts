import type { AuthDefaults, ImageAdapter, NormImage, NormReq, ResolvedImage } from "./types";
import { ConfigError } from "../errors";

export const GEMINI_META = {
  format: "gemini",
  defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta",
  defaultAuth: { style: "header", headerName: "x-goog-api-key" } as AuthDefaults,
  supportsEdit: true,
  extraParams: {},
};

function bytesToB64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

function gcd(a: number, b: number): number {
  while (b !== 0) {
    [a, b] = [b, a % b];
  }
  return a;
}

function toAspectRatio(size: string): string {
  const match = /^(\d+)x(\d+)$/.exec(size);
  if (!match) return size;
  const width = Number(match[1]);
  const height = Number(match[2]);
  const divisor = gcd(width, height);
  return `${width / divisor}:${height / divisor}`;
}

function baseGenerationConfig(req: NormReq): Record<string, unknown> {
  if (req.n !== 1) throw new ConfigError("Gemini 图像接口仅支持 n=1");
  const existing = (req.params.generationConfig ?? {}) as Record<string, unknown>;
  const generationConfig: Record<string, unknown> = {
    responseModalities: ["TEXT", "IMAGE"],
    ...existing,
  };
  if (req.size) {
    generationConfig.imageConfig = {
      ...((generationConfig.imageConfig ?? {}) as Record<string, unknown>),
      aspectRatio: toAspectRatio(req.size),
    };
  }
  return generationConfig;
}

function parseResponse(raw: unknown): NormImage[] {
  const parts = (raw as any)?.candidates?.[0]?.content?.parts ?? [];
  const out: NormImage[] = [];
  for (const part of parts) {
    const inline = part.inline_data ?? part.inlineData;
    if (inline?.data) {
      out.push({
        kind: "b64",
        data: inline.data,
        mime: inline.mime_type ?? inline.mimeType ?? "image/png",
      });
    }
  }
  return out;
}

export function createGeminiAdapter(baseUrl: string): ImageAdapter {
  return {
    ...GEMINI_META,
    buildGenerate(req: NormReq) {
      const { generationConfig: _generationConfig, ...params } = req.params;
      const body: Record<string, unknown> = {
        contents: [{ parts: [{ text: req.prompt }] }],
        ...params,
        generationConfig: baseGenerationConfig(req),
      };
      return { method: "POST", url: `${baseUrl}/models/${req.model}:generateContent`, headers: {}, body };
    },
    buildEdit(req: NormReq, images: ResolvedImage[], mask?: ResolvedImage) {
      if (mask) throw new ConfigError("Gemini 图像编辑不支持 mask 参数");
      const { generationConfig: _generationConfig, ...params } = req.params;
      const parts: unknown[] = [{ text: req.prompt }];
      for (const img of images) {
        parts.push({ inline_data: { mime_type: img.mime, data: bytesToB64(img.bytes) } });
      }
      const body: Record<string, unknown> = {
        contents: [{ parts }],
        ...params,
        generationConfig: baseGenerationConfig(req),
      };
      return { method: "POST", url: `${baseUrl}/models/${req.model}:generateContent`, headers: {}, body };
    },
    parseResponse,
  };
}
