# imagen-switch MCP 服务器 · 设计文档

- 日期：2026-06-23
- 状态：设计已通过头脑风暴评审，待用户最终审阅
- 作者：Claude（结对设计）

---

## 1. 概述

**imagen-switch** 是一个用 TypeScript 实现的 MCP（Model Context Protocol）服务器。它通过环境变量配置，即可让任意 MCP Host（Claude Code、Cursor 等）中的 Agent 获得 **文生图（text-to-image）** 与 **图生图/编辑（image edit）** 能力，并能指向**任意** Provider / 端点。

价值主张：用户只需在 MCP 配置的 `env` 里填好 `api_key`、`base_url`、`format`，即可为 Agent 快速接入生图能力——内置常见格式开箱即用，长尾接口用数据驱动的 `custom` 适配器零代码适配。

### 1.1 目标

- 用户仅通过 `IMAGEN_*` 环境变量即可启用，无需改代码
- 内置常见格式适配器（`openai`、`gemini`）+ `custom` 数据驱动适配器 + 统一字段覆盖层
- 将 **OpenAI 格式做成一等公民**：原生暴露 `background`（透明背景）、`quality`、`thinking`、`seed`、`output_format`、`output_compression`、`moderation`、`user` 等完整参数
- 跨 Agent 通用：默认存盘并返回**绝对路径**；可选内联返回 base64 图像块
- 零预装分发：`npx -y imagen-switch-mcp` 即可运行

### 1.2 非目标（YAGNI，明确排除）

- ❌ 单实例多 Provider 运行时切换（由 Host 注册多个实例解决）
- ❌ 本地图像后处理（裁剪 / 滤镜 / 合成）——透明背景由 API 的 `background` 参数实现，非本地处理
- ❌ 图床上传、历史记录数据库、Web UI
- ❌ 视频 / 3D / 音频生成

---

## 2. 技术选型

| 维度 | 选择 | 理由 |
|---|---|---|
| 语言 / 运行时 | TypeScript / Node ≥ 18 | 原生 `fetch`/`FormData`/`Blob`；`npx` 零预装分发 |
| MCP SDK | `@modelcontextprotocol/sdk`（官方） | stdio 传输，工具注册成熟 |
| HTTP | 原生 `fetch`（**不绑定任何 Provider SDK**） | 适配任意 `base_url`/格式，参数透传最彻底 |
| 入参校验 | `zod` | 与 MCP SDK 工具 schema 集成 |
| 构建 | `tsup` | 产出带 shebang 的 ESM `dist/index.js` |
| 测试 | `vitest`（mock `fetch`，不打真实网络） | — |

> **关于 Python/uvx**：`background`、`quality` 等参数本质都是 POST body 的 JSON 字段，与语言无关；绑定官方 `openai` SDK 反而与「多 Provider 通用适配」目标冲突。故采用 TS，保留 `npx` 分发优势。

---

## 3. 架构与目录结构

单进程 stdio MCP 服务器。分层、各模块单一职责、接口清晰可独立测试。

```
imagen-switch/
├── src/
│   ├── index.ts            # 入口：装配 server、注册工具、stdio 连接
│   ├── config.ts           # 解析 + 校验 env → 强类型 ResolvedConfig（启动即校验）
│   ├── server.ts           # 创建 McpServer，按所选适配器构建并注册工具
│   ├── adapters/
│   │   ├── types.ts        # ImageAdapter 接口 + 归一化请求/响应类型
│   │   ├── openai.ts       # 内置：OpenAI Images（含兼容网关）
│   │   ├── gemini.ts       # 内置：Google Gemini / Imagen
│   │   ├── custom.ts       # 数据驱动适配器（env 模板）
│   │   ├── overrides.ts    # 字段覆盖层（对任意适配器生效）
│   │   └── registry.ts     # format 名 → 适配器 的注册表
│   ├── input.ts            # 解析输入图（路径/dataURL/base64/URL）→ {bytes, mime}
│   ├── http.ts             # 统一 fetch 封装：认证注入、超时、重试、错误归一化、url 下载
│   ├── output.ts           # materialize + 落盘 + 构造 MCP 返回内容（路径 / 内联块）
│   └── errors.ts           # 错误类型与面向 Agent 的友好信息（api_key 脱敏）
├── test/                   # 各模块单测 + 适配器契约测试（mock HTTP）
├── package.json            # bin: imagen-switch-mcp
├── tsconfig.json
├── tsup.config.ts
└── README.md               # 各 Provider 的 env 配方与 MCP 配置示例
```

### 3.1 数据流（一次 `generate_image`）

1. Agent 调用工具 → `server.ts` 用 zod 校验入参
2. 取 `config` 选定的 `adapter`，构造归一化请求 `NormReq`
3. `adapter.buildGenerate(req)` → `HttpRequestSpec`（方法/URL/头/体/编码）
4. `overrides` 把 `IMAGEN_EXTRA_BODY/HEADERS/QUERY` 合并进去
5. `http.ts` 注入认证、发送、按需重试；`adapter.parseResponse(raw)` → `NormImage[]`
6. `output.ts` materialize（`url`→下载字节，`b64`→解码）→ 落盘 → 构造返回

**关键边界**：适配器只负责「归一化请求 ↔ 某家 API 请求/响应」的翻译；下载、落盘、返回格式、HTTP 重试、认证都在适配器之外，因此每个适配器都能用 mock 数据独立测试。

---

## 4. 配置模型（环境变量）

统一前缀 `IMAGEN_`。`config.ts` 在**启动时**完成解析与校验：缺关键项或 JSON 非法则立即退出并打印清晰原因。

### ① 核心
| 变量 | 说明 | 默认 |
|---|---|---|
| `IMAGEN_FORMAT` | `openai` \| `gemini` \| `custom` | `openai` |
| `IMAGEN_BASE_URL` | 端点基址，如 `https://api.openai.com/v1` | 按 format 内置 |
| `IMAGEN_API_KEY` | 密钥 | —（custom 可缺省） |
| `IMAGEN_MODEL` | 默认模型，如 `gpt-image-2` / `dall-e-3` / `gemini-2.5-flash-image` | — |

### ② 认证（内置档案给默认，可覆盖）
| 变量 | 说明 | 默认 |
|---|---|---|
| `IMAGEN_AUTH_STYLE` | `bearer` \| `header` \| `query` \| `none` | openai→`bearer`，gemini→`header` |
| `IMAGEN_AUTH_HEADER_NAME` | style=header 时头名，如 `x-goog-api-key` | gemini→`x-goog-api-key` |
| `IMAGEN_AUTH_QUERY_NAME` | style=query 时参数名，如 `key` | — |

### ③ 输出
| 变量 | 说明 | 默认 |
|---|---|---|
| `IMAGEN_OUTPUT_DIR` | 落盘目录 | `<os.tmpdir>/imagen-switch` |
| `IMAGEN_RETURN_INLINE` | 是否同时内联返回 base64 图像块 | `false` |
| `IMAGEN_TIMEOUT_MS` | 单次请求超时 | `120000` |
| `IMAGEN_MAX_RETRIES` | 重试次数（429/5xx/网络错） | `2` |

### ④ 覆盖层（对任意 format 生效，JSON 字符串）
| 变量 | 说明 |
|---|---|
| `IMAGEN_EXTRA_BODY` | 合并进请求体，如 `{"quality":"hd","style":"vivid"}` |
| `IMAGEN_EXTRA_HEADERS` | 合并进请求头 |
| `IMAGEN_EXTRA_QUERY` | 合并进 query |

### ⑤ custom 专用（仅 `IMAGEN_FORMAT=custom`）
| 变量 | 说明 |
|---|---|
| `IMAGEN_CUSTOM_GENERATE_PATH` | 拼到 `base_url` 后的生成路径，如 `/images/generations` |
| `IMAGEN_CUSTOM_EDIT_PATH` | 编辑路径（可选；缺省则该实例不提供 `edit_image`） |
| `IMAGEN_CUSTOM_ENCODING` | `json` \| `multipart` |
| `IMAGEN_CUSTOM_BODY_TEMPLATE` | 带占位符的请求体模板：`{{prompt}}`/`{{model}}`/`{{size}}`/`{{n}}`/`{{image}}` |
| `IMAGEN_CUSTOM_RESPONSE_IMAGES_PATH` | 响应中图像所在路径，如 `data[*].b64_json` 或 `candidates[0].content.parts[*].inline_data.data` |
| `IMAGEN_CUSTOM_RESPONSE_IMAGE_KIND` | `b64` \| `url` \| `dataurl` |

---

## 5. 工具接口

工具入参用 zod 定义。**核心参数**对所有 format 一致；**扩展参数**由所选适配器贡献（见 §6.1），因为「单实例绑定单一 format」，故工具 schema 可按 format 定制而互不污染。

### 5.1 `generate_image`（文生图）

核心参数：
```
prompt:       string   (必填) 图像描述
model?:       string   覆盖默认模型
size?:        string   如 "1024x1024"；适配器自动映射（含 aspect_ratio）
n?:           integer  生成张数，默认 1
output_path?: string   指定保存文件名或目录，覆盖默认目录
```

当 `IMAGEN_FORMAT=openai` 时，额外暴露 OpenAI 扩展参数（均可选）：
| 参数 | 类型 | 说明 / 取值 |
|---|---|---|
| `quality` | string | `standard`/`high`(gpt-image-2)；`low/medium/high/auto`(gpt-image-1)；`standard/hd`(dall-e-3) |
| `background` | string | `auto` / `transparent` / `opaque` ← 透明背景 |
| `thinking` | string | `off` / `low` / `medium` / `high` |
| `seed` | integer | int32，部分可复现 |
| `output_format` | string | `png` / `jpeg` / `webp`（透明需 png/webp；决定落盘扩展名） |
| `output_compression` | integer | 0–100（jpeg/webp 压缩） |
| `moderation` | string | `auto` / `low` |
| `user` | string | 滥用检测标识 |

> **宽松类型而非硬枚举**：上述取值随模型而异，硬枚举会在换模型时误拒。故扩展参数用 `string`/`integer` + 详尽描述（描述里列各模型可选值），最终校验交给 API——符合「适配任意兼容端点/模型」目标。

### 5.2 `edit_image`（图生图 / 编辑）

```
prompt:       string   (必填) 编辑指令
images:       string[] (必填) 输入图：本地路径 / data URL / 裸 base64 / http(s) URL
mask?:        string   inpaint 蒙版（支持的 Provider 才用）
model? size? n? output_path?  同 §5.1
```
当 `IMAGEN_FORMAT=openai` 时同样追加 §5.1 的扩展参数。OpenAI 编辑请求编码为 `multipart/form-data`。

### 5.3 参数优先级

构建请求体时的合并顺序（后者覆盖前者）：

```
适配器内置默认  <  IMAGEN_EXTRA_BODY(env)  <  per-call 工具参数
```

即：任何未在工具 schema 列出的新字段，仍可经 `IMAGEN_EXTRA_BODY` 透传——完整性双保险。

### 5.4 返回

由 `output.ts` 统一构造：
- 一段文本：落盘的**绝对路径**列表 + 元信息（model、size、provider）
- 若 `IMAGEN_RETURN_INLINE=true`：追加 MCP `image` 内容块（base64 + mimeType）
- 失败：返回 `isError` 内容块，含归一化的友好错误（见 §9）

---

## 6. 适配器设计

### 6.1 接口（`adapters/types.ts`）

```ts
interface ImageAdapter {
  format: string
  extraParams: ZodRawShape                          // 贡献给工具的扩展入参
  supportsEdit: boolean
  defaultBaseUrl?: string
  defaultAuth: AuthConfig                            // {style, headerName?, queryName?}
  buildGenerate(req: NormReq): HttpRequestSpec
  buildEdit(req: NormReq, images: ResolvedImage[], mask?: ResolvedImage): HttpRequestSpec
  parseResponse(raw: unknown): NormImage[]
}

type NormReq = {
  prompt: string; model: string; size?: string; n: number
  params: Record<string, unknown>                   // 扩展参数（已含覆盖层合并结果）
}
type ResolvedImage = { bytes: Uint8Array; mime: string }
type HttpRequestSpec = {
  method: string; url: string
  headers: Record<string, string>
  body: Record<string, unknown> | FormData          // json 对象 或 multipart
  query?: Record<string, string>
}
type NormImage = { kind: 'b64' | 'url'; data: string; mime?: string }
```

- `parseResponse` 只产出 `b64` 或 `url`；**下载与落盘不在适配器内**，由 `output.ts` 的 materialize 步骤处理。适配器因此可纯用 mock 数据测试。
- 认证由 `http.ts` 依据 `defaultAuth`（被 `IMAGEN_AUTH_*` 覆盖后）集中注入。

### 6.2 `openai` 适配器
- **generate**：`POST {base}/images/generations`，JSON body（§5.1 完整参数表）
- **edit**：`POST {base}/images/edits`，`multipart/form-data`（`image[]`、`mask`、`prompt` 及其余字段）
- **解析**：`data[*].b64_json` → `{kind:'b64'}`；`data[*].url` → `{kind:'url'}`
- **`response_format` 内部托管**：优先请求 `b64_json`（直接拿字节最稳）；若端点仅回 `url`，materialize 阶段立即下载（契合「url 一小时过期、尽快保存」）。Agent 不感知此参数。
- 兼容 gpt-image 系列（默认/强制 b64_json）与 dall-e。

### 6.3 `gemini` 适配器
- **generate**：`POST {base}/models/{model}:generateContent`，body `contents:[{parts:[{text:prompt}]}]` + 图像输出配置；`size` → `aspect_ratio` 映射
- **edit**：在 `parts` 追加 `inline_data{mime_type, data(base64)}` 图像
- **解析**：`candidates[0].content.parts[*].inline_data.data` → `{kind:'b64'}`
- **认证**：默认 `x-goog-api-key` 头（亦支持 `?key=`，经 `IMAGEN_AUTH_STYLE=query` 切换）
- **实现注记**：Gemini 图像 API 字段演进较快，确切的请求/响应字段与图像输出开关在实现阶段对照 context7 / 官方文档核对后固化（不影响本设计的架构与 env 契约）。

### 6.4 `custom` 适配器（数据驱动）
- 由 §4-⑤ 的 env 模板驱动：占位符替换 + `json|multipart` 编码
- **响应路径解析**：内置迷你解析器，支持 `a.b[0].c` 与 `[*]` 通配；按 `IMAGEN_CUSTOM_RESPONSE_IMAGE_KIND` 决定 `b64`/`url`/`dataurl`
- `extraParams` 为空（custom 不预设扩展参数；额外字段经 `IMAGEN_EXTRA_BODY` 或模板占位符传入）
- 若未配置 `IMAGEN_CUSTOM_EDIT_PATH`，该实例不注册 `edit_image`

### 6.5 `overrides`（覆盖层）
- 把 `IMAGEN_EXTRA_BODY/HEADERS/QUERY` 解析为对象，在 `HttpRequestSpec` 构建后合并
- body 合并遵循 §5.3 优先级；headers/query 直接浅合并

### 6.6 `registry`
- `format` 名 → 适配器实例的映射；`config.ts` 据 `IMAGEN_FORMAT` 选取
- 未知 format → 启动报错并列出受支持值

---

## 7. 输入图解析（`input.ts`）

把 `edit_image` 的 `images[]` / `mask` 中每一项统一解析为 `ResolvedImage {bytes, mime}`：
- **本地路径**：读文件，按扩展名/嗅探推断 mime
- **data URL**（`data:image/png;base64,...`）：拆出 mime 与 base64 解码
- **裸 base64**：解码，mime 嗅探（magic bytes）
- **http(s) URL**：下载字节，取 `Content-Type`

随后交适配器：`json` 编码转 base64 内联；`multipart` 编码用原始字节作文件部分。

---

## 8. 输出与落盘（`output.ts`）

1. **materialize**：`NormImage[]` → 字节。`url`→下载（带超时/重试）；`b64`→解码
2. **扩展名**：按 `output_format` 或实际返回 MIME（magic bytes 兜底）；`.png` 保留 alpha 透明
3. **文件名**：
   - 未给 `output_path`：落到 `IMAGEN_OUTPUT_DIR`，名为 `imagen-<时间戳>-<序号>.<ext>`
   - `output_path` 为目录（以分隔符结尾或为已存在目录）：在该目录内按上述规则命名
   - `output_path` 为文件名且 `n=1`：直接用之；`n>1`：在扩展名前追加 `-<序号>` 以免互相覆盖
   - 自动 `mkdir -p` 目标目录
4. **构造返回**：① 文本（绝对路径列表 + model/size/provider）② `IMAGEN_RETURN_INLINE=true` 时追加 `image` 内容块

---

## 9. 错误处理（`errors.ts` + `http.ts`）

- **启动即校验**：缺关键 env / JSON 非法 → 立即退出并打印清晰原因
- **HTTP 归一化**：401→认证失败、429→限流、400→回显 Provider 的具体报错、超时/网络错分别给可操作提示
- **重试**：429/5xx/网络错指数退避，至多 `IMAGEN_MAX_RETRIES`
- 工具**永不抛裸异常**：失败统一返回 `isError` 内容块
- **安全**：任何日志/错误信息中对 `api_key` 脱敏

---

## 10. 测试策略（vitest，mock `fetch`，不打真实网络）

- **单测**：
  - `config` 解析（合法 / 非法 env，含各 JSON 覆盖项）
  - 各适配器 `buildGenerate` / `buildEdit`（快照出站 `HttpRequestSpec`）
  - 各适配器 `parseResponse`（样例响应 → `NormImage[]`）
  - 覆盖层优先级（§5.3）
  - `input.ts` 解析（路径 / dataURL / base64 / URL 四类）
  - `output.ts` 落盘命名与扩展名（png/jpeg/webp）
- **契约测试**（mock HTTP，全链路）：
  - openai：generate → 落盘断言；edit → multipart 出站断言；`url` 响应 → 下载链路
  - custom：模板渲染 + 响应路径解析
- **可选 e2e 脚本**：需真实 key，不入 CI

---

## 11. 分发与工程

- `package.json` → `bin: { "imagen-switch-mcp": "dist/index.js" }`，文件带 shebang；ESM；`engines.node >= 18`
- 运行：`npx -y imagen-switch-mcp`
- `README.md`：各 Provider 的 env 配方 + MCP 配置示例
- 许可：MIT

---

## 12. 附录：配置示例

### 12.1 OpenAI（gpt-image-2，支持透明背景）— Claude Code `mcpServers`
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
        "IMAGEN_OUTPUT_DIR": "D:/assets/generated"
      }
    }
  }
}
```
Agent 调用：`generate_image(prompt="一只柴犬贴纸", background="transparent", output_format="png")`

### 12.2 OpenAI 兼容网关（如 one-api / OpenRouter）
```json
{
  "env": {
    "IMAGEN_FORMAT": "openai",
    "IMAGEN_BASE_URL": "https://your-gateway.com/v1",
    "IMAGEN_API_KEY": "...",
    "IMAGEN_MODEL": "flux.1-schnell"
  }
}
```

### 12.3 Gemini
```json
{
  "env": {
    "IMAGEN_FORMAT": "gemini",
    "IMAGEN_BASE_URL": "https://generativelanguage.googleapis.com/v1beta",
    "IMAGEN_API_KEY": "...",
    "IMAGEN_MODEL": "gemini-2.5-flash-image"
  }
}
```

### 12.4 custom（任意接口零代码适配）
```json
{
  "env": {
    "IMAGEN_FORMAT": "custom",
    "IMAGEN_BASE_URL": "https://api.example.com",
    "IMAGEN_API_KEY": "...",
    "IMAGEN_AUTH_STYLE": "bearer",
    "IMAGEN_CUSTOM_GENERATE_PATH": "/v1/text2image",
    "IMAGEN_CUSTOM_ENCODING": "json",
    "IMAGEN_CUSTOM_BODY_TEMPLATE": "{\"model\":\"{{model}}\",\"prompt\":\"{{prompt}}\",\"size\":\"{{size}}\",\"num\":{{n}}}",
    "IMAGEN_CUSTOM_RESPONSE_IMAGES_PATH": "output.images[*]",
    "IMAGEN_CUSTOM_RESPONSE_IMAGE_KIND": "url"
  }
}
```

---

## 13. 未来扩展（留口，非本期）

- 单实例多 Provider：`registry` 改为按名注册多个，工具加 `provider` 参数
- 更多内置适配器（stability、flux/BFL 等）
- 本地后处理（引入 `sharp`：尺寸裁剪、格式转换）
- `list_models` 工具（端点支持时）
