# imagen-switch MCP 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: 使用 superpowers:executing-plans 按任务逐个实现本计划（用户已要求**全程在当前会话完成、不使用子代理**）。步骤用 checkbox (`- [ ]`) 跟踪。

**Goal:** 构建一个 TypeScript MCP 服务器，通过 `IMAGEN_*` 环境变量即可让任意 Agent 获得文生图与图生图/编辑能力，并指向任意 Provider。

**Architecture:** 单进程 stdio MCP server。分层：`config`(解析校验 env) → `registry`(选适配器) → 适配器(`openai`/`gemini`/`custom` 把归一化请求翻译成各家 HTTP 请求/响应) → `overrides`(注入额外头/query) → `http`(发请求+重试+下载) → `output`(materialize+落盘+构造返回)。适配器为纯函数，下载/落盘/认证均在其外，可独立 mock 测试。

**Tech Stack:** TypeScript 5、Node ≥18、`@modelcontextprotocol/sdk@1.29.0`(V1 API)、`zod@^3.25`、`vitest`、`tsup`。原生 `fetch`/`FormData`/`Blob`，不绑定任何 Provider SDK。

## Global Constraints

- Node ≥ 18（依赖全局 `fetch`/`FormData`/`Blob`/`File`）。`package.json` 设 `"engines": { "node": ">=18" }`。
- ESM：`package.json` 设 `"type": "module"`。
- 依赖版本固定：`@modelcontextprotocol/sdk@1.29.0`、`zod@^3.25.0`、`tsup@^8`、`vitest@^2`、`typescript@^5`。
- MCP SDK 用 **V1 API**：`import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"`；`import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"`；`server.registerTool(name, { title, description, inputSchema }, handler)`，其中 `inputSchema` 是 **ZodRawShape**（键→zod 校验器的普通对象，**不是** `z.object(...)`）。
- TypeScript：`module: "ESNext"`、`moduleResolution: "bundler"`（相对导入**无需** `.js` 后缀）、`target: "ES2022"`、`strict: true`。
- 环境变量统一前缀 `IMAGEN_`。工具名固定为 `generate_image`、`edit_image`。
- 不绑定 Provider SDK，一律用原生 `fetch`。
- 任何日志/错误信息必须对 `api_key` 脱敏。
- 频繁提交：每个任务末尾 commit。
- 若实现阶段需要网络检索 / 官方文档核对，遵循仓库 AGENTS 指令使用 `mmx-cli`，不要改用其它检索工具。
- specs 对齐硬约束：`custom` 必须同时支持 `json` 与 `multipart`；`output_format` 必须影响 b64 返回图像的 MIME/扩展名；URL 图像下载必须带超时与重试；README 必须覆盖 openai / OpenAI 兼容网关 / gemini / custom 配方。
- 参考设计文档：`docs/superpowers/specs/2026-06-23-imagen-switch-mcp-design.md`。

---

### Task 1: 项目脚手架与工具链

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `tsup.config.ts`
- Create: `vitest.config.ts`
- Create: `src/index.ts`（占位，后续任务替换）
- Test: `test/smoke.test.ts`

**Interfaces:**
- Consumes: 无
- Produces: 可运行的 `npm run build`（产出带 shebang 的 `dist/index.js`）与 `npm test`。

- [ ] **Step 1: 写 package.json**

```json
{
  "name": "imagen-switch-mcp",
  "version": "0.1.0",
  "description": "MCP server for multi-provider image generation via env config",
  "type": "module",
  "bin": { "imagen-switch-mcp": "dist/index.js" },
  "files": ["dist"],
  "engines": { "node": ">=18" },
  "scripts": {
    "build": "tsup",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  },
  "license": "MIT",
  "dependencies": {
    "@modelcontextprotocol/sdk": "1.29.0",
    "zod": "^3.25.0"
  },
  "devDependencies": {
    "tsup": "^8.0.0",
    "typescript": "^5.4.0",
    "vitest": "^2.0.0"
  }
}
```

- [ ] **Step 2: 写 tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "types": ["node"],
    "outDir": "dist"
  },
  "include": ["src", "test"]
}
```

- [ ] **Step 3: 写 tsup.config.ts（产出带 shebang 的 bin）**

```ts
import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node18",
  clean: true,
  banner: { js: "#!/usr/bin/env node" },
});
```

- [ ] **Step 4: 写 vitest.config.ts**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { environment: "node", include: ["test/**/*.test.ts"] },
});
```

- [ ] **Step 5: 写占位入口 src/index.ts**

```ts
// 占位，Task 12 替换为真正的 stdio 入口
export const placeholder = true;
```

- [ ] **Step 6: 写冒烟测试 test/smoke.test.ts**

```ts
import { describe, it, expect } from "vitest";
import { placeholder } from "../src/index";

describe("smoke", () => {
  it("imports the entry module", () => {
    expect(placeholder).toBe(true);
  });
});
```

- [ ] **Step 7: 安装依赖并验证测试失败再通过**

Run: `npm install`
然后 Run: `npm test`
Expected: 1 个测试通过（`smoke > imports the entry module`）。

- [ ] **Step 8: 验证构建**

Run: `npm run build`
Expected: 生成 `dist/index.js`，首行为 `#!/usr/bin/env node`。

- [ ] **Step 9: 写 .gitignore 校验并提交**

Run: `git add -A && git commit -m "chore: scaffold imagen-switch MCP project (toolchain, build, test)"`
Expected: 提交成功。

---

### Task 2: 共享类型与错误层

**Files:**
- Create: `src/adapters/types.ts`
- Create: `src/errors.ts`
- Test: `test/errors.test.ts`

**Interfaces:**
- Produces:
  - 类型 `AuthStyle`、`AuthDefaults`、`AuthConfig`、`NormReq`、`ResolvedImage`、`HttpRequestSpec`、`NormImage`、`ImageAdapter`（见下）。
  - `class ConfigError extends Error`、`class ProviderError extends Error { status?: number }`。
  - `redactKey(text: string, apiKey?: string): string` —— 把文本中出现的 apiKey 替换为 `***`。
  - `friendlyHttpError(status: number, providerBody: string): string`。

- [ ] **Step 1: 写 src/adapters/types.ts（纯类型，无测试）**

```ts
import type { ZodRawShape } from "zod";

export type AuthStyle = "bearer" | "header" | "query" | "none";
export type AuthDefaults = { style: AuthStyle; headerName?: string; queryName?: string };
export type AuthConfig = AuthDefaults & { apiKey?: string };

export type NormReq = {
  prompt: string;
  model: string;
  size?: string;
  n: number;
  params: Record<string, unknown>; // 已合并 extra_body 与 per-call 扩展参数
};

export type ResolvedImage = { bytes: Uint8Array; mime: string };

export type HttpRequestSpec = {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown> | FormData;
  query?: Record<string, string>;
};

export type NormImage = { kind: "b64" | "url"; data: string; mime?: string };

export interface ImageAdapter {
  format: string;
  extraParams: ZodRawShape;
  supportsEdit: boolean;
  defaultBaseUrl?: string;
  defaultAuth: AuthDefaults;
  buildGenerate(req: NormReq): HttpRequestSpec;
  buildEdit(req: NormReq, images: ResolvedImage[], mask?: ResolvedImage): HttpRequestSpec;
  parseResponse(raw: unknown): NormImage[];
}
```

- [ ] **Step 2: 写失败测试 test/errors.test.ts**

```ts
import { describe, it, expect } from "vitest";
import { redactKey, friendlyHttpError, ConfigError } from "../src/errors";

describe("redactKey", () => {
  it("replaces the api key with ***", () => {
    expect(redactKey("Authorization: Bearer sk-secret123", "sk-secret123"))
      .toBe("Authorization: Bearer ***");
  });
  it("returns text unchanged when no key given", () => {
    expect(redactKey("hello", undefined)).toBe("hello");
  });
});

describe("friendlyHttpError", () => {
  it("maps 401 to an auth message including the provider body", () => {
    const msg = friendlyHttpError(401, "invalid key");
    expect(msg).toContain("认证");
    expect(msg).toContain("invalid key");
  });
});

describe("ConfigError", () => {
  it("is an Error subclass", () => {
    expect(new ConfigError("x")).toBeInstanceOf(Error);
  });
});
```

- [ ] **Step 3: 运行验证失败**

Run: `npx vitest run test/errors.test.ts`
Expected: FAIL（`Cannot find module '../src/errors'`）。

- [ ] **Step 4: 写实现 src/errors.ts**

```ts
export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

export class ProviderError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "ProviderError";
    this.status = status;
  }
}

export function redactKey(text: string, apiKey?: string): string {
  if (!apiKey) return text;
  return text.split(apiKey).join("***");
}

export function friendlyHttpError(status: number, providerBody: string): string {
  const body = providerBody.slice(0, 800);
  if (status === 401 || status === 403) return `认证失败 (HTTP ${status})：请检查 IMAGEN_API_KEY / IMAGEN_AUTH_*。Provider 返回：${body}`;
  if (status === 429) return `触发限流 (HTTP 429)：请稍后重试或降低频率。Provider 返回：${body}`;
  if (status === 400) return `请求参数被拒 (HTTP 400)：${body}`;
  return `Provider 返回错误 (HTTP ${status})：${body}`;
}
```

- [ ] **Step 5: 运行验证通过**

Run: `npx vitest run test/errors.test.ts`
Expected: PASS（4 个用例）。

- [ ] **Step 6: 类型检查并提交**

Run: `npm run typecheck && git add -A && git commit -m "feat: add shared adapter types and error layer with key redaction"`
Expected: 通过并提交。

---

### Task 3: 配置层 config.ts

**Files:**
- Create: `src/config.ts`
- Test: `test/config.test.ts`

**Interfaces:**
- Consumes: `ConfigError`（Task 2）；类型 `AuthConfig`、`ImageAdapter`、`AuthDefaults`（Task 2）。
- Produces:
  - `type RawConfig`（见实现）。
  - `loadRawConfig(env: Record<string, string | undefined>): RawConfig` —— 解析+校验，非法即 `throw new ConfigError`。
  - `resolveBaseUrl(raw: RawConfig, defaultBaseUrl?: string): string` —— 无 base url 则 throw。
  - `resolveAuth(raw: RawConfig, defaults: AuthDefaults): AuthConfig`。

- [ ] **Step 1: 写失败测试 test/config.test.ts**

```ts
import { describe, it, expect } from "vitest";
import { loadRawConfig, resolveBaseUrl, resolveAuth } from "../src/config";

const base = { IMAGEN_FORMAT: "openai", IMAGEN_API_KEY: "k", IMAGEN_MODEL: "gpt-image-2" };

describe("loadRawConfig", () => {
  it("parses core fields with defaults", () => {
    const c = loadRawConfig({ ...base });
    expect(c.format).toBe("openai");
    expect(c.apiKey).toBe("k");
    expect(c.returnInline).toBe(false);
    expect(c.timeoutMs).toBe(120000);
    expect(c.maxRetries).toBe(2);
  });
  it("defaults format to openai", () => {
    expect(loadRawConfig({}).format).toBe("openai");
  });
  it("parses IMAGEN_EXTRA_BODY json", () => {
    const c = loadRawConfig({ ...base, IMAGEN_EXTRA_BODY: '{"quality":"hd"}' });
    expect(c.extraBody).toEqual({ quality: "hd" });
  });
  it("throws ConfigError on invalid EXTRA_BODY json", () => {
    expect(() => loadRawConfig({ ...base, IMAGEN_EXTRA_BODY: "{bad" })).toThrow(/EXTRA_BODY/);
  });
  it("throws ConfigError on non-numeric timeout", () => {
    expect(() => loadRawConfig({ ...base, IMAGEN_TIMEOUT_MS: "abc" })).toThrow(/TIMEOUT/);
  });
});

describe("resolveBaseUrl", () => {
  it("prefers env base url", () => {
    expect(resolveBaseUrl(loadRawConfig({ ...base, IMAGEN_BASE_URL: "https://x/v1" }), "https://default")).toBe("https://x/v1");
  });
  it("falls back to adapter default", () => {
    expect(resolveBaseUrl(loadRawConfig({ ...base }), "https://default")).toBe("https://default");
  });
  it("throws when neither present", () => {
    expect(() => resolveBaseUrl(loadRawConfig({ ...base }), undefined)).toThrow(/BASE_URL/);
  });
});

describe("resolveAuth", () => {
  it("uses adapter default style, overridable by env", () => {
    const a = resolveAuth(loadRawConfig({ ...base }), { style: "bearer" });
    expect(a).toEqual({ style: "bearer", headerName: undefined, queryName: undefined, apiKey: "k" });
    const b = resolveAuth(loadRawConfig({ ...base, IMAGEN_AUTH_STYLE: "query", IMAGEN_AUTH_QUERY_NAME: "key" }), { style: "bearer" });
    expect(b.style).toBe("query");
    expect(b.queryName).toBe("key");
  });
});
```

- [ ] **Step 2: 运行验证失败**

Run: `npx vitest run test/config.test.ts`
Expected: FAIL（`Cannot find module '../src/config'`）。

- [ ] **Step 3: 写实现 src/config.ts**

```ts
import { ConfigError } from "./errors";
import type { AuthConfig, AuthDefaults, AuthStyle } from "./adapters/types";

export type RawConfig = {
  format: string;
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  authStyle?: AuthStyle;
  authHeaderName?: string;
  authQueryName?: string;
  outputDir?: string;
  returnInline: boolean;
  timeoutMs: number;
  maxRetries: number;
  extraBody: Record<string, unknown>;
  extraHeaders: Record<string, string>;
  extraQuery: Record<string, string>;
  custom: {
    generatePath?: string;
    editPath?: string;
    encoding: "json" | "multipart";
    bodyTemplate?: string;
    responseImagesPath?: string;
    responseImageKind?: "b64" | "url" | "dataurl";
  };
};

function parseJsonEnv(name: string, value: string | undefined): Record<string, any> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw new Error("not an object");
    }
    return parsed;
  } catch (e) {
    throw new ConfigError(`环境变量 ${name} 不是合法的 JSON 对象：${(e as Error).message}`);
  }
}

function parseIntEnv(name: string, value: string | undefined, fallback: number): number {
  if (value === undefined || value === "") return fallback;
  const n = Number(value);
  if (!Number.isFinite(n)) throw new ConfigError(`环境变量 ${name} 必须是数字，收到：${value}`);
  return n;
}

export function loadRawConfig(env: Record<string, string | undefined>): RawConfig {
  const style = env.IMAGEN_AUTH_STYLE as AuthStyle | undefined;
  if (style && !["bearer", "header", "query", "none"].includes(style)) {
    throw new ConfigError(`IMAGEN_AUTH_STYLE 必须是 bearer|header|query|none，收到：${style}`);
  }
  const encoding = (env.IMAGEN_CUSTOM_ENCODING as "json" | "multipart" | undefined) ?? "json";
  if (!["json", "multipart"].includes(encoding)) {
    throw new ConfigError(`IMAGEN_CUSTOM_ENCODING 必须是 json|multipart，收到：${encoding}`);
  }
  return {
    format: env.IMAGEN_FORMAT ?? "openai",
    baseUrl: env.IMAGEN_BASE_URL,
    apiKey: env.IMAGEN_API_KEY,
    model: env.IMAGEN_MODEL,
    authStyle: style,
    authHeaderName: env.IMAGEN_AUTH_HEADER_NAME,
    authQueryName: env.IMAGEN_AUTH_QUERY_NAME,
    outputDir: env.IMAGEN_OUTPUT_DIR,
    returnInline: env.IMAGEN_RETURN_INLINE === "true",
    timeoutMs: parseIntEnv("IMAGEN_TIMEOUT_MS", env.IMAGEN_TIMEOUT_MS, 120000),
    maxRetries: parseIntEnv("IMAGEN_MAX_RETRIES", env.IMAGEN_MAX_RETRIES, 2),
    extraBody: parseJsonEnv("IMAGEN_EXTRA_BODY", env.IMAGEN_EXTRA_BODY),
    extraHeaders: parseJsonEnv("IMAGEN_EXTRA_HEADERS", env.IMAGEN_EXTRA_HEADERS) as Record<string, string>,
    extraQuery: parseJsonEnv("IMAGEN_EXTRA_QUERY", env.IMAGEN_EXTRA_QUERY) as Record<string, string>,
    custom: {
      generatePath: env.IMAGEN_CUSTOM_GENERATE_PATH,
      editPath: env.IMAGEN_CUSTOM_EDIT_PATH,
      encoding,
      bodyTemplate: env.IMAGEN_CUSTOM_BODY_TEMPLATE,
      responseImagesPath: env.IMAGEN_CUSTOM_RESPONSE_IMAGES_PATH,
      responseImageKind: env.IMAGEN_CUSTOM_RESPONSE_IMAGE_KIND as "b64" | "url" | "dataurl" | undefined,
    },
  };
}

export function resolveBaseUrl(raw: RawConfig, defaultBaseUrl?: string): string {
  const url = raw.baseUrl ?? defaultBaseUrl;
  if (!url) throw new ConfigError(`缺少 IMAGEN_BASE_URL，且 format "${raw.format}" 无内置默认值`);
  return url.replace(/\/+$/, "");
}

export function resolveAuth(raw: RawConfig, defaults: AuthDefaults): AuthConfig {
  return {
    style: raw.authStyle ?? defaults.style,
    headerName: raw.authHeaderName ?? defaults.headerName,
    queryName: raw.authQueryName ?? defaults.queryName,
    apiKey: raw.apiKey,
  };
}
```

- [ ] **Step 4: 运行验证通过**

Run: `npx vitest run test/config.test.ts`
Expected: PASS（全部用例）。

- [ ] **Step 5: 提交**

Run: `npm run typecheck && git add -A && git commit -m "feat: add config loader and resolution helpers"`

---

### Task 4: HTTP 层 http.ts

**Files:**
- Create: `src/http.ts`
- Test: `test/http.test.ts`

**Interfaces:**
- Consumes: `HttpRequestSpec`、`AuthConfig`（Task 2）；`ProviderError`、`friendlyHttpError`、`redactKey`（Task 2）。
- Produces:
  - `sendRequest(spec: HttpRequestSpec, auth: AuthConfig, opts: { timeoutMs: number; maxRetries: number }): Promise<unknown>` —— 注入认证、合并 query、按需重试（429/5xx/网络错指数退避）、非 2xx 抛 `ProviderError`、解析 JSON 返回。
  - `downloadToBytes(url: string, opts: { timeoutMs: number; maxRetries: number }): Promise<{ bytes: Uint8Array; mime: string }>` —— URL 图像下载同样带超时与重试，满足输出 materialize 对过期 URL 尽快保存的要求。

- [ ] **Step 1: 写失败测试 test/http.test.ts**

```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { sendRequest, downloadToBytes } from "../src/http";
import type { HttpRequestSpec, AuthConfig } from "../src/adapters/types";

afterEach(() => vi.unstubAllGlobals());

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

const spec: HttpRequestSpec = { method: "POST", url: "https://api/x", headers: {}, body: { a: 1 } };

describe("sendRequest", () => {
  it("injects bearer auth and returns parsed json", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    const auth: AuthConfig = { style: "bearer", apiKey: "k" };
    const out = await sendRequest(spec, auth, { timeoutMs: 1000, maxRetries: 0 });
    expect(out).toEqual({ ok: true });
    const [, init] = fetchMock.mock.calls[0];
    expect((init.headers as Record<string, string>)["Authorization"]).toBe("Bearer k");
  });

  it("injects query-style auth into the url", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}));
    vi.stubGlobal("fetch", fetchMock);
    await sendRequest(spec, { style: "query", apiKey: "k", queryName: "key" }, { timeoutMs: 1000, maxRetries: 0 });
    expect(fetchMock.mock.calls[0][0]).toContain("key=k");
  });

  it("retries on 500 then succeeds", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ e: 1 }, 500))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    const out = await sendRequest(spec, { style: "none" }, { timeoutMs: 1000, maxRetries: 1 });
    expect(out).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("throws ProviderError with friendly message on 401", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("bad key", { status: 401 })));
    await expect(sendRequest(spec, { style: "none" }, { timeoutMs: 1000, maxRetries: 0 }))
      .rejects.toThrow(/认证失败/);
  });
});

describe("downloadToBytes", () => {
  it("downloads bytes and content type", async () => {
    const buf = new Uint8Array([1, 2, 3]);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(buf, { status: 200, headers: { "content-type": "image/png" } })
    ));
    const { bytes, mime } = await downloadToBytes("https://img/x.png", { timeoutMs: 1000, maxRetries: 0 });
    expect(Array.from(bytes)).toEqual([1, 2, 3]);
    expect(mime).toBe("image/png");
  });

  it("retries transient download failures", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("temporary", { status: 502 }))
      .mockResolvedValueOnce(new Response(new Uint8Array([7]), { status: 200, headers: { "content-type": "image/webp" } }));
    vi.stubGlobal("fetch", fetchMock);
    const { bytes, mime } = await downloadToBytes("https://img/x.webp", { timeoutMs: 1000, maxRetries: 1 });
    expect(Array.from(bytes)).toEqual([7]);
    expect(mime).toBe("image/webp");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: 运行验证失败**

Run: `npx vitest run test/http.test.ts`
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 写实现 src/http.ts**

```ts
import type { AuthConfig, HttpRequestSpec } from "./adapters/types";
import { ProviderError, friendlyHttpError } from "./errors";

function buildUrl(spec: HttpRequestSpec, auth: AuthConfig): string {
  const url = new URL(spec.url);
  for (const [k, v] of Object.entries(spec.query ?? {})) url.searchParams.set(k, v);
  if (auth.style === "query" && auth.apiKey && auth.queryName) {
    url.searchParams.set(auth.queryName, auth.apiKey);
  }
  return url.toString();
}

function buildHeaders(spec: HttpRequestSpec, auth: AuthConfig): Record<string, string> {
  const headers: Record<string, string> = { ...spec.headers };
  const isForm = typeof FormData !== "undefined" && spec.body instanceof FormData;
  if (!isForm && !headers["Content-Type"] && !headers["content-type"]) {
    headers["Content-Type"] = "application/json";
  }
  if (auth.apiKey) {
    if (auth.style === "bearer") headers["Authorization"] = `Bearer ${auth.apiKey}`;
    else if (auth.style === "header" && auth.headerName) headers[auth.headerName] = auth.apiKey;
  }
  return headers;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function sendRequest(
  spec: HttpRequestSpec,
  auth: AuthConfig,
  opts: { timeoutMs: number; maxRetries: number },
): Promise<unknown> {
  const url = buildUrl(spec, auth);
  const headers = buildHeaders(spec, auth);
  const isForm = typeof FormData !== "undefined" && spec.body instanceof FormData;
  const body = isForm ? (spec.body as FormData) : JSON.stringify(spec.body);

  let lastErr: unknown;
  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), opts.timeoutMs);
    try {
      const res = await fetch(url, { method: spec.method, headers, body, signal: controller.signal });
      clearTimeout(timer);
      if (res.ok) return await res.json();
      const text = await res.text();
      if ((res.status === 429 || res.status >= 500) && attempt < opts.maxRetries) {
        await sleep(2 ** attempt * 500);
        continue;
      }
      throw new ProviderError(friendlyHttpError(res.status, text), res.status);
    } catch (e) {
      clearTimeout(timer);
      if (e instanceof ProviderError) throw e;
      lastErr = e;
      if (attempt < opts.maxRetries) {
        await sleep(2 ** attempt * 500);
        continue;
      }
    }
  }
  throw new ProviderError(`请求失败：${lastErr instanceof Error ? lastErr.message : String(lastErr)}`);
}

export async function downloadToBytes(
  url: string,
  opts: { timeoutMs: number; maxRetries: number },
): Promise<{ bytes: Uint8Array; mime: string }> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), opts.timeoutMs);
    try {
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);
      if (res.ok) {
        const buf = new Uint8Array(await res.arrayBuffer());
        const mime = res.headers.get("content-type") ?? "image/png";
        return { bytes: buf, mime };
      }
      if ((res.status === 429 || res.status >= 500) && attempt < opts.maxRetries) {
        await sleep(2 ** attempt * 500);
        continue;
      }
      throw new ProviderError(`下载图像失败 (HTTP ${res.status})`, res.status);
    } catch (e) {
      clearTimeout(timer);
      if (e instanceof ProviderError) throw e;
      lastErr = e;
      if (attempt < opts.maxRetries) {
        await sleep(2 ** attempt * 500);
        continue;
      }
    }
  }
  throw new ProviderError(`下载图像失败：${lastErr instanceof Error ? lastErr.message : String(lastErr)}`);
}
```

- [ ] **Step 4: 运行验证通过**

Run: `npx vitest run test/http.test.ts`
Expected: PASS（全部用例）。

- [ ] **Step 5: 提交**

Run: `npm run typecheck && git add -A && git commit -m "feat: add http layer with auth injection, retries, and image download"`

---

### Task 5: 输入图解析 input.ts

**Files:**
- Create: `src/input.ts`
- Test: `test/input.test.ts`

**Interfaces:**
- Consumes: `ResolvedImage`（Task 2）；`downloadToBytes`（Task 4）；`ConfigError`（Task 2）。
- Produces: `resolveImage(ref: string, timeoutMs: number): Promise<ResolvedImage>` —— 支持本地路径 / data URL / 裸 base64 / http(s) URL，并嗅探 mime。

- [ ] **Step 1: 写失败测试 test/input.test.ts**

```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { resolveImage } from "../src/input";
import { writeFile, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

afterEach(() => vi.unstubAllGlobals());

// 1x1 透明 PNG
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
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(Buffer.from(PNG_B64, "base64"), { status: 200, headers: { "content-type": "image/png" } })
    ));
    const img = await resolveImage("https://x/img.png", 1000);
    expect(img.mime).toBe("image/png");
  });
});
```

- [ ] **Step 2: 运行验证失败**

Run: `npx vitest run test/input.test.ts`
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 写实现 src/input.ts**

```ts
import { readFile } from "node:fs/promises";
import type { ResolvedImage } from "./adapters/types";
import { downloadToBytes } from "./http";
import { ConfigError } from "./errors";

function sniffMime(bytes: Uint8Array): string {
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return "image/png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return "image/jpeg";
  if (bytes[0] === 0x47 && bytes[1] === 0x49) return "image/gif";
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[8] === 0x57) return "image/webp";
  return "application/octet-stream";
}

const DATA_URL_RE = /^data:([^;]+);base64,(.+)$/s;

export async function resolveImage(ref: string, timeoutMs: number): Promise<ResolvedImage> {
  const dataMatch = ref.match(DATA_URL_RE);
  if (dataMatch) {
    const bytes = new Uint8Array(Buffer.from(dataMatch[2], "base64"));
    return { bytes, mime: dataMatch[1] };
  }
  if (/^https?:\/\//.test(ref)) {
    return downloadToBytes(ref, { timeoutMs, maxRetries: 0 });
  }
  // 裸 base64：仅含 base64 字符且长度可被 4 整除（粗判）
  if (/^[A-Za-z0-9+/=\s]+$/.test(ref) && ref.replace(/\s/g, "").length % 4 === 0 && ref.length > 16) {
    const bytes = new Uint8Array(Buffer.from(ref.replace(/\s/g, ""), "base64"));
    if (bytes.length > 0) return { bytes, mime: sniffMime(bytes) };
  }
  try {
    const buf = await readFile(ref);
    const bytes = new Uint8Array(buf);
    return { bytes, mime: sniffMime(bytes) };
  } catch {
    throw new ConfigError(`无法解析输入图：${ref}（既非 data URL / http URL / base64，也非可读文件）`);
  }
}
```

- [ ] **Step 4: 运行验证通过**

Run: `npx vitest run test/input.test.ts`
Expected: PASS（4 个用例）。

- [ ] **Step 5: 提交**

Run: `npm run typecheck && git add -A && git commit -m "feat: add input image resolver (path/dataURL/base64/url)"`

---

### Task 6: OpenAI 适配器

**Files:**
- Create: `src/adapters/openai.ts`
- Test: `test/adapters/openai.test.ts`

**Interfaces:**
- Consumes: `ImageAdapter`、`NormReq`、`ResolvedImage`、`HttpRequestSpec`、`NormImage`（Task 2）；`zod`。
- Produces: `export const openaiAdapter: ImageAdapter`。
  - `buildGenerate` → `POST {base}/images/generations`，JSON body `{ ...params, model, prompt, size?, n }`。
  - `buildEdit` → `POST {base}/images/edits`，FormData（单图字段 `image`，多图 `image[]`，含 `mask?`、`prompt`、`model`、`n`、`size?` 及 params）。
  - `parseResponse` 读取 `data[*].b64_json`(→b64) 或 `data[*].url`(→url)。
  - `extraParams`：`quality/background/thinking/seed/output_format/output_compression/moderation/user`（宽松类型）。
  - **不**主动发送 `response_format`（gpt-image 系列会拒），靠 parseResponse 兼容两种返回。

- [ ] **Step 1: 写失败测试 test/adapters/openai.test.ts**

```ts
import { describe, it, expect } from "vitest";
import { openaiAdapter } from "../../src/adapters/openai";
import type { NormReq } from "../../src/adapters/types";

const req: NormReq = { prompt: "a cat", model: "gpt-image-2", size: "1024x1024", n: 2, params: { background: "transparent" } };

describe("openaiAdapter.buildGenerate", () => {
  it("builds a JSON POST to /images/generations", () => {
    const spec = openaiAdapter.buildGenerate({ ...req, url: undefined } as any);
    // url 由 server 拼好后覆盖；此处用 base 直接测 path 拼接
  });
  it("includes core fields and params in the body", () => {
    const spec = openaiAdapter.buildGenerate(req);
    expect(spec.method).toBe("POST");
    expect(spec.url).toContain("/images/generations");
    const body = spec.body as Record<string, unknown>;
    expect(body.model).toBe("gpt-image-2");
    expect(body.prompt).toBe("a cat");
    expect(body.size).toBe("1024x1024");
    expect(body.n).toBe(2);
    expect(body.background).toBe("transparent");
    expect("response_format" in body).toBe(false);
  });
});

describe("openaiAdapter.buildEdit", () => {
  it("builds multipart with image field and prompt", () => {
    const images = [{ bytes: new Uint8Array([1]), mime: "image/png" }];
    const spec = openaiAdapter.buildEdit(req, images);
    expect(spec.url).toContain("/images/edits");
    expect(spec.body instanceof FormData).toBe(true);
    const fd = spec.body as FormData;
    expect(fd.get("prompt")).toBe("a cat");
    expect(fd.get("model")).toBe("gpt-image-2");
    expect(fd.get("image")).toBeInstanceOf(Blob);
  });
  it("uses image[] for multiple images", () => {
    const images = [
      { bytes: new Uint8Array([1]), mime: "image/png" },
      { bytes: new Uint8Array([2]), mime: "image/png" },
    ];
    const fd = openaiAdapter.buildEdit(req, images).body as FormData;
    expect(fd.getAll("image[]").length).toBe(2);
  });
});

describe("openaiAdapter.parseResponse", () => {
  it("parses b64_json", () => {
    expect(openaiAdapter.parseResponse({ data: [{ b64_json: "AAAA" }] }))
      .toEqual([{ kind: "b64", data: "AAAA" }]);
  });
  it("parses url", () => {
    expect(openaiAdapter.parseResponse({ data: [{ url: "https://img/x" }] }))
      .toEqual([{ kind: "url", data: "https://img/x" }]);
  });
});
```

> 注：第一个占位用例可删除；保留第二个起的真实断言。`buildGenerate` 的 `url` 由适配器用 `base + path` 拼出，`base` 在 `NormReq` 中没有——见实现：适配器从注入的 `this`/闭包拿 base。**实现采用工厂函数** `createOpenAiAdapter(baseUrl)`，由 server 传入 base。修订接口见 Step 3。

- [ ] **Step 2: 调整接口为工厂函数并写实现 src/adapters/openai.ts**

> 适配器需要 `baseUrl` 才能拼 URL。统一约定：每个内置适配器导出一个**工厂** `create<X>Adapter(baseUrl: string): ImageAdapter`。`registry` 在拿到 `baseUrl` 后创建实例。更新 Task 2 的心智模型：`ImageAdapter` 实例绑定 baseUrl；`defaultBaseUrl`/`defaultAuth`/`format`/`extraParams`/`supportsEdit` 作为**工厂的静态元信息**单独导出。

```ts
import { z } from "zod";
import type { ImageAdapter, NormReq, NormImage, ResolvedImage, AuthDefaults } from "./types";

export const OPENAI_META = {
  format: "openai",
  defaultBaseUrl: "https://api.openai.com/v1",
  defaultAuth: { style: "bearer" } as AuthDefaults,
  supportsEdit: true,
  extraParams: {
    quality: z.string().optional().describe("standard/high (gpt-image-2); low/medium/high/auto (gpt-image-1); standard/hd (dall-e-3)"),
    background: z.string().optional().describe("auto | transparent | opaque（透明背景）"),
    thinking: z.string().optional().describe("off | low | medium | high"),
    seed: z.number().int().optional().describe("int32，部分可复现"),
    output_format: z.string().optional().describe("png | jpeg | webp（透明需 png/webp）"),
    output_compression: z.number().int().optional().describe("0-100，jpeg/webp 压缩"),
    moderation: z.string().optional().describe("auto | low"),
    user: z.string().optional().describe("滥用检测标识"),
  },
};

function parseResponse(raw: unknown): NormImage[] {
  const data = (raw as any)?.data;
  if (!Array.isArray(data)) return [];
  return data.map((d: any): NormImage =>
    d.b64_json ? { kind: "b64", data: d.b64_json } : { kind: "url", data: d.url }
  );
}

export function createOpenAiAdapter(baseUrl: string): ImageAdapter {
  return {
    ...OPENAI_META,
    buildGenerate(req: NormReq) {
      const body: Record<string, unknown> = {
        ...req.params,
        model: req.model,
        prompt: req.prompt,
        n: req.n,
      };
      if (req.size) body.size = req.size;
      return { method: "POST", url: `${baseUrl}/images/generations`, headers: {}, body };
    },
    buildEdit(req: NormReq, images: ResolvedImage[], mask?: ResolvedImage) {
      const fd = new FormData();
      fd.set("prompt", req.prompt);
      fd.set("model", req.model);
      fd.set("n", String(req.n));
      if (req.size) fd.set("size", req.size);
      for (const [k, v] of Object.entries(req.params)) fd.set(k, String(v));
      const field = images.length > 1 ? "image[]" : "image";
      for (const img of images) {
        fd.append(field, new Blob([img.bytes], { type: img.mime }), "image.png");
      }
      if (mask) fd.set("mask", new Blob([mask.bytes], { type: mask.mime }), "mask.png");
      return { method: "POST", url: `${baseUrl}/images/edits`, headers: {}, body: fd };
    },
    parseResponse,
  };
}
```

> 同步修订测试：把 `openaiAdapter` 改为 `createOpenAiAdapter("https://api.openai.com/v1")` 取得实例；删除占位用例。

修订后的测试头部：
```ts
import { createOpenAiAdapter } from "../../src/adapters/openai";
const openaiAdapter = createOpenAiAdapter("https://api.openai.com/v1");
```

- [ ] **Step 3: 运行验证通过**

Run: `npx vitest run test/adapters/openai.test.ts`
Expected: PASS。

- [ ] **Step 4: 提交**

Run: `npm run typecheck && git add -A && git commit -m "feat: add openai adapter (generate JSON, edit multipart, rich params)"`

---

### Task 7: Gemini 适配器

**Files:**
- Create: `src/adapters/gemini.ts`
- Test: `test/adapters/gemini.test.ts`

**Interfaces:**
- Produces: `createGeminiAdapter(baseUrl: string): ImageAdapter` + `GEMINI_META`。
  - `buildGenerate` → `POST {base}/models/{model}:generateContent`，body `{ contents: [{ parts: [{ text: prompt }] }] }`；`size` 暂作 `aspect_ratio` 透传到 `generationConfig.imageConfig.aspectRatio`（占位，见实现注记）。
  - `buildEdit` → 同端点，`parts` 追加 `{ inline_data: { mime_type, data } }`。
  - `parseResponse` 读取 `candidates[0].content.parts[*].inline_data.data` → b64。
  - `defaultAuth: { style: "header", headerName: "x-goog-api-key" }`。
  - `extraParams: {}`（Gemini 暂不预设扩展参数；额外字段经 `IMAGEN_EXTRA_BODY`）。

> **实现注记（必做）**：在写本任务前，按仓库 AGENTS 指令用 `mmx-cli` 检索/核对 Google Gemini 官方文档中 `generateContent` 图像输出的确切字段（`responseModalities`、`inline_data` vs `inlineData` 命名）。本计划按当前已知形态给出可编译实现与测试；若官方字段不同，仅需在 `buildGenerate`/`parseResponse` 内调整键名，测试同步更新。下方解析同时兼容 `inline_data` 与 `inlineData` 两种命名以降低风险。

- [ ] **Step 1: 写失败测试 test/adapters/gemini.test.ts**

```ts
import { describe, it, expect } from "vitest";
import { createGeminiAdapter } from "../../src/adapters/gemini";
import type { NormReq } from "../../src/adapters/types";

const adapter = createGeminiAdapter("https://gl/v1beta");
const req: NormReq = { prompt: "a dog", model: "gemini-2.5-flash-image", n: 1, params: {} };

describe("geminiAdapter.buildGenerate", () => {
  it("posts to generateContent with the prompt in parts", () => {
    const spec = adapter.buildGenerate(req);
    expect(spec.url).toBe("https://gl/v1beta/models/gemini-2.5-flash-image:generateContent");
    const body = spec.body as any;
    expect(body.contents[0].parts[0].text).toBe("a dog");
  });
});

describe("geminiAdapter.parseResponse", () => {
  it("parses inline_data base64 (snake_case)", () => {
    const raw = { candidates: [{ content: { parts: [{ inline_data: { mime_type: "image/png", data: "AAAA" } }] } }] };
    expect(adapter.parseResponse(raw)).toEqual([{ kind: "b64", data: "AAAA", mime: "image/png" }]);
  });
  it("parses inlineData base64 (camelCase)", () => {
    const raw = { candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/png", data: "BBBB" } }] } }] };
    expect(adapter.parseResponse(raw)).toEqual([{ kind: "b64", data: "BBBB", mime: "image/png" }]);
  });
});

describe("geminiAdapter.buildEdit", () => {
  it("appends an inline_data image part", () => {
    const spec = adapter.buildEdit(req, [{ bytes: new Uint8Array([1, 2]), mime: "image/png" }]);
    const body = spec.body as any;
    const parts = body.contents[0].parts;
    expect(parts.some((p: any) => p.inline_data)).toBe(true);
  });
});
```

- [ ] **Step 2: 运行验证失败**

Run: `npx vitest run test/adapters/gemini.test.ts`
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 写实现 src/adapters/gemini.ts**

```ts
import type { ImageAdapter, NormReq, NormImage, ResolvedImage, AuthDefaults } from "./types";

export const GEMINI_META = {
  format: "gemini",
  defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta",
  defaultAuth: { style: "header", headerName: "x-goog-api-key" } as AuthDefaults,
  supportsEdit: true,
  extraParams: {},
};

function bytesToB64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

function parseResponse(raw: unknown): NormImage[] {
  const parts = (raw as any)?.candidates?.[0]?.content?.parts ?? [];
  const out: NormImage[] = [];
  for (const p of parts) {
    const inline = p.inline_data ?? p.inlineData;
    if (inline?.data) {
      out.push({ kind: "b64", data: inline.data, mime: inline.mime_type ?? inline.mimeType ?? "image/png" });
    }
  }
  return out;
}

export function createGeminiAdapter(baseUrl: string): ImageAdapter {
  return {
    ...GEMINI_META,
    buildGenerate(req: NormReq) {
      const body: Record<string, unknown> = {
        contents: [{ parts: [{ text: req.prompt }] }],
        ...req.params,
      };
      if (req.size) {
        (body as any).generationConfig = { imageConfig: { aspectRatio: req.size } };
      }
      return { method: "POST", url: `${baseUrl}/models/${req.model}:generateContent`, headers: {}, body };
    },
    buildEdit(req: NormReq, images: ResolvedImage[], _mask?: ResolvedImage) {
      const parts: unknown[] = [{ text: req.prompt }];
      for (const img of images) {
        parts.push({ inline_data: { mime_type: img.mime, data: bytesToB64(img.bytes) } });
      }
      const body: Record<string, unknown> = { contents: [{ parts }], ...req.params };
      return { method: "POST", url: `${baseUrl}/models/${req.model}:generateContent`, headers: {}, body };
    },
    parseResponse,
  };
}
```

- [ ] **Step 4: 运行验证通过**

Run: `npx vitest run test/adapters/gemini.test.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

Run: `npm run typecheck && git add -A && git commit -m "feat: add gemini adapter (generateContent, inline_data parse)"`

---

### Task 8: custom 适配器 + 响应路径解析器

**Files:**
- Create: `src/adapters/jsonpath.ts`
- Create: `src/adapters/custom.ts`
- Test: `test/adapters/jsonpath.test.ts`
- Test: `test/adapters/custom.test.ts`

**Interfaces:**
- Produces:
  - `extractPath(obj: unknown, path: string): unknown[]` —— 支持 `a.b[0].c` 与 `[*]` 通配，返回扁平结果数组。
  - `createCustomAdapter(baseUrl: string, custom: RawConfig["custom"]): ImageAdapter`。
  - `custom.encoding === "json"` 时 body 为 JSON 对象；`custom.encoding === "multipart"` 时 body 为 `FormData`，模板渲染出的字段与 `req.params` 均写入 multipart 字段。

- [ ] **Step 1: 写失败测试 test/adapters/jsonpath.test.ts**

```ts
import { describe, it, expect } from "vitest";
import { extractPath } from "../../src/adapters/jsonpath";

describe("extractPath", () => {
  it("reads nested fields with array index", () => {
    expect(extractPath({ a: { b: [{ c: 1 }, { c: 2 }] } }, "a.b[0].c")).toEqual([1]);
  });
  it("expands [*] wildcard", () => {
    expect(extractPath({ data: [{ url: "x" }, { url: "y" }] }, "data[*].url")).toEqual(["x", "y"]);
  });
  it("returns empty for missing path", () => {
    expect(extractPath({}, "a.b.c")).toEqual([]);
  });
});
```

- [ ] **Step 2: 运行验证失败 → 写 src/adapters/jsonpath.ts**

Run: `npx vitest run test/adapters/jsonpath.test.ts` → FAIL。

```ts
// 支持形如 a.b[0].c 与 data[*].url 的取值；[*] 展开为多结果
export function extractPath(obj: unknown, path: string): unknown[] {
  const tokens = path.replace(/\[(\d+|\*)\]/g, ".$1").split(".").filter(Boolean);
  let current: unknown[] = [obj];
  for (const tok of tokens) {
    const next: unknown[] = [];
    for (const node of current) {
      if (node == null) continue;
      if (tok === "*") {
        if (Array.isArray(node)) next.push(...node);
      } else if (/^\d+$/.test(tok)) {
        if (Array.isArray(node)) {
          const v = node[Number(tok)];
          if (v !== undefined) next.push(v);
        }
      } else {
        const v = (node as Record<string, unknown>)[tok];
        if (v !== undefined) next.push(v);
      }
    }
    current = next;
  }
  return current;
}
```

Run: `npx vitest run test/adapters/jsonpath.test.ts` → PASS。

- [ ] **Step 3: 写失败测试 test/adapters/custom.test.ts**

```ts
import { describe, it, expect } from "vitest";
import { createCustomAdapter } from "../../src/adapters/custom";
import type { NormReq } from "../../src/adapters/types";

const custom = {
  generatePath: "/t2i",
  encoding: "json" as const,
  bodyTemplate: '{"model":"{{model}}","prompt":"{{prompt}}","num":{{n}}}',
  responseImagesPath: "output.images[*]",
  responseImageKind: "url" as const,
};
const adapter = createCustomAdapter("https://api.x", custom);
const req: NormReq = { prompt: "hi", model: "m1", n: 3, params: {} };

describe("createCustomAdapter.buildGenerate", () => {
  it("renders the body template", () => {
    const spec = adapter.buildGenerate(req);
    expect(spec.url).toBe("https://api.x/t2i");
    expect(spec.body).toEqual({ model: "m1", prompt: "hi", num: 3 });
  });

  it("supports multipart encoding", () => {
    const mp = createCustomAdapter("https://api.x", { ...custom, encoding: "multipart" });
    const spec = mp.buildGenerate({ ...req, params: { style: "vivid" } });
    expect(spec.body).toBeInstanceOf(FormData);
    const fd = spec.body as FormData;
    expect(fd.get("model")).toBe("m1");
    expect(fd.get("prompt")).toBe("hi");
    expect(fd.get("num")).toBe("3");
    expect(fd.get("style")).toBe("vivid");
  });
});

describe("createCustomAdapter.parseResponse", () => {
  it("extracts urls via the configured path", () => {
    const raw = { output: { images: ["https://a", "https://b"] } };
    expect(adapter.parseResponse(raw)).toEqual([
      { kind: "url", data: "https://a" },
      { kind: "url", data: "https://b" },
    ]);
  });
});
```

- [ ] **Step 4: 运行验证失败 → 写 src/adapters/custom.ts**

Run: `npx vitest run test/adapters/custom.test.ts` → FAIL。

```ts
import type { ImageAdapter, NormReq, NormImage, ResolvedImage, AuthDefaults } from "./types";
import type { RawConfig } from "../config";
import { ConfigError } from "../errors";
import { extractPath } from "./jsonpath";

export const CUSTOM_META = {
  format: "custom",
  defaultAuth: { style: "bearer" } as AuthDefaults,
  extraParams: {},
};

function render(template: string, req: NormReq): Record<string, unknown> {
  const filled = template
    .replace(/\{\{prompt\}\}/g, req.prompt)
    .replace(/\{\{model\}\}/g, req.model)
    .replace(/\{\{size\}\}/g, req.size ?? "")
    .replace(/\{\{n\}\}/g, String(req.n));
  try {
    return JSON.parse(filled);
  } catch (e) {
    throw new ConfigError(`渲染 IMAGEN_CUSTOM_BODY_TEMPLATE 后不是合法 JSON：${(e as Error).message}`);
  }
}

function appendFormValue(fd: FormData, key: string, value: unknown): void {
  if (value === undefined || value === null) return;
  if (value instanceof Blob) {
    fd.set(key, value);
    return;
  }
  fd.set(key, typeof value === "object" ? JSON.stringify(value) : String(value));
}

function encodeBody(
  encoding: "json" | "multipart",
  fields: Record<string, unknown>,
  params: Record<string, unknown>,
): Record<string, unknown> | FormData {
  const merged = { ...fields, ...params };
  if (encoding === "json") return merged;
  const fd = new FormData();
  for (const [k, v] of Object.entries(merged)) appendFormValue(fd, k, v);
  return fd;
}

export function createCustomAdapter(baseUrl: string, custom: RawConfig["custom"]): ImageAdapter {
  const kind = custom.responseImageKind ?? "url";
  return {
    ...CUSTOM_META,
    supportsEdit: Boolean(custom.editPath),
    defaultBaseUrl: undefined,
    buildGenerate(req: NormReq) {
      if (!custom.generatePath) throw new ConfigError("custom 格式缺少 IMAGEN_CUSTOM_GENERATE_PATH");
      if (!custom.bodyTemplate) throw new ConfigError("custom 格式缺少 IMAGEN_CUSTOM_BODY_TEMPLATE");
      const body = encodeBody(custom.encoding, render(custom.bodyTemplate, req), req.params);
      return { method: "POST", url: `${baseUrl}${custom.generatePath}`, headers: {}, body };
    },
    buildEdit(req: NormReq, images: ResolvedImage[], _mask?: ResolvedImage) {
      if (!custom.editPath) throw new ConfigError("custom 格式未配置 IMAGEN_CUSTOM_EDIT_PATH，不支持 edit");
      if (!custom.bodyTemplate) throw new ConfigError("custom 格式缺少 IMAGEN_CUSTOM_BODY_TEMPLATE");
      const b64 = Buffer.from(images[0]?.bytes ?? new Uint8Array()).toString("base64");
      const tpl = custom.bodyTemplate.replace(/\{\{image\}\}/g, b64);
      const body = encodeBody(custom.encoding, render(tpl, req), req.params);
      return { method: "POST", url: `${baseUrl}${custom.editPath}`, headers: {}, body };
    },
    parseResponse(raw: unknown): NormImage[] {
      if (!custom.responseImagesPath) throw new ConfigError("custom 格式缺少 IMAGEN_CUSTOM_RESPONSE_IMAGES_PATH");
      const values = extractPath(raw, custom.responseImagesPath);
      return values
        .filter((v): v is string => typeof v === "string")
        .map((v) => {
          if (kind === "url") return { kind: "url", data: v } as NormImage;
          if (kind === "dataurl") {
            const m = v.match(/^data:[^;]+;base64,(.+)$/s);
            return { kind: "b64", data: m ? m[1] : v } as NormImage;
          }
          return { kind: "b64", data: v } as NormImage;
        });
    },
  };
}
```

> 注：`render` 内 `{{image}}` 在 edit 时先替换再 JSON.parse；模板里 `{{image}}` 须置于字符串位置（如 `"image":"{{image}}"`）。`buildGenerate` 不替换 `{{image}}`。

Run: `npx vitest run test/adapters/custom.test.ts` → PASS。

- [ ] **Step 5: 提交**

Run: `npm run typecheck && git add -A && git commit -m "feat: add custom data-driven adapter and jsonpath extractor"`

---

### Task 9: 覆盖层 overrides.ts

**Files:**
- Create: `src/adapters/overrides.ts`
- Test: `test/adapters/overrides.test.ts`

**Interfaces:**
- Consumes: `HttpRequestSpec`（Task 2）。
- Produces: `applyOverrides(spec: HttpRequestSpec, extra: { headers: Record<string,string>; query: Record<string,string> }): HttpRequestSpec` —— 把 extra headers/query 浅合并进 spec（body 的 extra_body 已在 server 经 `params` 注入，故此处只管头/query）。

- [ ] **Step 1: 写失败测试 test/adapters/overrides.test.ts**

```ts
import { describe, it, expect } from "vitest";
import { applyOverrides } from "../../src/adapters/overrides";
import type { HttpRequestSpec } from "../../src/adapters/types";

describe("applyOverrides", () => {
  it("merges extra headers and query", () => {
    const spec: HttpRequestSpec = { method: "POST", url: "u", headers: { A: "1" }, body: {}, query: { q: "0" } };
    const out = applyOverrides(spec, { headers: { B: "2" }, query: { r: "9" } });
    expect(out.headers).toEqual({ A: "1", B: "2" });
    expect(out.query).toEqual({ q: "0", r: "9" });
  });
});
```

- [ ] **Step 2: 运行失败 → 写 src/adapters/overrides.ts**

Run: `npx vitest run test/adapters/overrides.test.ts` → FAIL。

```ts
import type { HttpRequestSpec } from "./types";

export function applyOverrides(
  spec: HttpRequestSpec,
  extra: { headers: Record<string, string>; query: Record<string, string> },
): HttpRequestSpec {
  return {
    ...spec,
    headers: { ...spec.headers, ...extra.headers },
    query: { ...(spec.query ?? {}), ...extra.query },
  };
}
```

Run: `npx vitest run test/adapters/overrides.test.ts` → PASS。

- [ ] **Step 3: 提交**

Run: `npm run typecheck && git add -A && git commit -m "feat: add overrides layer for extra headers/query"`

---

### Task 10: 输出与落盘 output.ts

**Files:**
- Create: `src/output.ts`
- Test: `test/output.test.ts`

**Interfaces:**
- Consumes: `NormImage`（Task 2）；`downloadToBytes`（Task 4）。
- Produces:
  - `extFromMime(mime: string): string`。
  - `mimeFromOutputFormat(format?: unknown): string | undefined`。
  - `materialize(images: NormImage[], opts: { timeoutMs: number; maxRetries: number; preferredOutputFormat?: unknown }): Promise<{ bytes: Uint8Array; mime: string }[]>`。
  - `saveImages(mats: {bytes:Uint8Array;mime:string}[], opts: { outputDir: string; outputPath?: string }): Promise<string[]>` —— 返回绝对路径数组；遵循设计文档 §8 命名规则。
  - `buildToolResult(paths: string[], mats: {bytes:Uint8Array;mime:string}[], meta: { model: string; size?: string; provider: string }, returnInline: boolean)` —— 返回 `{ content: [...], isError?: false }`。

- [ ] **Step 1: 写失败测试 test/output.test.ts**

```ts
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
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(new Uint8Array([9, 9]), { status: 200, headers: { "content-type": "image/png" } })
    ));
    const out = await materialize(
      [{ kind: "b64", data: Buffer.from([1, 2]).toString("base64"), mime: "image/png" }, { kind: "url", data: "https://i/x" }],
      { timeoutMs: 1000, maxRetries: 0 },
    );
    expect(Array.from(out[0].bytes)).toEqual([1, 2]);
    expect(Array.from(out[1].bytes)).toEqual([9, 9]);
  });

  it("uses output_format as the mime fallback for b64 images", async () => {
    const out = await materialize(
      [{ kind: "b64", data: Buffer.from([1, 2]).toString("base64") }],
      { timeoutMs: 1000, maxRetries: 0, preferredOutputFormat: "webp" },
    );
    expect(out[0].mime).toBe("image/webp");
  });
});

describe("saveImages", () => {
  it("writes files and returns absolute paths", async () => {
    const dir = await mkdtemp(join(tmpdir(), "imagen-out-"));
    const paths = await saveImages(
      [{ bytes: new Uint8Array([1]), mime: "image/png" }, { bytes: new Uint8Array([2]), mime: "image/png" }],
      { outputDir: dir },
    );
    expect(paths.length).toBe(2);
    expect((await readFile(paths[0])).length).toBe(1);
  });

  it("honors output_path file name with index suffix for n>1", async () => {
    const dir = await mkdtemp(join(tmpdir(), "imagen-out2-"));
    const paths = await saveImages(
      [{ bytes: new Uint8Array([1]), mime: "image/png" }, { bytes: new Uint8Array([2]), mime: "image/png" }],
      { outputDir: dir, outputPath: join(dir, "logo.png") },
    );
    expect(paths[0]).toContain("logo-0.png");
    expect(paths[1]).toContain("logo-1.png");
  });
});

describe("buildToolResult", () => {
  it("returns a text block with paths and no image block by default", () => {
    const res = buildToolResult(["/a/x.png"], [{ bytes: new Uint8Array([1]), mime: "image/png" }], { model: "m", provider: "openai" }, false);
    expect(res.content[0].type).toBe("text");
    expect(res.content.some((c: any) => c.type === "image")).toBe(false);
  });
  it("appends image blocks when returnInline is true", () => {
    const res = buildToolResult(["/a/x.png"], [{ bytes: new Uint8Array([1]), mime: "image/png" }], { model: "m", provider: "openai" }, true);
    const img = res.content.find((c: any) => c.type === "image") as any;
    expect(img.mimeType).toBe("image/png");
    expect(typeof img.data).toBe("string");
  });
});
```

- [ ] **Step 2: 运行验证失败**

Run: `npx vitest run test/output.test.ts`
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 写实现 src/output.ts**

```ts
import { mkdir, writeFile, stat } from "node:fs/promises";
import { dirname, join, resolve, extname, basename } from "node:path";
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
  for (const img of images) {
    if (img.kind === "b64") {
      out.push({ bytes: new Uint8Array(Buffer.from(img.data, "base64")), mime: img.mime ?? preferredMime ?? "image/png" });
    } else {
      out.push(await downloadToBytes(img.data, opts));
    }
  }
  return out;
}

async function isDir(p: string): Promise<boolean> {
  try { return (await stat(p)).isDirectory(); } catch { return false; }
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
    const op = resolve(opts.outputPath);
    if (opts.outputPath.endsWith("/") || opts.outputPath.endsWith("\\") || (await isDir(op))) {
      targetDir = op;
    } else {
      targetDir = dirname(op);
      baseName = basename(op);
    }
  }
  await mkdir(targetDir, { recursive: true });

  const stamp = Date.now();
  for (let i = 0; i < mats.length; i++) {
    const ext = extFromMime(mats[i].mime);
    let name: string;
    if (baseName) {
      if (multi) {
        const base = baseName.slice(0, baseName.length - extname(baseName).length);
        const e = extname(baseName) || `.${ext}`;
        name = `${base}-${i}${e}`;
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
    ...paths.map((p) => `- ${p}`),
  ];
  const content: any[] = [{ type: "text", text: lines.join("\n") }];
  if (returnInline) {
    for (const m of mats) {
      content.push({ type: "image", data: Buffer.from(m.bytes).toString("base64"), mimeType: m.mime });
    }
  }
  return { content, isError: false as const };
}
```

- [ ] **Step 4: 运行验证通过**

Run: `npx vitest run test/output.test.ts`
Expected: PASS（全部用例）。

- [ ] **Step 5: 提交**

Run: `npm run typecheck && git add -A && git commit -m "feat: add output layer (materialize, save with naming rules, tool result)"`

---

### Task 11: 注册表与 server.ts（装配 + 注册工具）

**Files:**
- Create: `src/adapters/registry.ts`
- Create: `src/server.ts`
- Test: `test/adapters/registry.test.ts`
- Test: `test/server.test.ts`

**Interfaces:**
- Consumes: 全部前述模块。
- Produces:
  - `createAdapter(raw: RawConfig): { adapter: ImageAdapter; baseUrl: string; auth: AuthConfig }` —— 据 `raw.format` 选工厂、解析 baseUrl/auth；未知 format 抛 `ConfigError`。
  - `buildServer(raw: RawConfig): McpServer` —— 注册 `generate_image`（始终）与 `edit_image`（`adapter.supportsEdit` 时），把核心参数与 `adapter.extraParams` 合并为 inputSchema，处理整条流水线。

- [ ] **Step 1: 写失败测试 test/adapters/registry.test.ts**

```ts
import { describe, it, expect } from "vitest";
import { createAdapter } from "../../src/adapters/registry";
import { loadRawConfig } from "../../src/config";

describe("createAdapter", () => {
  it("selects openai with default base url and bearer auth", () => {
    const { adapter, baseUrl, auth } = createAdapter(loadRawConfig({ IMAGEN_FORMAT: "openai", IMAGEN_API_KEY: "k" }));
    expect(adapter.format).toBe("openai");
    expect(baseUrl).toBe("https://api.openai.com/v1");
    expect(auth).toEqual({ style: "bearer", headerName: undefined, queryName: undefined, apiKey: "k" });
  });
  it("selects gemini with x-goog-api-key header auth", () => {
    const { auth } = createAdapter(loadRawConfig({ IMAGEN_FORMAT: "gemini", IMAGEN_API_KEY: "k" }));
    expect(auth.style).toBe("header");
    expect(auth.headerName).toBe("x-goog-api-key");
  });
  it("throws on unknown format", () => {
    expect(() => createAdapter(loadRawConfig({ IMAGEN_FORMAT: "nope" }))).toThrow(/format/);
  });
});
```

- [ ] **Step 2: 运行失败 → 写 src/adapters/registry.ts**

Run: `npx vitest run test/adapters/registry.test.ts` → FAIL。

```ts
import type { ImageAdapter, AuthConfig } from "./types";
import { type RawConfig, resolveBaseUrl, resolveAuth } from "../config";
import { ConfigError } from "../errors";
import { createOpenAiAdapter, OPENAI_META } from "./openai";
import { createGeminiAdapter, GEMINI_META } from "./gemini";
import { createCustomAdapter, CUSTOM_META } from "./custom";

export function createAdapter(raw: RawConfig): { adapter: ImageAdapter; baseUrl: string; auth: AuthConfig } {
  if (raw.format === "openai") {
    const baseUrl = resolveBaseUrl(raw, OPENAI_META.defaultBaseUrl);
    return { adapter: createOpenAiAdapter(baseUrl), baseUrl, auth: resolveAuth(raw, OPENAI_META.defaultAuth) };
  }
  if (raw.format === "gemini") {
    const baseUrl = resolveBaseUrl(raw, GEMINI_META.defaultBaseUrl);
    return { adapter: createGeminiAdapter(baseUrl), baseUrl, auth: resolveAuth(raw, GEMINI_META.defaultAuth) };
  }
  if (raw.format === "custom") {
    const baseUrl = resolveBaseUrl(raw, undefined);
    return { adapter: createCustomAdapter(baseUrl, raw.custom), baseUrl, auth: resolveAuth(raw, CUSTOM_META.defaultAuth) };
  }
  throw new ConfigError(`未知 IMAGEN_FORMAT "${raw.format}"，受支持：openai | gemini | custom`);
}
```

Run: `npx vitest run test/adapters/registry.test.ts` → PASS。

- [ ] **Step 3: 写失败测试 test/server.test.ts（用 in-memory transport 跑端到端）**

```ts
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
  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test", version: "0.0.0" });
  await Promise.all([server.connect(serverT), client.connect(clientT)]);
  return client;
}

describe("buildServer", () => {
  it("lists generate_image and edit_image for openai", async () => {
    const client = await connect(loadRawConfig({ IMAGEN_FORMAT: "openai", IMAGEN_API_KEY: "k", IMAGEN_MODEL: "gpt-image-2" }));
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name);
    expect(names).toContain("generate_image");
    expect(names).toContain("edit_image");
  });

  it("generate_image saves a file and returns its path", async () => {
    const dir = await mkdtemp(join(tmpdir(), "imagen-srv-"));
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString("base64");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: [{ b64_json: png }] }), { status: 200, headers: { "content-type": "application/json" } })
    ));
    const client = await connect(loadRawConfig({ IMAGEN_FORMAT: "openai", IMAGEN_API_KEY: "k", IMAGEN_MODEL: "gpt-image-2", IMAGEN_OUTPUT_DIR: dir }));
    const res: any = await client.callTool({ name: "generate_image", arguments: { prompt: "a cat", background: "transparent" } });
    expect(res.isError).toBeFalsy();
    const text = res.content.find((c: any) => c.type === "text").text as string;
    const match = text.match(/- (.+\.png)/);
    expect(match).toBeTruthy();
    expect((await readFile(match![1])).length).toBeGreaterThan(0);
  });

  it("uses output_format for b64 output extension", async () => {
    const dir = await mkdtemp(join(tmpdir(), "imagen-srv-webp-"));
    const b64 = Buffer.from([1, 2, 3]).toString("base64");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: [{ b64_json: b64 }] }), { status: 200, headers: { "content-type": "application/json" } })
    ));
    const client = await connect(loadRawConfig({ IMAGEN_FORMAT: "openai", IMAGEN_API_KEY: "k", IMAGEN_MODEL: "gpt-image-2", IMAGEN_OUTPUT_DIR: dir }));
    const res: any = await client.callTool({ name: "generate_image", arguments: { prompt: "a cat", output_format: "webp" } });
    const text = res.content.find((c: any) => c.type === "text").text as string;
    expect(text).toMatch(/\.webp/);
  });

  it("returns isError on provider failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("bad key", { status: 401 })));
    const client = await connect(loadRawConfig({ IMAGEN_FORMAT: "openai", IMAGEN_API_KEY: "k", IMAGEN_MODEL: "gpt-image-2" }));
    const res: any = await client.callTool({ name: "generate_image", arguments: { prompt: "x" } });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain("认证失败");
  });
});
```

- [ ] **Step 4: 运行失败 → 写 src/server.ts**

Run: `npx vitest run test/server.test.ts` → FAIL（模块不存在）。

```ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { RawConfig } from "./config";
import type { ImageAdapter, AuthConfig, NormReq } from "./adapters/types";
import { createAdapter } from "./adapters/registry";
import { applyOverrides } from "./adapters/overrides";
import { sendRequest } from "./http";
import { resolveImage } from "./input";
import { materialize, saveImages, buildToolResult } from "./output";
import { ProviderError, ConfigError, redactKey } from "./errors";

const coreShape = {
  prompt: z.string().describe("图像描述/编辑指令"),
  model: z.string().optional().describe("覆盖默认模型 IMAGEN_MODEL"),
  size: z.string().optional().describe('如 "1024x1024"；适配器自动映射'),
  n: z.number().int().optional().describe("生成张数，默认 1"),
  output_path: z.string().optional().describe("保存文件名或目录，覆盖默认输出目录"),
};

const CORE_KEYS = new Set(["prompt", "model", "size", "n", "output_path", "images", "mask"]);

function toNormReq(args: Record<string, unknown>, raw: RawConfig): NormReq {
  const model = (args.model as string) ?? raw.model;
  if (!model) throw new ConfigError("未提供 model，且未设置 IMAGEN_MODEL");
  const extras: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(args)) {
    if (!CORE_KEYS.has(k) && v !== undefined) extras[k] = v;
  }
  return {
    prompt: args.prompt as string,
    model,
    size: args.size as string | undefined,
    n: (args.n as number) ?? 1,
    params: { ...raw.extraBody, ...extras }, // per-call 扩展覆盖 env extra_body
  };
}

function errorResult(e: unknown, apiKey?: string) {
  const msg = e instanceof Error ? e.message : String(e);
  return { content: [{ type: "text" as const, text: redactKey(msg, apiKey) }], isError: true as const };
}

export function buildServer(raw: RawConfig): McpServer {
  const { adapter, baseUrl, auth } = createAdapter(raw);
  void baseUrl; // baseUrl 已注入 adapter
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
    async (args: Record<string, unknown>) => {
      try {
        const req = toNormReq(args, raw);
        const spec = applyOverrides(adapter.buildGenerate(req), overrides);
        const rawResp = await sendRequest(spec, auth, opts);
        const images = adapter.parseResponse(rawResp);
        if (images.length === 0) throw new ProviderError("Provider 未返回任何图像");
        const mats = await materialize(images, { ...opts, preferredOutputFormat: req.params.output_format });
        const paths = await saveImages(mats, { outputDir: raw.outputDir ?? defaultDir(), outputPath: args.output_path as string | undefined });
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
      async (args: Record<string, unknown>) => {
        try {
          const req = toNormReq(args, raw);
          const refs = (args.images as string[]) ?? [];
          if (refs.length === 0) throw new ConfigError("edit_image 需要至少一张 images");
          const images = await Promise.all(refs.map((r) => resolveImage(r, opts.timeoutMs)));
          const mask = args.mask ? await resolveImage(args.mask as string, opts.timeoutMs) : undefined;
          const spec = applyOverrides(adapter.buildEdit(req, images, mask), overrides);
          const rawResp = await sendRequest(spec, auth, opts);
          const out = adapter.parseResponse(rawResp);
          if (out.length === 0) throw new ProviderError("Provider 未返回任何图像");
          const mats = await materialize(out, { ...opts, preferredOutputFormat: req.params.output_format });
          const paths = await saveImages(mats, { outputDir: raw.outputDir ?? defaultDir(), outputPath: args.output_path as string | undefined });
          return buildToolResult(paths, mats, { model: req.model, size: req.size, provider: adapter.format }, raw.returnInline);
        } catch (e) {
          return errorResult(e, auth.apiKey);
        }
      },
    );
  }

  return server;
}

import { tmpdir } from "node:os";
import { join } from "node:path";
function defaultDir(): string {
  return join(tmpdir(), "imagen-switch");
}
```

> 注：`toNormReq` 把 `params` 合并为 `{...extraBody, ...perCallExtras}`；而核心字段（model/prompt/size/n）由适配器在 body 中显式置于 `params` 之后，确保 per-call 核心 > extra_body（见各适配器 buildGenerate）。

- [ ] **Step 5: 运行验证通过**

Run: `npx vitest run test/server.test.ts test/adapters/registry.test.ts`
Expected: PASS（全部用例）。

- [ ] **Step 6: 全量测试 + 提交**

Run: `npm test`
Expected: 所有测试通过。
Run: `git add -A && git commit -m "feat: wire registry and MCP server with generate_image/edit_image"`

---

### Task 12: 入口 index.ts、README 与最终构建

**Files:**
- Modify: `src/index.ts`（替换占位）
- Modify: `test/smoke.test.ts`（改为断言导出 `main` 存在，不实际连 stdio）
- Create: `README.md`

**Interfaces:**
- Consumes: `loadRawConfig`（Task 3）、`buildServer`（Task 11）。
- Produces: `main(): Promise<void>` 入口；脚本被直接执行时调用 `main()`。

- [ ] **Step 1: 改 test/smoke.test.ts**

```ts
import { describe, it, expect } from "vitest";
import { main } from "../src/index";

describe("entry", () => {
  it("exports a main function", () => {
    expect(typeof main).toBe("function");
  });
});
```

- [ ] **Step 2: 运行验证失败**

Run: `npx vitest run test/smoke.test.ts`
Expected: FAIL（`main` 未导出）。

- [ ] **Step 3: 写 src/index.ts**

```ts
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

// 直接执行时启动（被 import 时不启动，便于测试）
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    process.stderr.write(`[imagen-switch] fatal: ${e instanceof Error ? e.message : String(e)}\n`);
    process.exit(1);
  });
}
```

- [ ] **Step 4: 运行验证通过**

Run: `npx vitest run test/smoke.test.ts`
Expected: PASS。

- [ ] **Step 5: 写 README.md**

````markdown
# imagen-switch-mcp

通过环境变量为任意 MCP Agent 添加「文生图 + 图生图/编辑」能力，支持任意 Provider / 端点。

## 运行

```
npx -y imagen-switch-mcp
```

## 工具

- `generate_image(prompt, model?, size?, n?, output_path?, …format 专属参数)`
- `edit_image(prompt, images[], mask?, model?, size?, n?, output_path?, …)`

图像保存到 `IMAGEN_OUTPUT_DIR`（默认系统临时目录下 `imagen-switch/`），返回绝对路径；设 `IMAGEN_RETURN_INLINE=true` 可同时内联返回图像。

## 环境变量

见 `docs/superpowers/specs/2026-06-23-imagen-switch-mcp-design.md` 第 4 节完整表。核心：`IMAGEN_FORMAT`、`IMAGEN_BASE_URL`、`IMAGEN_API_KEY`、`IMAGEN_MODEL`。

## 配置示例（Claude Code）

OpenAI（gpt-image-2，透明背景）：
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
        "IMAGEN_MODEL": "gpt-image-2"
      }
    }
  }
}
```
调用：`generate_image(prompt="一只柴犬贴纸", background="transparent", output_format="png")`

OpenAI 兼容网关：
```json
{
  "mcpServers": {
    "imagen": {
      "command": "npx",
      "args": ["-y", "imagen-switch-mcp"],
      "env": {
        "IMAGEN_FORMAT": "openai",
        "IMAGEN_BASE_URL": "https://your-gateway.example/v1",
        "IMAGEN_API_KEY": "...",
        "IMAGEN_MODEL": "flux.1-schnell"
      }
    }
  }
}
```

Gemini：
```json
{
  "mcpServers": {
    "imagen": {
      "command": "npx",
      "args": ["-y", "imagen-switch-mcp"],
      "env": {
        "IMAGEN_FORMAT": "gemini",
        "IMAGEN_BASE_URL": "https://generativelanguage.googleapis.com/v1beta",
        "IMAGEN_API_KEY": "...",
        "IMAGEN_MODEL": "gemini-2.5-flash-image"
      }
    }
  }
}
```

custom（任意接口零代码适配）：
```json
{
  "env": {
    "IMAGEN_FORMAT": "custom",
    "IMAGEN_BASE_URL": "https://api.example.com",
    "IMAGEN_API_KEY": "...",
    "IMAGEN_CUSTOM_GENERATE_PATH": "/v1/text2image",
    "IMAGEN_CUSTOM_ENCODING": "json",
    "IMAGEN_CUSTOM_BODY_TEMPLATE": "{\"model\":\"{{model}}\",\"prompt\":\"{{prompt}}\",\"num\":{{n}}}",
    "IMAGEN_CUSTOM_RESPONSE_IMAGES_PATH": "output.images[*]",
    "IMAGEN_CUSTOM_RESPONSE_IMAGE_KIND": "url"
  }
}
```
````

- [ ] **Step 6: 全量测试 + 构建 + 手动冒烟**

Run: `npm test`
Expected: 全绿。
Run: `npm run build`
Expected: 生成 `dist/index.js`（首行 shebang）。
手动冒烟（PowerShell；无 key 也应能启动并报缺失，或用假配置启动后 Ctrl-C）：
Run: `$env:IMAGEN_FORMAT="openai"; $env:IMAGEN_API_KEY="test"; $env:IMAGEN_MODEL="gpt-image-2"; node dist/index.js`
Expected: stderr 打印 `[imagen-switch] started (format=openai)`；Ctrl-C 退出。

- [ ] **Step 7: 提交**

Run: `git add -A && git commit -m "feat: add stdio entry point, README, and finalize build"`

---

## 实现顺序与依赖

1 脚手架 → 2 类型+错误 → 3 config → 4 http → 5 input → 6 openai → 7 gemini → 8 custom+jsonpath → 9 overrides → 10 output → 11 registry+server → 12 入口+README。每个任务可独立测试并提交。

## 完成标准（Definition of Done）

- `npm test` 全绿；`npm run build` 产出可执行 `dist/index.js`。
- `generate_image` 与 `edit_image` 在 openai 格式下端到端可用（mock HTTP 验证落盘与返回）。
- gemini、custom 适配器单测通过（gemini 字段已对照官方文档核对）。
- 错误路径返回 `isError` 且 api_key 脱敏。
- README 含 openai / OpenAI 兼容网关 / gemini / custom 配置示例。
