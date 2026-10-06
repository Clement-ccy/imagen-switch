import { describe, it, expect, vi, afterEach } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildServer } from "../src/server";
import { loadRawConfig } from "../src/config";

afterEach(() => vi.unstubAllGlobals());

async function connect(raw: ReturnType<typeof loadRawConfig>) {
  const server = buildServer(raw);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test", version: "0.0.0" });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

describe("buildServer", () => {
  it("lists generate_image and edit_image for openai", async () => {
    const client = await connect(loadRawConfig({ IMAGEN_FORMAT: "openai", IMAGEN_API_KEY: "k", IMAGEN_MODEL: "gpt-image-2" }));
    const { tools } = await client.listTools();
    const names = tools.map((tool) => tool.name);
    expect(names).toContain("generate_image");
    expect(names).toContain("edit_image");
    const generate = tools.find((tool) => tool.name === "generate_image")!;
    const edit = tools.find((tool) => tool.name === "edit_image")!;
    expect(generate.inputSchema.properties).not.toHaveProperty("input_fidelity");
    expect(edit.inputSchema.properties).toHaveProperty("input_fidelity");
  });

  it("generate_image saves a file and returns its path", async () => {
    const dir = await mkdtemp(join(tmpdir(), "imagen-srv-"));
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString("base64");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ data: [{ b64_json: png }] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );
    const client = await connect(
      loadRawConfig({ IMAGEN_FORMAT: "openai", IMAGEN_API_KEY: "k", IMAGEN_MODEL: "gpt-image-2", IMAGEN_OUTPUT_DIR: dir }),
    );
    const res: any = await client.callTool({ name: "generate_image", arguments: { prompt: "a cat", background: "transparent" } });
    expect(res.isError).toBeFalsy();
    const text = res.content.find((content: any) => content.type === "text").text as string;
    const match = text.match(/- (.+\.png)/);
    expect(match).toBeTruthy();
    expect((await readFile(match![1])).length).toBeGreaterThan(0);
  });

  it("uses output_format for b64 output extension", async () => {
    const dir = await mkdtemp(join(tmpdir(), "imagen-srv-webp-"));
    const b64 = Buffer.from([1, 2, 3]).toString("base64");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ data: [{ b64_json: b64 }] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );
    const client = await connect(
      loadRawConfig({ IMAGEN_FORMAT: "openai", IMAGEN_API_KEY: "k", IMAGEN_MODEL: "gpt-image-2", IMAGEN_OUTPUT_DIR: dir }),
    );
    const res: any = await client.callTool({ name: "generate_image", arguments: { prompt: "a cat", output_format: "webp" } });
    const text = res.content.find((content: any) => content.type === "text").text as string;
    expect(text).toMatch(/\.webp/);
  });

  it("edit_image sends the input image and saves the edited output", async () => {
    const dir = await mkdtemp(join(tmpdir(), "imagen-srv-edit-"));
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString("base64");
    const fetchMock = vi.fn().mockImplementation(async (_url, init: RequestInit) => {
      const body = init.body as FormData;
      expect(body.get("image")).toBeInstanceOf(Blob);
      expect(body.get("prompt")).toBe("make it blue");
      expect(body.get("input_fidelity")).toBe("high");
      return new Response(JSON.stringify({ data: [{ b64_json: png }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const client = await connect(
      loadRawConfig({ IMAGEN_FORMAT: "openai", IMAGEN_API_KEY: "k", IMAGEN_MODEL: "gpt-image-2", IMAGEN_OUTPUT_DIR: dir }),
    );

    const res: any = await client.callTool({
      name: "edit_image",
      arguments: { prompt: "make it blue", images: [`data:image/png;base64,${png}`], input_fidelity: "high" },
    });

    expect(res.isError).toBeFalsy();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const text = res.content.find((content: any) => content.type === "text").text as string;
    const match = text.match(/- (.+\.png)/);
    expect(match).toBeTruthy();
    expect((await readFile(match![1])).length).toBeGreaterThan(0);
  });

  it("returns isError on provider failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("bad key", { status: 401 })));
    const client = await connect(loadRawConfig({ IMAGEN_FORMAT: "openai", IMAGEN_API_KEY: "k", IMAGEN_MODEL: "gpt-image-2" }));
    const res: any = await client.callTool({ name: "generate_image", arguments: { prompt: "x" } });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain("认证失败");
  });
});
