import { readFile } from "node:fs/promises";
import type { ResolvedImage } from "./adapters/types";
import { downloadToBytes } from "./http";
import { ConfigError } from "./errors";

function sniffMime(bytes: Uint8Array): string {
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return "image/png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return "image/jpeg";
  if (bytes[0] === 0x47 && bytes[1] === 0x49) return "image/gif";
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[8] === 0x57) return "image/webp";
  return "application/octet-stream";
}

const DATA_URL_RE = /^data:([^;]+);base64,(.+)$/s;

export async function resolveImage(ref: string, timeoutMs: number): Promise<ResolvedImage> {
  const dataMatch = ref.match(DATA_URL_RE);
  if (dataMatch) {
    const bytes = new Uint8Array(Buffer.from(dataMatch[2], "base64"));
    return { bytes, mime: dataMatch[1] };
  }

  if (/^https?:\/\//.test(ref)) {
    return downloadToBytes(ref, { timeoutMs, maxRetries: 0 });
  }

  const compact = ref.replace(/\s/g, "");
  if (/^[A-Za-z0-9+/=]+$/.test(compact) && compact.length % 4 === 0 && compact.length > 16) {
    const bytes = new Uint8Array(Buffer.from(compact, "base64"));
    if (bytes.length > 0) return { bytes, mime: sniffMime(bytes) };
  }

  try {
    const buf = await readFile(ref);
    const bytes = new Uint8Array(buf);
    return { bytes, mime: sniffMime(bytes) };
  } catch {
    throw new ConfigError(`无法解析输入图：${ref}（既非 data URL / http URL / base64，也非可读文件）`);
  }
}
