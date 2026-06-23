# imagen-switch-mcp

通过环境变量为任意 MCP Agent 添加文生图与图生图/编辑能力，支持 OpenAI、Gemini、OpenAI 兼容网关，以及任意 custom Provider/端点。

## 运行

```bash
npx -y imagen-switch-mcp
```

## 工具

- `generate_image(prompt, model?, size?, n?, output_path?, ...format 专属参数)`
- `edit_image(prompt, images[], mask?, model?, size?, n?, output_path?, ...)`

图像默认保存到 `IMAGEN_OUTPUT_DIR`。未配置时会保存到系统临时目录下的 `imagen-switch/`，工具返回绝对路径。设置 `IMAGEN_RETURN_INLINE=true` 时会同时返回 MCP image 内容块。

## 环境变量

核心变量：

- `IMAGEN_FORMAT`: `openai`、`gemini` 或 `custom`，默认 `openai`
- `IMAGEN_BASE_URL`: Provider 基址，openai/gemini 有内置默认值
- `IMAGEN_API_KEY`: Provider 密钥
- `IMAGEN_MODEL`: 默认模型

更多变量见 [设计文档](docs/superpowers/specs/2026-06-23-imagen-switch-mcp-design.md) 第 4 节，包括认证方式、输出目录、超时重试、额外 headers/query/body 和 custom 模板。

## 配置示例

### OpenAI

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

调用示例：

```text
generate_image(prompt="一只柴犬贴纸", background="transparent", output_format="png")
```

### OpenAI 兼容网关

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

### Gemini

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

### custom

```json
{
  "mcpServers": {
    "imagen": {
      "command": "npx",
      "args": ["-y", "imagen-switch-mcp"],
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
  }
}
```

`IMAGEN_CUSTOM_ENCODING` 也可设为 `multipart`。配置 `IMAGEN_CUSTOM_EDIT_PATH` 后，custom 实例会注册 `edit_image`。
