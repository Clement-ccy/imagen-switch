import type { AuthDefaults, ImageAdapter, NormImage, NormReq, ResolvedImage } from "./types";

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

function baseGenerationConfig(req: NormReq): Record<string, unknown> {
  const existing = (req.params.generationConfig ?? {}) as Record<string, unknown>;
  const generationConfig: Record<string, unknown> = {
    responseModalities: ["TEXT", "IMAGE"],
    ...existing,
  };
  if (req.size) {
    generationConfig.imageConfig = {
      ...((generationConfig.imageConfig ?? {}) as Record<string, unknown>),
      aspectRatio: req.size,
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
    buildEdit(req: NormReq, images: ResolvedImage[], _mask?: ResolvedImage) {
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
