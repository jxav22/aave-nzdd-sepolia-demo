"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { NextPage } from "next";
import { PaperAirplaneIcon } from "@heroicons/react/24/outline";
import { ActionButton, Card, Eyebrow, Note, SectionHeading } from "~~/components/ora/primitives";
import { plainText, useApiAgentChat } from "~~/hooks/useApiAgentChat";

/**
 * Full view of the API agent.
 *
 * Shares `useApiAgentChat` with the floating widget, so both surfaces behave identically and
 * there is one place where the conversation logic lives. This view adds the room the widget
 * does not have: the full tool trace under each reply, and what the agent is allowed to call.
 */
const AgentPage: NextPage = () => {
  const { messages, send, reset, isSending, error, configured, model, toolCount, suggestions, envHint, isFresh } =
    useApiAgentChat();
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isSending]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const text = input;
    setInput("");
    void send(text);
  };

  const disabled = isSending || configured === false;

  return (
    <div className="container-page py-12 lg:py-16">
      <SectionHeading eyebrow="Assistant" title={<>Ask about the market</>}>
        Every answer is produced by real calls to this app&apos;s public API rather than from the model&apos;s own
        knowledge. The tools are generated from the API specification, so the assistant can only do what the published
        API does.
      </SectionHeading>

      {configured === false ? (
        <Note tone="warning" className="mt-8" title="The assistant needs a language model key">
          {envHint} Then restart the app. The API itself needs no key, so the rest of the site is unaffected.
        </Note>
      ) : null}

      {configured ? (
        <p className="mt-6 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          {model} · {toolCount} API operations available · no wallet signature
        </p>
      ) : null}

      <Card className="mt-6 flex min-h-[32rem] flex-col p-0">
        <div className="flex-1 overflow-y-auto p-6">
          <ul className="flex flex-col gap-4">
            {messages.map(message => (
              <li key={message.id} className={`flex flex-col ${message.role === "user" ? "items-end" : "items-start"}`}>
                <div
                  className={`max-w-[80%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                    message.role === "user" ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground"
                  }`}
                >
                  {message.role === "assistant" ? plainText(message.content) : message.content}
                </div>

                {message.toolCalls && message.toolCalls.length > 0 ? (
                  <ul className="mt-2 flex max-w-[80%] flex-col gap-1">
                    {message.toolCalls.map((call, index) => (
                      <li key={`${message.id}-${index}`} className="font-mono text-[11px] text-muted-foreground">
                        {call.method} {call.path}{" "}
                        <span className={call.ok ? "" : "text-destructive"}>
                          {call.status || "failed"}
                          {call.ok ? "" : ` ${call.resultSummary}`}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}

            {isSending ? (
              <li className="flex items-start">
                <div className="flex items-center gap-2 rounded-2xl bg-secondary px-4 py-3 text-sm text-muted-foreground">
                  <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  Checking live data
                </div>
              </li>
            ) : null}
          </ul>
          <div ref={bottomRef} />
        </div>

        {error ? (
          <p className="border-t border-border px-6 py-3 text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}

        {suggestions.length > 0 && configured !== false ? (
          <div className="border-t border-border px-6 py-4">
            <Eyebrow>{isFresh ? "Try asking" : "Follow up"}</Eyebrow>
            <div className="mt-2 flex flex-wrap gap-2">
              {suggestions.map(suggestion => (
                <button
                  key={suggestion}
                  type="button"
                  disabled={disabled}
                  onClick={() => void send(suggestion)}
                  className="rounded-full border border-input px-3.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-50"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <form onSubmit={submit} className="flex items-center gap-3 border-t border-border p-4">
          <input
            value={input}
            onChange={event => setInput(event.target.value)}
            disabled={disabled}
            maxLength={2000}
            aria-label="Your question"
            placeholder={configured === false ? "Not available yet" : "Ask about a price, a position or a loan"}
            className="min-w-0 flex-1 rounded-full border border-input bg-background px-4 py-2.5 text-sm outline-none placeholder:text-muted-foreground/70 focus:ring-2 focus:ring-ring/40 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={disabled || !input.trim()}
            aria-label="Send"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-colors hover:bg-[var(--pine-deep)] disabled:opacity-40"
          >
            <PaperAirplaneIcon className="h-4 w-4" />
          </button>
          {!isFresh ? (
            <ActionButton tone="ghost" onClick={reset} disabled={isSending}>
              Clear
            </ActionButton>
          ) : null}
        </form>
      </Card>

      <p className="mt-6 text-xs leading-relaxed text-muted-foreground">
        The same operations are documented and callable yourself on the{" "}
        <Link href="/developer-api" className="underline underline-offset-4 hover:text-foreground">
          developer API
        </Link>{" "}
        page. Market data comes from{" "}
        <a
          href="https://github.com/binance/binance-skills-hub"
          target="_blank"
          rel="noreferrer"
          className="underline underline-offset-4 hover:text-foreground"
        >
          Binance agent skills
        </a>
        , and nothing the assistant does can move funds.
      </p>
    </div>
  );
};

export default AgentPage;
