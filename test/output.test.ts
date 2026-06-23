import { describe, it, expect, vi, afterEach } from "vitest";
import { extFromMime, mimeFromOutputFormat, materialize, saveImages, buildToolResult } from "../src/output";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

afterEach(() => vi.unstubAllGlobals());

describe("extFromMime", () => {
  it("maps mimes to extensions", () => {
    expect(extFromMime("image/png")).toBe("png");
    expect(extFromMime("image/jpeg")).toBe("jpg");
    expect(extFromMime("image/webp")).toBe("webp");
    expect(extFromMime("application/octet-stream")).toBe("png");
  });
});

describe("mimeFromOutputFormat", () => {
  it("maps output_format to mime", () => {
    expect(mimeFromOutputFormat("png")).toBe("image/png");
    expect(mimeFromOutputFormat("jpeg")).toBe("image/jpeg");
    expect(mimeFromOutputFormat("webp")).toBe("image/webp");
    expect(mimeFromOutputFormat("unknown")).toBeUndefined();
  });
});

describe("materialize", () => {
  it("decodes b64 and downloads url", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(new Uint8Array([9, 9]), { status: 200, headers: { "content-type": "image/png" } })),
    );
    const out = await materialize(
      [
        { kind: "b64", data: Buffer.from([1, 2]).toString("base64"), mime: "image/png" },
        { kind: "url", data: "https://i/x" },
      ],
      { timeoutMs: 1000, maxRetries: 0 },
    );
    expect(Array.from(out[0].bytes)).toEqual([1, 2]);
    expect(Array.from(out[1].bytes)).toEqual([9, 9]);
  });

  it("uses output_format as the mime fallback for b64 images", async () => {
    const out = await materialize([{ kind: "b64", data: Buffer.from([1, 2]).toString("base64") }], {
      timeoutMs: 1000,
      maxRetries: 0,
      preferredOutputFormat: "webp",
    });
    expect(out[0].mime).toBe("image/webp");
  });
});

describe("saveImages", () => {
  it("writes files and returns absolute paths", async () => {
    const dir = await mkdtemp(join(tmpdir(), "imagen-out-"));
    const paths = await saveImages(
      [
        { bytes: new Uint8Array([1]), mime: "image/png" },
        { bytes: new Uint8Array([2]), mime: "image/png" },
      ],
      { outputDir: dir },
    );
    expect(paths.length).toBe(2);
    expect((await readFile(paths[0])).length).toBe(1);
  });

  it("honors output_path file name with index suffix for n>1", async () => {
    const dir = await mkdtemp(join(tmpdir(), "imagen-out2-"));
    const paths = await saveImages(
      [
        { bytes: new Uint8Array([1]), mime: "image/png" },
        { bytes: new Uint8Array([2]), mime: "image/png" },
      ],
      { outputDir: dir, outputPath: join(dir, "logo.png") },
    );
    expect(paths[0]).toContain("logo-0.png");
    expect(paths[1]).toContain("logo-1.png");
  });
});

describe("buildToolResult", () => {
  it("returns a text block with paths and no image block by default", () => {
    const res = buildToolResult(
      ["/a/x.png"],
      [{ bytes: new Uint8Array([1]), mime: "image/png" }],
      { model: "m", provider: "openai" },
      false,
    );
    expect(res.content[0].type).toBe("text");
    expect(res.content.some((c: any) => c.type === "image")).toBe(false);
  });

  it("appends image blocks when returnInline is true", () => {
    const res = buildToolResult(
      ["/a/x.png"],
      [{ bytes: new Uint8Array([1]), mime: "image/png" }],
      { model: "m", provider: "openai" },
      true,
    );
    const img = res.content.find((c: any) => c.type === "image") as any;
    expect(img.mimeType).toBe("image/png");
    expect(typeof img.data).toBe("string");
  });
});
