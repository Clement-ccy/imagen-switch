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
