"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { NextPage } from "next";
import { ChatBubbleLeftRightIcon, PaperAirplaneIcon } from "@heroicons/react/24/outline";

type ChatRole = "user" | "assistant";

type ApiCall = {
  name: string;
  method: string;
  path: string;
  status: number;
  ok: boolean;
  resultSummary: string;
};

type UiMessage = {
  id: string;
  role: ChatRole;
  content: string;
  toolCalls?: ApiCall[];
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
    toolCalls: ApiCall[];
    suggestions: string[];
  };
  error?: { message?: string; code?: string };
};

function newId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

const BinanceChatPage: NextPage = () => {
  const [messages, setMessages] = useState<UiMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      content:
        "Ask me anything this app's public API can answer — token markets, a wallet's Aave position, or how a proposed dNZD borrow holds up if ETH falls. Every answer comes from a real call to /api/v1.",
    },
  ]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [model, setModel] = useState("gpt-4o-mini");
  const [toolCount, setToolCount] = useState(0);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [envHint, setEnvHint] = useState("Set OPENAI_API_KEY in packages/nextjs/.env.local");
  const bottomRef = useRef<HTMLDivElement>(null);
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

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isSending]);

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || sendingLock.current) {
        return;
      }

      sendingLock.current = true;
      setError(null);
      const userMessage: UiMessage = { id: newId(), role: "user", content: trimmed };
      const historyForApi = [...messages, userMessage]
        .filter(m => m.id !== "welcome")
        .map(({ role, content }) => ({ role, content }));

      setMessages(prev => [...prev, userMessage]);
      setInput("");
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
          throw new Error(body.error?.message ?? `Chat failed (${response.status})`);
        }

        setMessages(prev => [
          ...prev,
          {
            id: newId(),
            role: "assistant",
            content: data.reply,
            toolCalls: data.toolCalls,
          },
        ]);
        setSuggestions(data.suggestions ?? []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Chat failed.");
      } finally {
        sendingLock.current = false;
        setIsSending(false);
      }
    },
    [messages],
  );

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    void send(input);
  };

  return (
    <div className="flex flex-col items-center grow pt-8 pb-16 px-4">
      <div className="w-full max-w-3xl flex flex-col gap-4 min-h-[70vh]">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <ChatBubbleLeftRightIcon className="h-8 w-8" />
            API Agent Chat
          </h1>
          <p className="mt-2 text-sm opacity-80">A chatbot whose entire toolset is this app&apos;s public API</p>
          <p className="text-sm opacity-70 mt-1">
            Tools are generated from <code>/api/v1/openapi.json</code>, and each one is an HTTP call to the same
            endpoints you can curl — Binance market data, Aave positions, borrow-risk stress tests. Dialogue uses OpenAI
            tool-calling; the API itself needs no key.
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
            Model <code>{model}</code> · {toolCount} API operations as tools · no API key, no wallet signature
          </p>
        )}

        <div className="bg-base-200 rounded-lg flex flex-col grow border border-base-300 min-h-[28rem]">
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
                        <code>
                          {call.method} {call.path}
                        </code>{" "}
                        <span className={call.ok ? "" : "text-error"}>
                          → {call.status || "failed"}
                          {call.ok ? "" : ` ${call.resultSummary}`}
                        </span>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {isSending && (
              <div className="chat chat-start">
                <div className="chat-bubble chat-bubble-secondary text-sm">Calling the API…</div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {suggestions.length > 0 && (
            <div className="px-4 pb-2 flex flex-wrap gap-2">
              {suggestions.map(suggestion => (
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
          )}

          <form onSubmit={onSubmit} className="p-4 pt-2 border-t border-base-300 flex gap-2">
            <input
              className="input input-bordered grow"
              value={input}
              onChange={event => setInput(event.target.value)}
              placeholder={
                configured === false ? "Set OPENAI_API_KEY to chat…" : "Ask about a token, wallet or borrow…"
              }
              disabled={isSending || configured === false}
              maxLength={2000}
            />
            <button
              type="submit"
              className="btn btn-primary"
              disabled={isSending || configured === false || !input.trim()}
            >
              {isSending ? (
                <span className="loading loading-spinner loading-sm" />
              ) : (
                <PaperAirplaneIcon className="h-4 w-4" />
              )}
              Send
            </button>
          </form>
        </div>

        {error && <p className="text-error text-sm">{error}</p>}

        <p className="text-xs opacity-60">
          Same surface as the{" "}
          <Link className="link" href="/developer-api">
            Developer API
          </Link>{" "}
          playground. Market data comes from{" "}
          <a className="link" href="https://github.com/binance/binance-skills-hub" target="_blank" rel="noreferrer">
            Binance agent skills
          </a>
          .
        </p>
      </div>
    </div>
  );
};

export default BinanceChatPage;
