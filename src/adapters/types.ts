import type { ZodRawShape } from "zod";

export type AuthStyle = "bearer" | "header" | "query" | "none";
export type AuthDefaults = { style: AuthStyle; headerName?: string; queryName?: string };
export type AuthConfig = AuthDefaults & { apiKey?: string };

export type NormReq = {
  prompt: string;
  model: string;
  size?: string;
  n: number;
  params: Record<string, unknown>;
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
