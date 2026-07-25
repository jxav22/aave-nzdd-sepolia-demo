"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Conversation state for the API agent.
 *
 * Shared by the floating widget and the full page so there is one implementation of the
 * awkward parts: history sanitising, the configured check, and the suggestion lifecycle.
 * Every reply is produced by real calls to /api/v1, and the tool trace comes back with it.
 */

export type ChatRole = "user" | "assistant";

export type AgentApiCall = {
  name: string;
  method: string;
  path: string;
  status: number;
  ok: boolean;
  resultSummary: string;
};

export type AgentMessage = {
  id: string;
  role: ChatRole;
  content: string;
  toolCalls?: AgentApiCall[];
};

type StatusResponse = {
  ok: boolean;
  data?: {
    configured: boolean;
    model: string;
    tools: { name: string; method: string; path: string }[];
    suggestions: string[];
    envHint: string;
  };
};

type ChatResponse = {
  ok: boolean;
  data?: {
    reply: string;
    model: string;
    toolCalls: AgentApiCall[];
    suggestions: string[];
  };
  error?: { message?: string; code?: string };
};

const WELCOME_ID = "welcome";

const DEFAULT_WELCOME =
  "Ask anything this app's public API can answer: token prices, an account's position, " +
  "or how a proposed loan holds up if ETH falls. Every answer comes from a real call to /api/v1.";

function newId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Bubbles render plain text and the model reaches for markdown anyway. Strip the markers. */
export function plainText(content: string): string {
  return content
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .trim();
}

export function useApiAgentChat({ welcome = DEFAULT_WELCOME }: { welcome?: string } = {}) {
  const [messages, setMessages] = useState<AgentMessage[]>([{ id: WELCOME_ID, role: "assistant", content: welcome }]);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [model, setModel] = useState("gpt-4o-mini");
  const [toolCount, setToolCount] = useState(0);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [envHint, setEnvHint] = useState("Set OPENAI_API_KEY in packages/nextjs/.env.local");
  const sendingLock = useRef(false);

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch("/api/v1/binance/chat");
        const body = (await response.json()) as StatusResponse;
        if (response.ok && body.ok && body.data) {
          setConfigured(body.data.configured);
          setModel(body.data.model);
          setToolCount(body.data.tools.length);
          setSuggestions(body.data.suggestions);
          setEnvHint(body.data.envHint);
        } else {
          setConfigured(false);
        }
      } catch {
        setConfigured(false);
      }
    })();
  }, []);

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || sendingLock.current) {
        return;
      }

      sendingLock.current = true;
      setError(null);

      const userMessage: AgentMessage = { id: newId(), role: "user", content: trimmed };
      // The welcome bubble is ours, not part of the conversation the model should see.
      const historyForApi = [...messages, userMessage]
        .filter(message => message.id !== WELCOME_ID)
        .map(({ role, content }) => ({ role, content }));

      setMessages(previous => [...previous, userMessage]);
      setSuggestions([]);
      setIsSending(true);

      try {
        const response = await fetch("/api/v1/binance/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: historyForApi }),
        });
        const body = (await response.json()) as ChatResponse;
        const data = body.data;

        if (!response.ok || !body.ok || !data) {
          if (body.error?.code === "MISSING_CONFIG") {
            setConfigured(false);
          }
          throw new Error(body.error?.message ?? `The agent could not reply (${response.status}).`);
        }

        setMessages(previous => [
          ...previous,
          { id: newId(), role: "assistant", content: data.reply, toolCalls: data.toolCalls },
        ]);
        setSuggestions(data.suggestions ?? []);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "The agent could not reply.");
      } finally {
        sendingLock.current = false;
        setIsSending(false);
      }
    },
    [messages],
  );

  const reset = useCallback(() => {
    setMessages([{ id: WELCOME_ID, role: "assistant", content: welcome }]);
    setError(null);
  }, [welcome]);

  return {
    messages,
    send,
    reset,
    isSending,
    error,
    configured,
    model,
    toolCount,
    suggestions,
    envHint,
    /** True while the conversation is still just the welcome bubble. */
    isFresh: messages.length === 1 && messages[0]?.id === WELCOME_ID,
  };
}
