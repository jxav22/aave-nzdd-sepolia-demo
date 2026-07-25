/**
 * GET  /api/v1/binance/chat — whether OpenAI is configured for the demo chatbot.
 * POST /api/v1/binance/chat — one chat turn with Binance query-token-info tools.
 *
 * Binance skill calls are public (no Binance API key). Dialogue needs OPENAI_API_KEY.
 */
import { checkRateLimit, clientIdentifier, rateLimitHeaders } from "~~/services/api/rateLimit";
import { ApiError, handleOptions, jsonError, jsonOk, withApiErrorHandling } from "~~/services/api/respond";
import {
  ChatUpstreamError,
  getChatModel,
  isOpenAiConfigured,
  runBinanceSkillsChat,
  sanitiseChatMessages,
} from "~~/services/binance/chat";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

  return jsonOk(
    {
      configured: isOpenAiConfigured(),
      model: getChatModel(),
      skill: "query-token-info",
      tools: ["search_tokens", "get_token_dynamic", "get_token_meta"],
      requires: {
        openaiApiKey: true,
        binanceApiKey: false,
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
        "OPENAI_API_KEY is not set. Add it to packages/nextjs/.env.local to enable the Binance skills chatbot.",
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

    try {
      const result = await runBinanceSkillsChat(messages);
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
