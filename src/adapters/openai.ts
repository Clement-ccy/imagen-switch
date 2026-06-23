import { z } from "zod";
import type { AuthDefaults, ImageAdapter, NormImage, NormReq, ResolvedImage } from "./types";

export const OPENAI_META = {
  format: "openai",
  defaultBaseUrl: "https://api.openai.com/v1",
  defaultAuth: { style: "bearer" } as AuthDefaults,
  supportsEdit: true,
  extraParams: {
    quality: z
      .string()
      .optional()
      .describe("standard/high (gpt-image-2); low/medium/high/auto (gpt-image-1); standard/hd (dall-e-3)"),
    background: z.string().optional().describe("auto | transparent | opaque"),
    thinking: z.string().optional().describe("off | low | medium | high"),
    seed: z.number().int().optional().describe("int32"),
    output_format: z.string().optional().describe("png | jpeg | webp"),
    output_compression: z.number().int().optional().describe("0-100"),
    moderation: z.string().optional().describe("auto | low"),
    user: z.string().optional().describe("abuse detection identifier"),
  },
};

function parseResponse(raw: unknown): NormImage[] {
  const data = (raw as { data?: unknown })?.data;
  if (!Array.isArray(data)) return [];
  const out: NormImage[] = [];
  for (const item of data) {
    const image = item as { b64_json?: unknown; url?: unknown };
    if (typeof image.b64_json === "string") {
      out.push({ kind: "b64", data: image.b64_json });
    } else if (typeof image.url === "string") {
      out.push({ kind: "url", data: image.url });
    }
  }
  return out;
}

function appendFormValue(fd: FormData, key: string, value: unknown): void {
  if (value === undefined || value === null) return;
  fd.set(key, typeof value === "object" ? JSON.stringify(value) : String(value));
}

function imageBlob(image: ResolvedImage): Blob {
  const copy = new Uint8Array(image.bytes.length);
  copy.set(image.bytes);
  return new Blob([copy.buffer as ArrayBuffer], { type: image.mime });
}

export function createOpenAiAdapter(baseUrl: string): ImageAdapter {
  return {
    ...OPENAI_META,
    buildGenerate(req: NormReq) {
      const body: Record<string, unknown> = {
        ...req.params,
        model: req.model,
        prompt: req.prompt,
        n: req.n,
      };
      if (req.size) body.size = req.size;
      return { method: "POST", url: `${baseUrl}/images/generations`, headers: {}, body };
    },
    buildEdit(req: NormReq, images: ResolvedImage[], mask?: ResolvedImage) {
      const fd = new FormData();
      fd.set("prompt", req.prompt);
      fd.set("model", req.model);
      fd.set("n", String(req.n));
      if (req.size) fd.set("size", req.size);
      for (const [key, value] of Object.entries(req.params)) {
        appendFormValue(fd, key, value);
      }

      const field = images.length > 1 ? "image[]" : "image";
      for (const img of images) {
        fd.append(field, imageBlob(img), "image.png");
      }
      if (mask) fd.set("mask", imageBlob(mask), "mask.png");

      return { method: "POST", url: `${baseUrl}/images/edits`, headers: {}, body: fd };
    },
    parseResponse,
  };
}
