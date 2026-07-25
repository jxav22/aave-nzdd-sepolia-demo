/**
 * The public v1 API, exposed to the chat agent as tools.
 *
 * Tools are derived from `buildOpenApiDocument()` rather than hand-written, so the agent
 * can only ever do what the documented API does, and a new endpoint becomes a new tool as
 * soon as it is described in the spec. Calls go out over HTTP against this same app, which
 * means the agent exercises the published contract, rate limits, envelope, validation
 * errors and all, instead of reaching past it into the service layer.
 *
 * Operations opt out with `x-agent-tool: false` (the chat endpoint itself, to avoid
 * recursion) and contribute a starter prompt with `x-agent-example`.
 */
import { buildOpenApiDocument } from "~~/services/api/openapi";

const DEFAULT_TIMEOUT_MS = 20_000;
const MAX_ARRAY_ITEMS = 8;
const MAX_STRING_LENGTH = 400;
const MAX_DEPTH = 6;

type JsonSchema = Record<string, unknown>;

type OpenApiParameter = {
  name: string;
  in: "query" | "path";
  required?: boolean;
  description?: string;
  schema?: JsonSchema;
};

type OpenApiOperation = {
  summary?: string;
  description?: string;
  operationId?: string;
  parameters?: OpenApiParameter[];
  requestBody?: { content?: Record<string, { schema?: JsonSchema }> };
  "x-agent-tool"?: boolean;
  "x-agent-example"?: string;
};

type OpenApiDocument = {
  paths: Record<string, Partial<Record<"get" | "post", OpenApiOperation>>>;
  components?: { schemas?: Record<string, JsonSchema> };
};

export type AgentTool = {
  /** OpenAPI `operationId`; also the function name the model calls. */
  name: string;
  method: "GET" | "POST";
  /** Path template, e.g. `/api/v1/position/{address}`. */
  path: string;
  description: string;
  example: string | null;
  parameters: JsonSchema;
  pathParams: string[];
  queryParams: string[];
  bodyProperties: string[];
};

export type AgentToolCall = {
  method: string;
  /** Path actually requested, including the query string. */
  path: string;
  status: number;
  ok: boolean;
  summary: string;
};

export type AgentToolResult = {
  call: AgentToolCall;
  /** What the model sees: the response envelope, trimmed to a sane size. */
  payload: unknown;
};

/** Inline `$ref`s so the model receives a self-contained JSON Schema. */
function resolveSchema(schema: JsonSchema | undefined, schemas: Record<string, JsonSchema>, depth = 0): JsonSchema {
  if (!schema || depth > MAX_DEPTH) {
    return {};
  }

  const ref = schema.$ref;
  if (typeof ref === "string") {
    const name = ref.replace("#/components/schemas/", "");
    return resolveSchema(schemas[name], schemas, depth + 1);
  }

  const resolved: JsonSchema = {};
  for (const [key, value] of Object.entries(schema)) {
    if (key === "properties" && value && typeof value === "object") {
      resolved.properties = Object.fromEntries(
        Object.entries(value as Record<string, JsonSchema>).map(([property, inner]) => [
          property,
          resolveSchema(inner, schemas, depth + 1),
        ]),
      );
    } else if (key === "items" && value && typeof value === "object") {
      resolved.items = resolveSchema(value as JsonSchema, schemas, depth + 1);
    } else {
      resolved[key] = value;
    }
  }
  return resolved;
}

function describe(operation: OpenApiOperation, method: string, path: string): string {
  const detail = (operation.description ?? "").split("\n\n")[0];
  return [`${method} ${path}`, operation.summary, detail].filter(Boolean).join(" Â· ");
}

function toolFromOperation(method: "GET" | "POST", path: string, operation: OpenApiOperation, doc: OpenApiDocument) {
  const schemas = doc.components?.schemas ?? {};
  const parameters = operation.parameters ?? [];
  const bodySchema = resolveSchema(operation.requestBody?.content?.["application/json"]?.schema, schemas);
  const bodyProperties = (bodySchema.properties ?? {}) as Record<string, JsonSchema>;

  const properties: Record<string, JsonSchema> = { ...bodyProperties };
  const required = new Set<string>(Array.isArray(bodySchema.required) ? (bodySchema.required as string[]) : []);

  for (const parameter of parameters) {
    properties[parameter.name] = {
      ...resolveSchema(parameter.schema, schemas),
      ...(parameter.description ? { description: parameter.description } : {}),
    };
    if (parameter.required) {
      required.add(parameter.name);
    }
  }

  const tool: AgentTool = {
    name: operation.operationId as string,
    method,
    path,
    description: describe(operation, method, path),
    example: operation["x-agent-example"] ?? null,
    parameters: {
      type: "object",
      properties,
      required: [...required],
      additionalProperties: false,
    },
    pathParams: parameters.filter(parameter => parameter.in === "path").map(parameter => parameter.name),
    queryParams: parameters.filter(parameter => parameter.in === "query").map(parameter => parameter.name),
    bodyProperties: Object.keys(bodyProperties),
  };

  return tool;
}

export function buildAgentTools(): AgentTool[] {
  // The origin only fills the spec's `servers` entry, which tool building ignores.
  const doc = buildOpenApiDocument("") as unknown as OpenApiDocument;
  const tools: AgentTool[] = [];

  for (const [path, operations] of Object.entries(doc.paths)) {
    for (const method of ["GET", "POST"] as const) {
      const operation = operations[method.toLowerCase() as "get" | "post"];
      if (!operation?.operationId || operation["x-agent-tool"] === false) {
        continue;
      }
      tools.push(toolFromOperation(method, path, operation, doc));
    }
  }

  return tools;
}

export function toOpenAiTools(tools: AgentTool[]) {
  return tools.map(tool => ({
    type: "function" as const,
    function: { name: tool.name, description: tool.description, parameters: tool.parameters },
  }));
}

/** Starter prompts for a conversation that has no context yet, one per documented example. */
export function starterPrompts(tools: AgentTool[], limit = 4): string[] {
  return tools
    .map(tool => tool.example)
    .filter((example): example is string => Boolean(example))
    .slice(0, limit);
}

export function findTool(tools: AgentTool[], name: string): AgentTool | undefined {
  return tools.find(tool => tool.name === name);
}

function buildPath(tool: AgentTool, args: Record<string, unknown>): string {
  let path = tool.path;

  for (const name of tool.pathParams) {
    const value = args[name];
    if (value === undefined || value === null || String(value).trim() === "") {
      throw new Error(`Missing required parameter "${name}".`);
    }
    path = path.replace(`{${name}}`, encodeURIComponent(String(value)));
  }

  const query = new URLSearchParams();
  for (const name of tool.queryParams) {
    const value = args[name];
    if (value === undefined || value === null || value === "") {
      continue;
    }
    query.set(name, String(value));
  }

  const search = query.toString();
  return search ? `${path}?${search}` : path;
}

/**
 * Trim a response before it reaches the model: whole reports are far larger than the part
 * an answer needs, and an untrimmed borrow-risk payload alone can dominate the context.
 */
function compact(value: unknown, depth = 0): unknown {
  if (typeof value === "string") {
    return value.length > MAX_STRING_LENGTH ? `${value.slice(0, MAX_STRING_LENGTH)}…` : value;
  }
  if (Array.isArray(value)) {
    if (depth >= MAX_DEPTH) {
      return `[${value.length} items]`;
    }
    const head = value.slice(0, MAX_ARRAY_ITEMS).map(item => compact(item, depth + 1));
    return value.length > MAX_ARRAY_ITEMS ? [...head, `…${value.length - MAX_ARRAY_ITEMS} more`] : head;
  }
  if (value !== null && typeof value === "object") {
    if (depth >= MAX_DEPTH) {
      return "[object]";
    }
    return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, compact(inner, depth + 1)]));
  }
  return value;
}

function summarise(status: number, ok: boolean, body: unknown): string {
  if (!body || typeof body !== "object") {
    return `HTTP ${status}`;
  }
  const envelope = body as { ok?: boolean; error?: { code?: string; message?: string }; data?: unknown };

  if (envelope.ok === false || !ok) {
    const code = envelope.error?.code ?? `HTTP ${status}`;
    return envelope.error?.message ? `${code}: ${envelope.error.message}` : code;
  }
  if (envelope.data && typeof envelope.data === "object") {
    const keys = Object.keys(envelope.data).slice(0, 6);
    return `HTTP ${status} · ${keys.join(", ")}`;
  }
  return `HTTP ${status}`;
}

export type AgentToolContext = {
  /** Origin of the API the agent calls, normally the app serving the chat. */
  origin: string;
  /** Forwarded so a tool call is rate-limited against the real caller, not the server. */
  forwardedFor?: string | null;
  timeoutMs?: number;
};

export async function callAgentTool(
  tool: AgentTool,
  args: Record<string, unknown>,
  context: AgentToolContext,
): Promise<AgentToolResult> {
  const path = buildPath(tool, args);
  const headers: Record<string, string> = { Accept: "application/json" };
  if (context.forwardedFor) {
    headers["x-forwarded-for"] = context.forwardedFor;
  }

  let body: string | undefined;
  if (tool.method === "POST") {
    const payload = Object.fromEntries(Object.entries(args).filter(([key]) => tool.bodyProperties.includes(key)));
    body = JSON.stringify(payload);
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(`${context.origin}${path}`, {
    method: tool.method,
    headers,
    body,
    cache: "no-store",
    signal: AbortSignal.timeout(context.timeoutMs ?? DEFAULT_TIMEOUT_MS),
  });

  const text = await response.text();
  let parsed: unknown = text;
  try {
    parsed = JSON.parse(text);
  } catch {
    // Non-JSON means something upstream of the route answered; pass the text through.
  }

  return {
    call: {
      method: tool.method,
      path,
      status: response.status,
      ok: response.ok,
      summary: summarise(response.status, response.ok, parsed),
    },
    payload: compact(parsed),
  };
}

/**
 * The origin the agent should call back into.
 *
 * `request.url` is rewritten to the internal address behind some proxies, so the forwarded
 * headers win when present. `AGENT_API_ORIGIN` is the escape hatch for deployments where
 * neither is right.
 */
export function resolveApiOrigin(request: Request): string {
  const override = process.env.AGENT_API_ORIGIN?.trim();
  if (override) {
    return override.replace(/\/$/, "");
  }

  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (host) {
    const protocol = request.headers.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
    return `${protocol}://${host}`;
  }

  return new URL(request.url).origin;
}
