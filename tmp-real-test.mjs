import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({
  command: "node",
  args: ["dist/index.js"],
  env: process.env,
});

const client = new Client({ name: "real-test", version: "0.0.0" });
await client.connect(transport);

const tools = await client.listTools();
console.log("tools:", tools.tools.map(t => t.name));

const result = await client.callTool(
  {
    name: "generate_image",
    arguments: {
      prompt: `横轴为时间/能力演进，四个阶段依次为：自动化 → 数字化 → 智能化 → AI 定义； 纵轴或色带标注"定义权归属"：人/固定程序 → 人为主、模型辅助 → 人机协同（AI 局部） → AI 为主（人监督）； 每阶段下标注代表技术（PLC/数控、CAD/CAE/MES、机器学习/数字孪生、大模型/智能体/具身智能）。`,
      background: "transparent",
      output_format: "png"
    }
  },
  undefined,
  { timeout: 300_000 },
);

console.dir(result, { depth: null });
await client.close();
