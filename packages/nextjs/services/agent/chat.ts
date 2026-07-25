/**
 * The chat agent behind /binance-chat.
 *
 * Every capability it has is an operation in the public v1 API: the toolset is generated
 * from the OpenAPI document and each tool call is a real HTTP request against this app
 * (see `apiTools.ts`). Nothing here reaches into the service layer directly, so whatever
 * the agent can answer, an integrator can reproduce with curl.
 *
 * Follow-up prompts are generated from the conversation rather than hardcoded in the UI.
 */
import {
  type AgentTool,
  type AgentToolContext,
  buildAgentTools,
  callAgentTool,
  findTool,
  starterPrompts,
  toOpenAiTools,
} from "./apiTools";
import { DISCLAIMER } from "~~/utils/risk/wording";

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const DEFAULT_MODEL = "gpt-4o-mini";
const MAX_USER_MESSAGE_LENGTH = 2_000;
const MAX_HISTORY_MESSAGES = 20;
const MAX_TOOL_ROUNDS = 4;
const MAX_TOOL_RESULT_CHARS = 6_000;
const REQUEST_TIMEOUT_MS = 45_000;
const OPENAI_RETRIES = 2;
const OPENAI_RETRY_DELAY_MS = 600;

const MAX_SUGGESTIONS = 4;
const MAX_SUGGESTION_LENGTH = 90;
const SUGGESTION_TIMEOUT_MS = 12_000;

export type ChatRole = "user" | "assistant" | "system";

export type ChatMessage = {
  role: ChatRole;
  content: string;
};

export type ToolInvocation = {
  name: string;
  arguments: Record<string, unknown>;
  method: string;
  path: string;
  status: number;
  ok: boolean;
  resultSummary: string;
};

export type ChatReply = {
  reply: string;
  model: string;
  toolCalls: ToolInvocation[];
  suggestions: string[];
  provenance: {
    api: string;
    toolSource: string;
    tools: string[];
    openaiRequired: boolean;
    apiAuthenticationRequired: boolean;
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

export class ChatUpstreamError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChatUpstreamError";
  }
}

export function isOpenAiConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

export function getChatModel(): string {
  return process.env.OPENAI_MODEL?.trim() || DEFAULT_MODEL;
}

export function getAgentTools(): AgentTool[] {
  return buildAgentTools();
}

export function getStarterSuggestions(): string[] {
  return starterPrompts(getAgentTools(), MAX_SUGGESTIONS);
}

function buildSystemPrompt(tools: AgentTool[]): string {
  const catalogue = tools.map(tool => `- ${tool.name} → ${tool.description}`).join("\n");

  return `You are the agent for a Scaffold-ETH demo of an Aave V3 market on Sepolia where wETH collateral backs a dNZD borrow. Public Binance Web3 endpoints supply market context.

Every tool you have is one operation of this app's own public REST API, called over HTTP:
${catalogue}

How to work:
- Use tools for every fact about a market, token or wallet. Never invent a price, address, balance or health factor.
- Responses use the envelope { ok, schemaVersion, data | error }. When ok is false, tell the user the error code and what would fix it.
- Token lookups need a contract address, so search first, then pass the chainId and contractAddress of the best match. Chain IDs: Ethereum=1, BSC=56, Base=8453, Solana=CT_501.
- Position and borrow-risk operations need a wallet address. Ask for one rather than guessing.
- Chain amounts arrive as decimal strings alongside a decimals field. Quote the pre-formatted values the API returns instead of doing your own conversions.

How to answer:
- Be concise. Say which endpoint produced each figure.
- Write plain text. The chat window renders no markdown, so use short lines and "- " bullets, never bold, tables or images.
- This is educational risk context, not advice. Never call an amount safe, risk-free or guaranteed, and never state that liquidation cannot happen. A stress-tested maximum is a scenario, not a limit.
- When you quote risk numbers, close with: ${DISCLAIMER}
- You cannot sign transactions, move funds, or read anything private.`;
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

type OpenAiOptions = {
  tools?: ReturnType<typeof toOpenAiTools>;
  jsonMode?: boolean;
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
};

/**
 * OpenAI 500s and 429s show up often enough on a live demo to be worth riding out; a
 * dropped turn costs the whole conversation, while a retry costs a second.
 */
async function callOpenAi(
  messages: OpenAiMessage[],
  apiKey: string,
  model: string,
  options: OpenAiOptions = {},
): Promise<OpenAiMessage> {
  const payload = JSON.stringify({
    model,
    messages,
    temperature: options.temperature ?? 0.2,
    ...(options.tools ? { tools: options.tools, tool_choice: "auto" } : {}),
    ...(options.jsonMode ? { response_format: { type: "json_object" } } : {}),
    ...(options.maxTokens ? { max_tokens: options.maxTokens } : {}),
  });

  let lastError = new Error("OpenAI request failed.");

  for (let attempt = 0; attempt <= OPENAI_RETRIES; attempt++) {
    if (attempt > 0) {
      await new Promise(resolve => setTimeout(resolve, OPENAI_RETRY_DELAY_MS * attempt));
    }

    let response: Response;
    try {
      response = await fetch(OPENAI_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: payload,
        signal: AbortSignal.timeout(options.timeoutMs ?? REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("OpenAI request failed.");
      continue;
    }

    const body = (await response.json().catch(() => ({}))) as {
      error?: { message?: string };
      choices?: { message?: OpenAiMessage }[];
    };

    if (!response.ok) {
      lastError = new Error(body.error?.message ?? `OpenAI returned HTTP ${response.status}`);
      if (response.status === 429 || response.status >= 500) {
        continue;
      }
      throw lastError;
    }

    const message = body.choices?.[0]?.message;
    if (!message) {
      throw new Error("OpenAI response contained no choices.");
    }
    return message;
  }

  throw lastError;
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

function serialiseToolPayload(payload: unknown): string {
  const text = JSON.stringify(payload) ?? "null";
  return text.length > MAX_TOOL_RESULT_CHARS ? `${text.slice(0, MAX_TOOL_RESULT_CHARS)}… (truncated)` : text;
}

/** Keep only usable, non-repetitive prompts, so a sloppy model answer cannot reach the UI. */
export function parseSuggestions(raw: unknown, asked: string[] = []): string[] {
  const candidates = Array.isArray(raw)
    ? raw
    : Array.isArray((raw as { suggestions?: unknown })?.suggestions)
      ? ((raw as { suggestions: unknown[] }).suggestions ?? [])
      : [];

  const seen = new Set(asked.map(entry => entry.trim().toLowerCase()));
  const suggestions: string[] = [];

  for (const candidate of candidates) {
    if (typeof candidate !== "string") {
      continue;
    }
    const trimmed = candidate.trim().replace(/\s+/g, " ");
    if (!trimmed || trimmed.length > MAX_SUGGESTION_LENGTH) {
      continue;
    }
    const key = trimmed.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    suggestions.push(trimmed);
    if (suggestions.length === MAX_SUGGESTIONS) {
      break;
    }
  }

  return suggestions;
}

/**
 * Ask for follow-ups grounded in what was just said and in what the API can actually
 * answer. A separate, small call keeps the main answer free of formatting instructions.
 */
async function generateSuggestions(
  tools: AgentTool[],
  messages: ChatMessage[],
  reply: string,
  toolCalls: ToolInvocation[],
  apiKey: string,
  model: string,
): Promise<string[]> {
  const transcript = [...messages.slice(-4), { role: "assistant" as const, content: reply }]
    .map(message => `${message.role}: ${message.content.slice(0, 600)}`)
    .join("\n");

  const called = toolCalls.length
    ? toolCalls.map(call => `${call.method} ${call.path} → ${call.status}`).join("\n")
    : "none";

  const instruction = `You write follow-up questions for a user chatting with an API agent.

Endpoints the agent can call:
${tools.map(tool => `- ${tool.description}`).join("\n")}

Conversation so far:
${transcript}

Calls the agent just made:
${called}

Return JSON: {"suggestions": ["…", "…", "…"]}
Rules:
- Exactly 3 suggestions, each a question or request the user could send next, written in their voice.
- Each must be answerable by the endpoints above, and each should lead somewhere different.
- Build on the conversation: reuse the concrete token symbols, chains, wallet addresses and amounts already in play instead of generic phrasing.
- Under 80 characters, no numbering, no quotes around the text.`;

  const message = await callOpenAi([{ role: "user", content: instruction }], apiKey, model, {
    jsonMode: true,
    temperature: 0.7,
    maxTokens: 200,
    timeoutMs: SUGGESTION_TIMEOUT_MS,
  });

  const parsed = JSON.parse(message.content ?? "{}") as unknown;
  return parseSuggestions(
    parsed,
    messages.filter(entry => entry.role === "user").map(entry => entry.content),
  );
}

export type AgentChatRequest = {
  messages: ChatMessage[];
  context: AgentToolContext;
};

/** Run one user turn: the model may call API operations for up to MAX_TOOL_ROUNDS rounds. */
export async function runApiAgentChat({ messages, context }: AgentChatRequest): Promise<ChatReply> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }

  const model = getChatModel();
  const tools = getAgentTools();
  const openAiTools = toOpenAiTools(tools);
  const toolCalls: ToolInvocation[] = [];
  const conversation: OpenAiMessage[] = [
    { role: "system", content: buildSystemPrompt(tools) },
    ...messages.map(message => ({ role: message.role, content: message.content })),
  ];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    let assistantMessage: OpenAiMessage;
    try {
      assistantMessage = await callOpenAi(conversation, apiKey, model, { tools: openAiTools });
    } catch (error) {
      throw new ChatUpstreamError(error instanceof Error ? error.message : "OpenAI request failed.");
    }
    conversation.push(assistantMessage);

    const calls = assistantMessage.tool_calls ?? [];
    if (calls.length === 0) {
      const reply = (assistantMessage.content ?? "").trim();
      if (!reply) {
        throw new ChatUpstreamError("The model returned an empty reply.");
      }

      const suggestions = await generateSuggestions(tools, messages, reply, toolCalls, apiKey, model).catch(
        () => [] as string[],
      );

      return {
        reply,
        model,
        toolCalls,
        suggestions: suggestions.length > 0 ? suggestions : starterPrompts(tools, 3),
        provenance: {
          api: "v1",
          toolSource: "GET /api/v1/openapi.json",
          tools: tools.map(tool => tool.name),
          openaiRequired: true,
          apiAuthenticationRequired: false,
          asOf: new Date().toISOString(),
        },
      };
    }

    for (const call of calls) {
      const args = parseToolArguments(call.function.arguments);
      const tool = findTool(tools, call.function.name);
      let payload: unknown;

      if (!tool) {
        payload = {
          ok: false,
          error: { code: "UNKNOWN_TOOL", message: `No API operation named ${call.function.name}.` },
        };
        toolCalls.push({
          name: call.function.name,
          arguments: args,
          method: "-",
          path: "-",
          status: 0,
          ok: false,
          resultSummary: "Unknown operation.",
        });
      } else {
        try {
          const { call: made, payload: result } = await callAgentTool(tool, args, context);
          payload = result;
          toolCalls.push({
            name: tool.name,
            arguments: args,
            method: made.method,
            path: made.path,
            status: made.status,
            ok: made.ok,
            resultSummary: made.summary,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : "The API call failed.";
          payload = { ok: false, error: { code: "TOOL_CALL_FAILED", message } };
          toolCalls.push({
            name: tool.name,
            arguments: args,
            method: tool.method,
            path: tool.path,
            status: 0,
            ok: false,
            resultSummary: message,
          });
        }
      }

      conversation.push({
        role: "tool",
        tool_call_id: call.id,
        name: call.function.name,
        content: serialiseToolPayload(payload),
      });
    }
  }

  throw new ChatUpstreamError("Tool-calling loop exceeded the maximum number of rounds.");
}
