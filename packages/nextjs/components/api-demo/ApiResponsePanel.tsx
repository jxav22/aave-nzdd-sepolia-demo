"use client";

import { useState } from "react";
import type { ApiCallResult } from "~~/utils/apiDemo";
import { isApiSuccess } from "~~/utils/apiDemo";

type ApiResponsePanelProps = {
  result: ApiCallResult | null;
  isLoading: boolean;
  emptyHint?: string;
};

export const ApiResponsePanel = ({ result, isLoading, emptyHint }: ApiResponsePanelProps) => {
  const [showRaw, setShowRaw] = useState(true);

  if (isLoading) {
    return (
      <div className="bg-base-200 rounded-lg p-6 flex flex-col items-center gap-2">
        <span className="loading loading-spinner loading-md" />
        <p className="text-sm opacity-70">Calling API…</p>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="bg-base-200 rounded-lg p-4 text-sm opacity-70">
        {emptyHint ?? "Run a request to see the response envelope here."}
      </div>
    );
  }

  const success =
    isApiSuccess(result.body) ||
    (result.ok && Boolean(result.body && typeof result.body === "object" && "openapi" in result.body));

  return (
    <div className="bg-base-200 rounded-lg p-4 flex flex-col gap-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`badge ${result.ok ? "badge-success" : "badge-error"}`}>HTTP {result.status}</span>
        <span className={`badge ${success ? "badge-success badge-outline" : "badge-error badge-outline"}`}>
          ok: {String(success)}
        </span>
        <span className="badge badge-ghost">{result.method}</span>
        <span className="badge badge-ghost">{result.durationMs} ms</span>
        {result.rateLimit.remaining !== null && (
          <span className="badge badge-ghost">
            rate {result.rateLimit.remaining}/{result.rateLimit.limit}
          </span>
        )}
        <button type="button" className="btn btn-ghost btn-xs ml-auto" onClick={() => setShowRaw(value => !value)}>
          {showRaw ? "Hide JSON" : "Show JSON"}
        </button>
      </div>
      <p className="text-xs opacity-60 break-all font-mono">
        {result.method} {result.url}
      </p>
      {showRaw && (
        <pre className="bg-base-100 rounded-md p-3 text-xs overflow-x-auto max-h-[32rem] whitespace-pre-wrap break-all">
          {typeof result.body === "string" ? result.body : JSON.stringify(result.body, null, 2)}
        </pre>
      )}
    </div>
  );
};
