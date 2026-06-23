import { tmpdir } from "node:os";
import { join } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { RawConfig } from "./config";
import type { NormReq } from "./adapters/types";
import { createAdapter } from "./adapters/registry";
import { applyOverrides } from "./adapters/overrides";
import { sendRequest } from "./http";
import { resolveImage } from "./input";
import { buildToolResult, materialize, saveImages } from "./output";
import { ConfigError, ProviderError, redactKey } from "./errors";

const coreShape = {
  prompt: z.string().describe("图像描述/编辑指令"),
  model: z.string().optional().describe("覆盖默认模型 IMAGEN_MODEL"),
  size: z.string().optional().describe("如 1024x1024；适配器自动映射"),
  n: z.number().int().optional().describe("生成张数，默认 1"),
  output_path: z.string().optional().describe("保存文件名或目录，覆盖默认输出目录"),
};

const CORE_KEYS = new Set(["prompt", "model", "size", "n", "output_path", "images", "mask"]);

function defaultDir(): string {
  return join(tmpdir(), "imagen-switch");
}

function toNormReq(args: Record<string, unknown>, raw: RawConfig): NormReq {
  const model = (args.model as string | undefined) ?? raw.model;
  if (!model) throw new ConfigError("未提供 model，且未设置 IMAGEN_MODEL");

  const extras: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args)) {
    if (!CORE_KEYS.has(key) && value !== undefined) extras[key] = value;
  }

  return {
    prompt: args.prompt as string,
    model,
    size: args.size as string | undefined,
    n: (args.n as number | undefined) ?? 1,
    params: { ...raw.extraBody, ...extras },
  };
}

function errorResult(error: unknown, apiKey?: string) {
  const message = error instanceof Error ? error.message : String(error);
  return { content: [{ type: "text" as const, text: redactKey(message, apiKey) }], isError: true as const };
}

export function buildServer(raw: RawConfig): McpServer {
  const { adapter, auth } = createAdapter(raw);
  const server = new McpServer({ name: "imagen-switch", version: "0.1.0" });
  const opts = { timeoutMs: raw.timeoutMs, maxRetries: raw.maxRetries };
  const overrides = { headers: raw.extraHeaders, query: raw.extraQuery };

  server.registerTool(
    "generate_image",
    {
      title: "Generate Image",
      description: "用配置的 Provider 生成图像，保存到本地并返回路径。",
      inputSchema: { ...coreShape, ...adapter.extraParams },
    },
    async (args) => {
      try {
        const req = toNormReq(args, raw);
        const spec = applyOverrides(adapter.buildGenerate(req), overrides);
        const rawResponse = await sendRequest(spec, auth, opts);
        const images = adapter.parseResponse(rawResponse);
        if (images.length === 0) throw new ProviderError("Provider 未返回任何图像");
        const mats = await materialize(images, { ...opts, preferredOutputFormat: req.params.output_format });
        const paths = await saveImages(mats, {
          outputDir: raw.outputDir ?? defaultDir(),
          outputPath: args.output_path as string | undefined,
        });
        return buildToolResult(paths, mats, { model: req.model, size: req.size, provider: adapter.format }, raw.returnInline);
      } catch (e) {
        return errorResult(e, auth.apiKey);
      }
    },
  );

  if (adapter.supportsEdit) {
    server.registerTool(
      "edit_image",
      {
        title: "Edit Image",
        description: "基于一张或多张输入图按指令编辑/重绘，保存到本地并返回路径。",
        inputSchema: {
          ...coreShape,
          images: z.array(z.string()).describe("输入图：本地路径 / data URL / 裸 base64 / http(s) URL"),
          mask: z.string().optional().describe("inpaint 蒙版（支持的 Provider 才用）"),
          ...adapter.extraParams,
        },
      },
      async (args) => {
        try {
          const req = toNormReq(args, raw);
          const refs = (args.images as string[] | undefined) ?? [];
          if (refs.length === 0) throw new ConfigError("edit_image 需要至少一张 images");
          const images = await Promise.all(refs.map((ref) => resolveImage(ref, opts.timeoutMs)));
          const mask = args.mask ? await resolveImage(args.mask as string, opts.timeoutMs) : undefined;
          const spec = applyOverrides(adapter.buildEdit(req, images, mask), overrides);
          const rawResponse = await sendRequest(spec, auth, opts);
          const out = adapter.parseResponse(rawResponse);
          if (out.length === 0) throw new ProviderError("Provider 未返回任何图像");
          const mats = await materialize(out, { ...opts, preferredOutputFormat: req.params.output_format });
          const paths = await saveImages(mats, {
            outputDir: raw.outputDir ?? defaultDir(),
            outputPath: args.output_path as string | undefined,
          });
          return buildToolResult(paths, mats, { model: req.model, size: req.size, provider: adapter.format }, raw.returnInline);
        } catch (e) {
          return errorResult(e, auth.apiKey);
        }
      },
    );
  }

  return server;
}
