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
  if (status === 401 || status === 403) {
    return `认证失败 (HTTP ${status})：请检查 IMAGEN_API_KEY / IMAGEN_AUTH_*。Provider 返回：${body}`;
  }
  if (status === 429) {
    return `触发限流 (HTTP 429)：请稍后重试或降低频率。Provider 返回：${body}`;
  }
  if (status === 400) {
    return `请求参数被拒 (HTTP 400)：${body}`;
  }
  return `Provider 返回错误 (HTTP ${status})：${body}`;
}
