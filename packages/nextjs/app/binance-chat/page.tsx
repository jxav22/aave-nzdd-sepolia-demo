"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { NextPage } from "next";
import { ChatBubbleLeftRightIcon, PaperAirplaneIcon } from "@heroicons/react/24/outline";

type ChatRole = "user" | "assistant";

type UiMessage = {
  id: string;
  role: ChatRole;
  content: string;
  toolCalls?: { name: string; resultSummary: string }[];
};

type StatusResponse = {
  ok: boolean;
  data?: {
    configured: boolean;
    model: string;
    skill: string;
    tools: string[];
    envHint: string;
  };
};

type ChatResponse = {
  ok: boolean;
  data?: {
    reply: string;
    model: string;
    toolCalls: { name: string; resultSummary: string }[];
  };
  error?: { message?: string; code?: string };
};

const SUGGESTIONS = [
  "What's the price of ETH on Ethereum?",
  "Search for USDC on Base",
  "Find BNB on BSC and show liquidity",
  "Who created WETH and what's its website?",
] as const;

function newId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

const BinanceChatPage: NextPage = () => {
  const [messages, setMessages] = useState<UiMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      content:
        "Ask about a token and I'll call the public Binance query-token-info skill (search, dynamic, meta). Example: “Price of ETH on Ethereum?”",
    },
  ]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [model, setModel] = useState("gpt-4o-mini");
  const [envHint, setEnvHint] = useState("Set OPENAI_API_KEY in packages/nextjs/.env.local");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch("/api/v1/binance/chat");
        const body = (await response.json()) as StatusResponse;
        if (response.ok && body.ok && body.data) {
          setConfigured(body.data.configured);
          setModel(body.data.model);
          setEnvHint(body.data.envHint);
        } else {
          setConfigured(false);
        }
      } catch {
        setConfigured(false);
      }
    })();
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isSending]);

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || isSending) {
        return;
      }

      setError(null);
      const userMessage: UiMessage = { id: newId(), role: "user", content: trimmed };
      const historyForApi = [...messages, userMessage]
        .filter(m => m.id !== "welcome")
        .map(({ role, content }) => ({ role, content }));

      setMessages(prev => [...prev, userMessage]);
      setInput("");
      setIsSending(true);

      try {
        const response = await fetch("/api/v1/binance/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: historyForApi }),
        });
        const body = (await response.json()) as ChatResponse;
        if (!response.ok || !body.ok || !body.data) {
          if (body.error?.code === "MISSING_CONFIG") {
            setConfigured(false);
          }
          throw new Error(body.error?.message ?? `Chat failed (${response.status})`);
        }

        setMessages(prev => [
          ...prev,
          {
            id: newId(),
            role: "assistant",
            content: body.data!.reply,
            toolCalls: body.data!.toolCalls,
          },
        ]);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Chat failed.");
      } finally {
        setIsSending(false);
      }
    },
    [isSending, messages],
  );

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    void send(input);
  };

  return (
    <div className="flex flex-col items-center grow pt-8 pb-16 px-4">
      <div className="w-full max-w-3xl flex flex-col gap-4" style={{ minHeight: "70vh" }}>
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <ChatBubbleLeftRightIcon className="h-8 w-8" />
            Binance Skills Chat
          </h1>
          <p className="mt-2 text-sm opacity-80">Interactive chatbot demo over public Binance agent skills</p>
          <p className="text-sm opacity-70 mt-1">
            Dialogue uses OpenAI tool-calling. Token data comes from the same public <code>query-token-info</code>{" "}
            endpoints as the Agents tab — no Binance API key.
          </p>
        </div>

        {configured === false && (
          <div className="alert alert-warning text-sm">
            <span>
              <strong>OPENAI_API_KEY required.</strong> {envHint} Then restart <code>yarn start</code>.
            </span>
          </div>
        )}

        {configured && (
          <p className="text-xs opacity-60">
            Model <code>{model}</code> · tools: search / dynamic / meta · Binance auth: none
          </p>
        )}

        <div
          className="bg-base-200 rounded-lg flex flex-col grow border border-base-300"
          style={{ minHeight: "28rem" }}
        >
          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
            {messages.map(message => (
              <div key={message.id} className={`chat ${message.role === "user" ? "chat-end" : "chat-start"}`}>
                <div
                  className={`chat-bubble text-sm whitespace-pre-wrap ${
                    message.role === "user" ? "chat-bubble-primary" : "chat-bubble-secondary"
                  }`}
                >
                  {message.content}
                </div>
                {message.toolCalls && message.toolCalls.length > 0 && (
                  <div className="chat-footer opacity-60 text-xs mt-1 flex flex-col gap-0.5 max-w-prose">
                    {message.toolCalls.map((call, index) => (
                      <span key={`${message.id}-${index}`}>
                        tool <code>{call.name}</code>: {call.resultSummary}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {isSending && (
              <div className="chat chat-start">
                <div className="chat-bubble chat-bubble-secondary text-sm">Looking up via Binance skills…</div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          <div className="px-4 pb-2 flex flex-wrap gap-2">
            {SUGGESTIONS.map(suggestion => (
              <button
                key={suggestion}
                type="button"
                className="btn btn-xs btn-ghost border border-base-300"
                disabled={isSending || configured === false}
                onClick={() => void send(suggestion)}
              >
                {suggestion}
              </button>
            ))}
          </div>

          <form onSubmit={onSubmit} className="p-4 pt-2 border-t border-base-300 flex gap-2">
            <input
              className="input input-bordered grow"
              value={input}
              onChange={event => setInput(event.target.value)}
              placeholder={configured === false ? "Set OPENAI_API_KEY to chat…" : "Ask about a token…"}
              disabled={isSending || configured === false}
              maxLength={2000}
            />
            <button
              type="submit"
              className="btn btn-primary"
              disabled={isSending || configured === false || !input.trim()}
            >
              <PaperAirplaneIcon className="h-4 w-4" />
              Send
            </button>
          </form>
        </div>

        {error && <p className="text-error text-sm">{error}</p>}

        <p className="text-xs opacity-60">
          Companion to the{" "}
          <Link className="link" href="/binance-agents">
            Binance Agents
          </Link>{" "}
          API demo. Skills from{" "}
          <a className="link" href="https://github.com/binance/binance-skills-hub" target="_blank" rel="noreferrer">
            binance/binance-skills-hub
          </a>
          .
        </p>
      </div>
    </div>
  );
};

export default BinanceChatPage;
