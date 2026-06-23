import { mkdir, stat, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join, resolve } from "node:path";
import type { NormImage } from "./adapters/types";
import { downloadToBytes } from "./http";

export function extFromMime(mime: string): string {
  if (mime.includes("jpeg") || mime.includes("jpg")) return "jpg";
  if (mime.includes("webp")) return "webp";
  if (mime.includes("gif")) return "gif";
  if (mime.includes("png")) return "png";
  return "png";
}

export function mimeFromOutputFormat(format?: unknown): string | undefined {
  if (format !== "png" && format !== "jpeg" && format !== "jpg" && format !== "webp") return undefined;
  return format === "jpg" || format === "jpeg" ? "image/jpeg" : `image/${format}`;
}

export async function materialize(
  images: NormImage[],
  opts: { timeoutMs: number; maxRetries: number; preferredOutputFormat?: unknown },
): Promise<{ bytes: Uint8Array; mime: string }[]> {
  const out: { bytes: Uint8Array; mime: string }[] = [];
  const preferredMime = mimeFromOutputFormat(opts.preferredOutputFormat);
  for (const image of images) {
    if (image.kind === "b64") {
      out.push({
        bytes: new Uint8Array(Buffer.from(image.data, "base64")),
        mime: image.mime ?? preferredMime ?? "image/png",
      });
    } else {
      out.push(await downloadToBytes(image.data, opts));
    }
  }
  return out;
}

async function isDir(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

export async function saveImages(
  mats: { bytes: Uint8Array; mime: string }[],
  opts: { outputDir: string; outputPath?: string },
): Promise<string[]> {
  const paths: string[] = [];
  const multi = mats.length > 1;
  let targetDir = opts.outputDir;
  let baseName: string | undefined;

  if (opts.outputPath) {
    const outputPath = resolve(opts.outputPath);
    if (opts.outputPath.endsWith("/") || opts.outputPath.endsWith("\\") || (await isDir(outputPath))) {
      targetDir = outputPath;
    } else {
      targetDir = dirname(outputPath);
      baseName = basename(outputPath);
    }
  }

  await mkdir(targetDir, { recursive: true });

  const stamp = Date.now();
  for (let i = 0; i < mats.length; i += 1) {
    const ext = extFromMime(mats[i].mime);
    let name: string;
    if (baseName) {
      if (multi) {
        const currentExt = extname(baseName);
        const base = baseName.slice(0, baseName.length - currentExt.length);
        name = `${base}-${i}${currentExt || `.${ext}`}`;
      } else {
        name = baseName;
      }
    } else {
      name = `imagen-${stamp}-${i}.${ext}`;
    }
    const full = join(targetDir, name);
    await writeFile(full, mats[i].bytes);
    paths.push(resolve(full));
  }

  return paths;
}

export function buildToolResult(
  paths: string[],
  mats: { bytes: Uint8Array; mime: string }[],
  meta: { model: string; size?: string; provider: string },
  returnInline: boolean,
) {
  const lines = [
    `已生成 ${paths.length} 张图像（provider=${meta.provider}, model=${meta.model}${meta.size ? `, size=${meta.size}` : ""}）：`,
    ...paths.map((path) => `- ${path}`),
  ];
  const content: any[] = [{ type: "text", text: lines.join("\n") }];
  if (returnInline) {
    for (const mat of mats) {
      content.push({ type: "image", data: Buffer.from(mat.bytes).toString("base64"), mimeType: mat.mime });
    }
  }
  return { content, isError: false as const };
}
