/**
 * Interactive Binance skills chatbot.
 *
 * Uses OpenAI tool-calling to route natural language onto the public
 * `query-token-info` skill (search / meta / dynamic). Binance endpoints need no key;
 * dialogue requires `OPENAI_API_KEY`.
 */
import {
  type TokenDynamic,
  type TokenMeta,
  type TokenSearchHit,
  getTokenDynamic,
  getTokenMeta,
  searchTokens,
} from "~~/services/binance/tokenInfo";

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const DEFAULT_MODEL = "gpt-4o-mini";
const MAX_USER_MESSAGE_LENGTH = 2_000;
const MAX_HISTORY_MESSAGES = 20;
const MAX_TOOL_ROUNDS = 4;
const REQUEST_TIMEOUT_MS = 45_000;

export type ChatRole = "user" | "assistant" | "system";

export type ChatMessage = {
  role: ChatRole;
  content: string;
};

export type ToolInvocation = {
  name: string;
  arguments: Record<string, unknown>;
  resultSummary: string;
};

export type ChatReply = {
  reply: string;
  model: string;
  toolCalls: ToolInvocation[];
  provenance: {
    skill: string;
    tools: string[];
    openaiRequired: boolean;
    binanceAuthenticationRequired: boolean;
    asOf: string;
  };
};

type OpenAiMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: OpenAiToolCall[];
  tool_call_id?: string;
  name?: string;
};

type OpenAiToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

type OpenAiChoice = {
  message?: OpenAiMessage;
  finish_reason?: string;
};

const SYSTEM_PROMPT = `You are a demo assistant for Binance Web3 agent skills in a Scaffold-ETH hackathon app.

You help users explore tokens via the public query-token-info skill:
- search_tokens — find tokens by symbol, name, or contract
- get_token_dynamic — live price, 24h change, volume, liquidity, holders
- get_token_meta — name, symbol, social links, website

Rules:
- Always use tools for market facts; never invent prices or addresses.
- Prefer search_tokens first when the user names a symbol without a contract.
- After search, pick the best match (same chain if mentioned) then call dynamic and/or meta.
- Chain IDs: Ethereum=1, BSC=56, Base=8453, Solana=CT_501.
- Keep answers concise. Quote USD figures clearly. Mention which skill/tool you used.
- You cannot trade, connect wallets, or access private Binance accounts.
- If a tool fails, say so and suggest another query.`;

const TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "search_tokens",
      description: "Search Binance Web3 tokens by keyword, symbol, or contract address (query-token-info search).",
      parameters: {
        type: "object",
        properties: {
          keyword: { type: "string", description: "Token symbol, name, or contract address." },
          chainIds: {
            type: "string",
            description: "Optional comma-separated chainIds: 1, 56, 8453, CT_501.",
          },
        },
        required: ["keyword"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_token_dynamic",
      description: "Live market data for a token (query-token-info dynamic): price, 24h change, volume, liquidity.",
      parameters: {
        type: "object",
        properties: {
          chainId: { type: "string", description: "1 | 56 | 8453 | CT_501" },
          contractAddress: { type: "string" },
        },
        required: ["chainId", "contractAddress"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_token_meta",
      description: "Static token metadata (query-token-info meta): name, symbol, website, socials.",
      parameters: {
        type: "object",
        properties: {
          chainId: { type: "string", description: "1 | 56 | 8453 | CT_501" },
          contractAddress: { type: "string" },
        },
        required: ["chainId", "contractAddress"],
        additionalProperties: false,
      },
    },
  },
];

export function isOpenAiConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

export function getChatModel(): string {
  return process.env.OPENAI_MODEL?.trim() || DEFAULT_MODEL;
}

function summariseSearch(hits: TokenSearchHit[]): string {
  if (hits.length === 0) {
    return "No tokens matched.";
  }
  return hits
    .slice(0, 5)
    .map(
      hit =>
        `${hit.symbol || "?"} (${hit.chainLabel}) ${hit.contractAddress}` +
        (hit.priceUsd !== null ? ` $${hit.priceUsd}` : ""),
    )
    .join("; ");
}

function summariseDynamic(data: TokenDynamic): string {
  const change =
    data.change24hPercent === null ? "n/a" : `${data.change24hPercent > 0 ? "+" : ""}${data.change24hPercent}%`;
  return `${data.chainLabel} ${data.contractAddress}: price=${data.priceUsd ?? "n/a"} 24h=${change} vol=${data.volume24hUsd ?? "n/a"} liq=${data.liquidityUsd ?? "n/a"}`;
}

function summariseMeta(data: TokenMeta): string {
  return `${data.symbol || "?"} ${data.name} on ${data.chainLabel}; website=${data.website ?? "n/a"}`;
}

async function executeTool(
  name: string,
  args: Record<string, unknown>,
): Promise<{ payload: unknown; summary: string }> {
  switch (name) {
    case "search_tokens": {
      const keyword = typeof args.keyword === "string" ? args.keyword : "";
      const chainIds = typeof args.chainIds === "string" ? args.chainIds : undefined;
      const results = await searchTokens(keyword, chainIds);
      return { payload: { count: results.length, results: results.slice(0, 8) }, summary: summariseSearch(results) };
    }
    case "get_token_dynamic": {
      const chainId = String(args.chainId ?? "");
      const contractAddress = String(args.contractAddress ?? "");
      const data = await getTokenDynamic(chainId, contractAddress);
      return { payload: data, summary: summariseDynamic(data) };
    }
    case "get_token_meta": {
      const chainId = String(args.chainId ?? "");
      const contractAddress = String(args.contractAddress ?? "");
      const data = await getTokenMeta(chainId, contractAddress);
      return { payload: data, summary: summariseMeta(data) };
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

function parseToolArguments(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    return parsed as Record<string, unknown>;
  } catch {
    return {};
  }
}

export function sanitiseChatMessages(input: unknown): ChatMessage[] {
  if (!Array.isArray(input)) {
    throw new Error("messages must be an array.");
  }

  const messages: ChatMessage[] = [];
  for (const row of input) {
    if (!row || typeof row !== "object") {
      continue;
    }
    const role = (row as { role?: unknown }).role;
    const content = (row as { content?: unknown }).content;
    if ((role !== "user" && role !== "assistant") || typeof content !== "string") {
      continue;
    }
    const trimmed = content.trim();
    if (!trimmed) {
      continue;
    }
    messages.push({
      role,
      content: trimmed.slice(0, MAX_USER_MESSAGE_LENGTH),
    });
  }

  if (messages.length === 0) {
    throw new Error("At least one user or assistant message is required.");
  }
  if (messages[messages.length - 1].role !== "user") {
    throw new Error("The last message must be from the user.");
  }

  return messages.slice(-MAX_HISTORY_MESSAGES);
}

async function callOpenAi(messages: OpenAiMessage[], apiKey: string, model: string): Promise<OpenAiChoice> {
  const response = await fetch(OPENAI_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages,
      tools: TOOLS,
      tool_choice: "auto",
      temperature: 0.2,
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  const body = (await response.json()) as {
    error?: { message?: string };
    choices?: OpenAiChoice[];
  };

  if (!response.ok) {
    throw new Error(body.error?.message ?? `OpenAI returned HTTP ${response.status}`);
  }

  const choice = body.choices?.[0];
  if (!choice?.message) {
    throw new Error("OpenAI response contained no choices.");
  }
  return choice;
}

export class ChatUpstreamError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChatUpstreamError";
  }
}

/**
 * Run one user turn: OpenAI may call Binance skill tools for up to MAX_TOOL_ROUNDS.
 */
export async function runBinanceSkillsChat(messages: ChatMessage[]): Promise<ChatReply> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }

  const model = getChatModel();
  const toolCalls: ToolInvocation[] = [];
  const conversation: OpenAiMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...messages.map(message => ({ role: message.role, content: message.content })),
  ];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    let choice: OpenAiChoice;
    try {
      choice = await callOpenAi(conversation, apiKey, model);
    } catch (error) {
      throw new ChatUpstreamError(error instanceof Error ? error.message : "OpenAI request failed.");
    }
    const assistantMessage = choice.message;
    if (!assistantMessage) {
      throw new ChatUpstreamError("OpenAI response contained no choices.");
    }
    conversation.push(assistantMessage);

    const calls = assistantMessage.tool_calls ?? [];
    if (calls.length === 0) {
      const reply = (assistantMessage.content ?? "").trim();
      if (!reply) {
        throw new ChatUpstreamError("The model returned an empty reply.");
      }
      return {
        reply,
        model,
        toolCalls,
        provenance: {
          skill: "query-token-info",
          tools: ["search_tokens", "get_token_dynamic", "get_token_meta"],
          openaiRequired: true,
          binanceAuthenticationRequired: false,
          asOf: new Date().toISOString(),
        },
      };
    }

    for (const call of calls) {
      const args = parseToolArguments(call.function.arguments);
      let payload: unknown;
      let summary: string;
      try {
        const executed = await executeTool(call.function.name, args);
        payload = executed.payload;
        summary = executed.summary;
      } catch (error) {
        payload = { error: error instanceof Error ? error.message : "Tool failed." };
        summary = String((payload as { error: string }).error);
      }

      toolCalls.push({ name: call.function.name, arguments: args, resultSummary: summary });
      conversation.push({
        role: "tool",
        tool_call_id: call.id,
        name: call.function.name,
        content: JSON.stringify(payload),
      });
    }
  }

  throw new ChatUpstreamError("Tool-calling loop exceeded the maximum number of rounds.");
}
