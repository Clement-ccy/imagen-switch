import { pathToFileURL } from "node:url";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadRawConfig } from "./config";
import { buildServer } from "./server";

export async function main(): Promise<void> {
  let raw;
  try {
    raw = loadRawConfig(process.env);
  } catch (e) {
    process.stderr.write(`[imagen-switch] 配置错误：${e instanceof Error ? e.message : String(e)}\n`);
    process.exit(1);
  }

  const server = buildServer(raw);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write(`[imagen-switch] started (format=${raw.format})\n`);

  process.on("SIGINT", async () => {
    await server.close();
    process.exit(0);
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    process.stderr.write(`[imagen-switch] fatal: ${e instanceof Error ? e.message : String(e)}\n`);
    process.exit(1);
  });
}
