# imagen-switch-mcp

`imagen-switch-mcp` 是一个 TypeScript 实现的 MCP server，用环境变量把任意 MCP Agent 连接到图像生成/编辑端点。

它内置 OpenAI Images、OpenAI 兼容网关、Gemini 图像接口，并提供 `custom` 数据驱动适配器，用于接入长尾 Provider。

## 功能

- MCP 工具：`generate_image` 与 `edit_image`
- Provider：`openai`、`gemini`、`custom`
- 输入图：本地路径、data URL、裸 base64、HTTP(S) URL
- 输出：默认保存到本地并返回绝对路径，可选内联返回 MCP image 内容块
- HTTP：统一认证注入、超时、429/5xx/网络错误重试、友好错误信息与 API key 脱敏
- 分发：发布到 npm 后可通过 `npx -y imagen-switch-mcp` 直接启动

## 快速开始

### 作为 npm 包使用

发布后，在 Agent 的 MCP 配置里使用：

```json
{
  "mcpServers": {
    "imagen": {
      "command": "npx",
      "args": ["-y", "imagen-switch-mcp"],
      "env": {
        "IMAGEN_FORMAT": "openai",
        "IMAGEN_BASE_URL": "https://api.openai.com/v1",
        "IMAGEN_API_KEY": "sk-...",
        "IMAGEN_MODEL": "gpt-image-2",
        "IMAGEN_OUTPUT_DIR": "D:/generated/imagen"
      }
    }
  }
}
```

### 本地开发版本使用

还没发布到 npm 时，先构建：

```powershell
cd D:\Repo\projects\imagen-switch
npm install
npm run build
```

然后让 Agent 指向本地构建产物：

```json
{
  "mcpServers": {
    "imagen": {
      "command": "node",
      "args": ["D:/Repo/projects/imagen-switch/dist/index.js"],
      "env": {
        "IMAGEN_FORMAT": "openai",
        "IMAGEN_BASE_URL": "https://api.openai.com/v1",
        "IMAGEN_API_KEY": "sk-...",
        "IMAGEN_MODEL": "gpt-image-2",
        "IMAGEN_OUTPUT_DIR": "D:/Repo/projects/imagen-switch/.imagen"
      }
    }
  }
}
```

配置后重启 Agent。工具列表中应出现：

- `generate_image`
- `edit_image`

## 工具

### `generate_image`

```text
generate_image(prompt, model?, size?, n?, output_path?, ...provider 参数)
```

OpenAI 格式常用参数：

```text
generate_image(
  prompt="一只透明背景的极简柴犬贴纸",
  background="transparent",
  output_format="png"
)
```

### `edit_image`

```text
edit_image(prompt, images[], mask?, model?, size?, n?, output_path?, ...provider 参数)
```

`images` 支持：

- 本地文件路径
- `data:image/png;base64,...`
- 裸 base64
- `https://...`

## 环境变量

| 变量 | 说明 | 默认 |
| --- | --- | --- |
| `IMAGEN_FORMAT` | `openai`、`gemini`、`custom` | `openai` |
| `IMAGEN_BASE_URL` | Provider API 基址 | openai/gemini 有内置默认 |
| `IMAGEN_API_KEY` | Provider API key | 无 |
| `IMAGEN_MODEL` | 默认模型 | 无 |
| `IMAGEN_OUTPUT_DIR` | 图像保存目录 | 系统临时目录下 `imagen-switch/` |
| `IMAGEN_RETURN_INLINE` | 是否同时返回 MCP image 内容块 | `false` |
| `IMAGEN_TIMEOUT_MS` | 单次请求超时 | `120000` |
| `IMAGEN_MAX_RETRIES` | 429/5xx/网络错误重试次数 | `2` |
| `IMAGEN_EXTRA_BODY` | 额外 JSON body，JSON 对象字符串 | `{}` |
| `IMAGEN_EXTRA_HEADERS` | 额外 headers，JSON 对象字符串 | `{}` |
| `IMAGEN_EXTRA_QUERY` | 额外 query，JSON 对象字符串 | `{}` |

`custom` 专用变量：

| 变量 | 说明 |
| --- | --- |
| `IMAGEN_CUSTOM_GENERATE_PATH` | 生成接口路径，如 `/v1/text2image` |
| `IMAGEN_CUSTOM_EDIT_PATH` | 编辑接口路径；配置后才注册 `edit_image` |
| `IMAGEN_CUSTOM_ENCODING` | `json` 或 `multipart` |
| `IMAGEN_CUSTOM_BODY_TEMPLATE` | 请求体模板，支持 `{{prompt}}`、`{{model}}`、`{{size}}`、`{{n}}`、`{{image}}` |
| `IMAGEN_CUSTOM_RESPONSE_IMAGES_PATH` | 响应图像路径，如 `output.images[*]` |
| `IMAGEN_CUSTOM_RESPONSE_IMAGE_KIND` | `b64`、`url`、`dataurl` |

完整设计背景见 [设计文档](docs/superpowers/specs/2026-06-23-imagen-switch-mcp-design.md)。

## Provider 配方

### OpenAI

```json
{
  "IMAGEN_FORMAT": "openai",
  "IMAGEN_BASE_URL": "https://api.openai.com/v1",
  "IMAGEN_API_KEY": "sk-...",
  "IMAGEN_MODEL": "gpt-image-2"
}
```

### OpenAI 兼容网关

```json
{
  "IMAGEN_FORMAT": "openai",
  "IMAGEN_BASE_URL": "https://your-gateway.example/v1",
  "IMAGEN_API_KEY": "...",
  "IMAGEN_MODEL": "flux.1-schnell"
}
```

### Gemini

```json
{
  "IMAGEN_FORMAT": "gemini",
  "IMAGEN_BASE_URL": "https://generativelanguage.googleapis.com/v1beta",
  "IMAGEN_API_KEY": "...",
  "IMAGEN_MODEL": "gemini-2.5-flash-image"
}
```

### custom

```json
{
  "IMAGEN_FORMAT": "custom",
  "IMAGEN_BASE_URL": "https://api.example.com",
  "IMAGEN_API_KEY": "...",
  "IMAGEN_CUSTOM_GENERATE_PATH": "/v1/text2image",
  "IMAGEN_CUSTOM_ENCODING": "json",
  "IMAGEN_CUSTOM_BODY_TEMPLATE": "{\"model\":\"{{model}}\",\"prompt\":\"{{prompt}}\",\"num\":{{n}}}",
  "IMAGEN_CUSTOM_RESPONSE_IMAGES_PATH": "output.images[*]",
  "IMAGEN_CUSTOM_RESPONSE_IMAGE_KIND": "url"
}
```

## 真实端点人工测试

真实端点测试会消耗 Provider 额度。不要把 API key 写进仓库文件。

先构建：

```powershell
npm install
npm run build
```

设置环境变量，以 OpenAI 为例：

```powershell
$env:IMAGEN_FORMAT="openai"
$env:IMAGEN_BASE_URL="https://api.openai.com/v1"
$env:IMAGEN_API_KEY="你的真实 API Key"
$env:IMAGEN_MODEL="gpt-image-2"
$env:IMAGEN_OUTPUT_DIR="D:\Repo\projects\imagen-switch\.imagen-real"
```

可以使用仓库根目录的 `tmp-real-test.mjs`，也可以临时创建同名文件。通用测试脚本如下：

```js
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
console.log("tools:", tools.tools.map((tool) => tool.name));

const result = await client.callTool(
  {
    name: "generate_image",
    arguments: {
      prompt: "一只透明背景的极简柴犬贴纸",
      background: "transparent",
      output_format: "png",
    },
  },
  undefined,
  { timeout: 300_000 },
);

console.dir(result, { depth: null });
await client.close();
```

运行：

```powershell
node .\tmp-real-test.mjs
```

成功时返回文本中会包含保存路径，例如：

```text
已生成 1 张图像（provider=openai, model=gpt-image-2）：
- D:\Repo\projects\imagen-switch\.imagen-real\imagen-0000000000000-0.png
```

测试结束后清理环境变量：

```powershell
Remove-Item Env:\IMAGEN_FORMAT,Env:\IMAGEN_BASE_URL,Env:\IMAGEN_API_KEY,Env:\IMAGEN_MODEL,Env:\IMAGEN_OUTPUT_DIR -ErrorAction SilentlyContinue
```

## 开发

```powershell
npm install
npm test
npm run typecheck
npm run build
```

常用脚本：

| 命令 | 说明 |
| --- | --- |
| `npm test` | 运行 Vitest |
| `npm run typecheck` | TypeScript 类型检查 |
| `npm run build` | 通过 tsup 构建 `dist/index.js` |
| `npm run ci` | 测试、类型检查、构建 |
| `npm run publish:dry-run` | 本地检查 npm 发布包内容 |

目录结构：

```text
src/
  adapters/       Provider 适配器与 registry
  config.ts       环境变量解析与校验
  errors.ts       友好错误与 API key 脱敏
  http.ts         fetch、认证、超时、重试、下载
  input.ts        输入图解析
  output.ts       图像 materialize、落盘、工具返回
  server.ts       MCP server 工具注册与流水线
  index.ts        stdio 入口
test/
```

## 发布到 npm

发布前确认：

```powershell
npm run ci
npm run publish:dry-run
```

手动发布：

```powershell
npm publish --provenance --access public
```

自动发布使用 `.github/workflows/npm-publish.yml`，只监听 `main` 分支。

推荐方式是 npm Trusted Publishing：

1. 先在 npm 中进入 package 的发布设置，添加 GitHub Actions trusted publisher。
2. Repository 填写当前 GitHub 仓库。
3. Workflow filename 填写 `npm-publish.yml`。
4. GitHub Actions 不需要配置 npm token；workflow 会通过 GitHub OIDC 发布，并生成 provenance。

也可以使用 npm automation token 作为兜底：

1. 在 npm 创建 `Automation` 类型的 access token。
2. 在 GitHub 仓库设置 `Settings -> Secrets and variables -> Actions` 中新增 secret：`NPM_AUTOMATION_TOKEN`。
3. 不要使用普通 classic/granular publish token；如果账号开启了 publish 2FA，这类 token 会在 CI 中触发 `EOTP`，因为 Action 无法输入一次性验证码。

如果 package 还没有首次发布，优先使用 `NPM_AUTOMATION_TOKEN` 完成首发；发布成功后再按需切换到 Trusted Publishing。

合并到 `main` 后，Action 会运行 `npm run ci`。如果 `package.json` 中的版本还没有发布过，Action 会执行 `npm publish --provenance --access public`；如果版本已存在于 npm，Action 会跳过发布，避免主分支文档更新导致失败。

发布新版本时，请先更新 `package.json` 里的 `version`，再合并到主分支。

## 安全

- 不要把 `IMAGEN_API_KEY` 写入仓库。
- `.env`、`.env.*`、`.imagen/`、`.imagen-real/` 已被忽略。
- 错误信息会对已配置的 API key 做脱敏处理。

## License

MIT
