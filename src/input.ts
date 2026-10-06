import { readFile } from "node:fs/promises";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
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

type ResolveHost = (hostname: string) => Promise<string[]>;

async function resolveHost(hostname: string): Promise<string[]> {
  return (await lookup(hostname, { all: true, verbatim: true })).map(({ address }) => address);
}

function isPrivateAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const [a, b] = address.split(".").map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224
    );
  }
  if (isIP(address) === 6) {
    const normalized = address.toLowerCase();
    return (
      normalized === "::" ||
      normalized === "::1" ||
      normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      /^fe[89ab]/.test(normalized) ||
      normalized.startsWith("::ffff:") && isPrivateAddress(normalized.slice(7))
    );
  }
  return true;
}

async function assertPublicUrl(ref: string, resolver: ResolveHost): Promise<void> {
  const url = new URL(ref);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new ConfigError(`远程输入仅支持 HTTP(S) URL：${ref}`);
  }
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  if (hostname === "localhost" || hostname.endsWith(".localhost")) {
    throw new ConfigError(`拒绝访问私有或本机地址：${hostname}`);
  }
  const addresses = isIP(hostname) ? [hostname] : await resolver(hostname);
  if (addresses.length === 0 || addresses.some(isPrivateAddress)) {
    throw new ConfigError(`拒绝访问私有或本机地址：${hostname}`);
  }
}

export async function resolveImage(ref: string, timeoutMs: number, resolver: ResolveHost = resolveHost): Promise<ResolvedImage> {
  const dataMatch = ref.match(DATA_URL_RE);
  if (dataMatch) {
    const bytes = new Uint8Array(Buffer.from(dataMatch[2], "base64"));
    return { bytes, mime: dataMatch[1] };
  }

  if (/^https?:\/\//.test(ref)) {
    const image = await downloadToBytes(ref, {
      timeoutMs,
      maxRetries: 0,
      validateUrl: (url) => assertPublicUrl(url, resolver),
    });
    if (!image.mime.startsWith("image/")) {
      const sniffed = sniffMime(image.bytes);
      if (sniffed === "application/octet-stream") throw new ConfigError(`远程地址未返回有效图像：${ref}`);
      image.mime = sniffed;
    }
    return image;
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
