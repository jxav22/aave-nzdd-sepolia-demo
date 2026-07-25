/**
 * GET  /api/v1/binance/chat — agent status, its toolset, and starter prompts.
 * POST /api/v1/binance/chat — one chat turn.
 *
 * The agent's tools are the other operations of this API, called over HTTP (see
 * `services/agent/apiTools.ts`). Those need no key; the dialogue needs OPENAI_API_KEY.
 */
import { resolveApiOrigin } from "~~/services/agent/apiTools";
import {
  ChatUpstreamError,
  getAgentTools,
  getChatModel,
  getStarterSuggestions,
  isOpenAiConfigured,
  runApiAgentChat,
  sanitiseChatMessages,
} from "~~/services/agent/chat";
import { checkRateLimit, clientIdentifier, rateLimitHeaders } from "~~/services/api/rateLimit";
import { ApiError, handleOptions, jsonError, jsonOk, withApiErrorHandling } from "~~/services/api/respond";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Lower than the routes it calls: one turn fans out into several of them, and each turn
 * also spends an OpenAI key that the caller does not own.
 */
const RATE_LIMIT_PER_MINUTE = 20;

function rateHeaders(request: Request) {
  const limit = checkRateLimit(clientIdentifier(request), RATE_LIMIT_PER_MINUTE);
  return {
    limit,
    headers: {
      ...rateLimitHeaders(limit),
      "Cache-Control": "no-store",
    },
  };
}

export async function GET(request: Request): Promise<Response> {
  const { limit, headers } = rateHeaders(request);
  if (!limit.allowed) {
    return jsonError(
      new ApiError("RATE_LIMITED", `Rate limit of ${limit.limit} requests per minute exceeded.`),
      headers,
    );
  }

  const tools = getAgentTools();

  return jsonOk(
    {
      configured: isOpenAiConfigured(),
      model: getChatModel(),
      toolSource: "GET /api/v1/openapi.json",
      tools: tools.map(tool => ({ name: tool.name, method: tool.method, path: tool.path })),
      suggestions: getStarterSuggestions(),
      requires: {
        openaiApiKey: true,
        binanceApiKey: false,
        walletSignature: false,
      },
      envHint: "Set OPENAI_API_KEY in packages/nextjs/.env.local (optional OPENAI_MODEL, default gpt-4o-mini).",
    },
    { headers },
  );
}

export async function POST(request: Request): Promise<Response> {
  const { limit, headers } = rateHeaders(request);
  if (!limit.allowed) {
    return jsonError(
      new ApiError("RATE_LIMITED", `Rate limit of ${limit.limit} requests per minute exceeded.`),
      headers,
    );
  }

  return withApiErrorHandling(async () => {
    if (!isOpenAiConfigured()) {
      throw new ApiError(
        "MISSING_CONFIG",
        "OPENAI_API_KEY is not set. Add it to packages/nextjs/.env.local to enable the chat agent.",
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new ApiError("INVALID_BODY", "Request body must be JSON.");
    }

    const messagesRaw = (body as { messages?: unknown })?.messages;
    let messages;
    try {
      messages = sanitiseChatMessages(messagesRaw);
    } catch (error) {
      throw new ApiError("INVALID_BODY", error instanceof Error ? error.message : "Invalid messages.", "messages");
    }

    const caller = clientIdentifier(request);

    try {
      const result = await runApiAgentChat({
        messages,
        context: {
          origin: resolveApiOrigin(request),
          // Tool calls are rate-limited against the caller, not the server making them.
          forwardedFor: caller === "unknown" ? null : caller,
        },
      });
      return jsonOk(result, { headers });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Chat failed.";
      if (/OPENAI_API_KEY/i.test(message)) {
        throw new ApiError("MISSING_CONFIG", message);
      }
      if (error instanceof ChatUpstreamError) {
        throw new ApiError("UPSTREAM_RPC_ERROR", message);
      }
      throw error;
    }
  }, headers);
}

export function OPTIONS(): Response {
  return handleOptions();
}
