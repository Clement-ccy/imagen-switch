import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
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

export function isDirectExecution(
  moduleUrl: string,
  argvPath: string | undefined,
  resolvePath: (path: string) => string = realpathSync,
): boolean {
  if (!argvPath) return false;

  try {
    return resolvePath(fileURLToPath(moduleUrl)) === resolvePath(argvPath);
  } catch {
    return false;
  }
}

if (isDirectExecution(import.meta.url, process.argv[1])) {
  main().catch((e) => {
    process.stderr.write(`[imagen-switch] fatal: ${e instanceof Error ? e.message : String(e)}\n`);
    process.exit(1);
  });
}
