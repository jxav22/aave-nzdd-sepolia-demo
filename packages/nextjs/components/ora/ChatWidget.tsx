"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChatBubbleOvalLeftEllipsisIcon, PaperAirplaneIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { Eyebrow } from "~~/components/ora/primitives";
import { plainText, useApiAgentChat } from "~~/hooks/useApiAgentChat";

/**
 * Floating assistant, bottom right of every page.
 *
 * Answers come from real calls to the public API rather than from the model's own knowledge,
 * so the tool trace is shown under each reply. Suggested questions are supplied by the API
 * itself (generated from the OpenAPI document), which keeps them in step with whatever the
 * API can actually answer instead of a hardcoded list that quietly goes stale.
 */

const PANEL_WELCOME =
  "Kia ora. Ask me about rates, prices, an account's position, or how a loan would hold up if ETH fell.";

export const ChatWidget = () => {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const { messages, send, isSending, error, configured, suggestions, envHint, isFresh, toolCount } = useApiAgentChat({
    welcome: PANEL_WELCOME,
  });

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isSending, open]);

  useEffect(() => {
    if (open) {
      inputRef.current?.focus();
    }
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const text = input;
    setInput("");
    void send(text);
  };

  const disabled = isSending || configured === false;
  // Three reads as a set of examples without turning the panel into a menu.
  const visibleSuggestions = suggestions.slice(0, 3);

  return (
    <>
      {/* Launcher */}
      <button
        type="button"
        onClick={() => setOpen(value => !value)}
        aria-expanded={open}
        aria-controls="ora-assistant"
        aria-label={open ? "Close the assistant" : "Open the assistant"}
        className={`fixed bottom-5 right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-[0_10px_30px_-10px_rgba(20,40,30,0.5)] transition-transform hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 ${
          open ? "scale-95" : ""
        }`}
      >
        {open ? <XMarkIcon className="h-6 w-6" /> : <ChatBubbleOvalLeftEllipsisIcon className="h-6 w-6" aria-hidden />}
      </button>

      {/*
        Panel. The height cap leaves 11rem clear: 6rem down to the launcher, 4rem for the sticky
        header, and a little room between the two so the panel never sits on top of the header.
      */}
      {open ? (
        <div
          id="ora-assistant"
          ref={panelRef}
          role="dialog"
          aria-label="Ora assistant"
          className="fixed bottom-24 right-5 z-50 flex max-h-[min(38rem,calc(100svh-11rem))] w-[min(24rem,calc(100vw-2.5rem))] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-[0_24px_70px_-24px_rgba(20,40,30,0.45)]"
        >
          <header className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
            <div>
              <Eyebrow>Ask Ora</Eyebrow>
              <p className="mt-1 text-sm leading-snug text-muted-foreground">
                {configured === false
                  ? "The assistant is not switched on yet."
                  : `Answers come from live data, not guesswork.`}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close the assistant"
              className="rounded-lg p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              <XMarkIcon className="h-4 w-4" />
            </button>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-5 py-4">
            <ul className="flex flex-col gap-3">
              {messages.map(message => (
                <li
                  key={message.id}
                  className={`flex flex-col ${message.role === "user" ? "items-end" : "items-start"}`}
                >
                  <div
                    className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                      message.role === "user" ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground"
                    }`}
                  >
                    {message.role === "assistant" ? plainText(message.content) : message.content}
                  </div>

                  {message.toolCalls && message.toolCalls.length > 0 ? (
                    <details className="mt-1.5 max-w-[85%]">
                      <summary className="cursor-pointer text-[11px] text-muted-foreground hover:text-foreground">
                        {message.toolCalls.length === 1
                          ? "1 API call behind this"
                          : `${message.toolCalls.length} API calls behind this`}
                      </summary>
                      <ul className="mt-1 flex flex-col gap-0.5">
                        {message.toolCalls.map((call, index) => (
                          <li
                            key={`${message.id}-${index}`}
                            className="font-mono text-[10px] break-all text-muted-foreground"
                          >
                            {call.method} {call.path}{" "}
                            <span className={call.ok ? "" : "text-destructive"}>{call.status || "failed"}</span>
                          </li>
                        ))}
                      </ul>
                    </details>
                  ) : null}
                </li>
              ))}

              {isSending ? (
                <li className="flex items-start">
                  <div className="flex items-center gap-2 rounded-2xl bg-secondary px-3.5 py-2.5 text-sm text-muted-foreground">
                    <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    Checking live data
                  </div>
                </li>
              ) : null}
            </ul>
            <div ref={bottomRef} />
          </div>

          {configured === false ? (
            <div className="border-t border-border bg-[var(--clay)]/10 px-5 py-3 text-xs leading-relaxed">
              <p className="font-medium">The assistant needs a language model key.</p>
              <p className="mt-1 text-muted-foreground">{envHint}</p>
            </div>
          ) : null}

          {error ? (
            <p className="border-t border-border px-5 py-3 text-xs text-destructive" role="alert">
              {error}
            </p>
          ) : null}

          {/*
            An empty conversation has nothing to read, so the prompts can wrap and fill it. Once
            there are messages the transcript is what matters, so follow-ups collapse to a single
            row that scrolls sideways. Left to wrap, full-length questions stack several lines
            deep and take half the panel away from the conversation.
          */}
          {visibleSuggestions.length > 0 && configured !== false ? (
            <div className="shrink-0 border-t border-border px-5 py-3">
              <Eyebrow>{isFresh ? "Try asking" : "Follow up"}</Eyebrow>
              <div
                className={
                  isFresh
                    ? "mt-2 flex max-h-[7.5rem] flex-wrap gap-2 overflow-y-auto"
                    : "mt-2 flex gap-2 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                }
              >
                {visibleSuggestions.map(suggestion => (
                  <button
                    key={suggestion}
                    type="button"
                    disabled={disabled}
                    title={suggestion}
                    onClick={() => void send(suggestion)}
                    className={`rounded-full border border-input px-3 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-50 ${
                      isFresh ? "" : "max-w-[13rem] shrink-0 truncate"
                    }`}
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <form onSubmit={submit} className="flex items-center gap-2 border-t border-border px-4 py-3">
            <input
              ref={inputRef}
              value={input}
              onChange={event => setInput(event.target.value)}
              disabled={disabled}
              maxLength={2000}
              aria-label="Your question"
              placeholder={configured === false ? "Not available yet" : "Ask a question"}
              className="min-w-0 flex-1 rounded-full border border-input bg-background px-4 py-2 text-sm outline-none placeholder:text-muted-foreground/70 focus:ring-2 focus:ring-ring/40 disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={disabled || !input.trim()}
              aria-label="Send"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-colors hover:bg-[var(--pine-deep)] disabled:opacity-40"
            >
              <PaperAirplaneIcon className="h-4 w-4" />
            </button>
          </form>

          <div className="border-t border-border px-5 py-2.5">
            <Link
              href="/binance-chat"
              className="text-[11px] text-muted-foreground underline underline-offset-4 hover:text-foreground"
            >
              Open the full view{toolCount > 0 ? ` (${toolCount} API operations)` : ""}
            </Link>
          </div>
        </div>
      ) : null}
    </>
  );
};
