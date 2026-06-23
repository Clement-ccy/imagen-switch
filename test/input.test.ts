import { describe, it, expect, vi, afterEach } from "vitest";
import { resolveImage } from "../src/input";
import { writeFile, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

afterEach(() => vi.unstubAllGlobals());

const PNG_B64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

describe("resolveImage", () => {
  it("parses a data URL", async () => {
    const img = await resolveImage(`data:image/png;base64,${PNG_B64}`, 1000);
    expect(img.mime).toBe("image/png");
    expect(img.bytes.length).toBeGreaterThan(0);
  });

  it("parses raw base64 and sniffs png mime", async () => {
    const img = await resolveImage(PNG_B64, 1000);
    expect(img.mime).toBe("image/png");
  });

  it("reads a local file", async () => {
    const dir = await mkdtemp(join(tmpdir(), "imagen-test-"));
    const p = join(dir, "x.png");
    await writeFile(p, Buffer.from(PNG_B64, "base64"));
    const img = await resolveImage(p, 1000);
    expect(img.mime).toBe("image/png");
  });

  it("downloads an http url", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(Buffer.from(PNG_B64, "base64"), { status: 200, headers: { "content-type": "image/png" } }),
      ),
    );
    const img = await resolveImage("https://x/img.png", 1000);
    expect(img.mime).toBe("image/png");
  });
});
