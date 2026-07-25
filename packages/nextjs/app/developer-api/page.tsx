"use client";

import { FormEvent, type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import type { NextPage } from "next";
import { isAddress } from "viem";
import { useAccount } from "wagmi";
import {
  BookOpenIcon,
  ChartBarIcon,
  CodeBracketIcon,
  CpuChipIcon,
  MagnifyingGlassIcon,
  ShieldCheckIcon,
  WalletIcon,
} from "@heroicons/react/24/outline";
import { ApiResponsePanel } from "~~/components/api-demo/ApiResponsePanel";
import {
  API_ENDPOINTS,
  type ApiCallResult,
  type EndpointId,
  SIMULATE_DEFAULT_JSON,
  apiErrorMessage,
  callDeveloperApi,
  formatChange,
  formatPrice,
  formatUsdCompact,
  isApiSuccess,
  shortAddress,
} from "~~/utils/apiDemo";

const EXAMPLE_ADDRESS = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";

const ENDPOINT_ICONS: Record<EndpointId, ReactNode> = {
  overview: <BookOpenIcon className="h-4 w-4" />,
  "market-eth": <ChartBarIcon className="h-4 w-4" />,
  "token-search": <MagnifyingGlassIcon className="h-4 w-4" />,
  position: <WalletIcon className="h-4 w-4" />,
  "borrow-risk": <ShieldCheckIcon className="h-4 w-4" />,
  simulate: <CodeBracketIcon className="h-4 w-4" />,
};

type TokenHit = {
  chainId: string;
  chainLabel: string;
  contractAddress: string;
  name: string;
  symbol: string;
  iconUrl: string | null;
  priceUsd: number | null;
  change24hPercent: number | null;
  volume24hUsd: number | null;
  liquidityUsd: number | null;
};

const DeveloperApiPage: NextPage = () => {
  const { address: connectedAddress } = useAccount();
  const [active, setActive] = useState<EndpointId>("overview");
  const [result, setResult] = useState<ApiCallResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [walletAddress, setWalletAddress] = useState(EXAMPLE_ADDRESS);
  const [borrowAmount, setBorrowAmount] = useState("400");
  const [targetHf, setTargetHf] = useState("1.2");
  const [shockPercent, setShockPercent] = useState("20");
  const [tokenQuery, setTokenQuery] = useState("WETH");
  const [tokenChains, setTokenChains] = useState("1");
  const [simulateJson, setSimulateJson] = useState(SIMULATE_DEFAULT_JSON);
  const [openApiPaths, setOpenApiPaths] = useState<string[]>([]);

  useEffect(() => {
    if (connectedAddress) {
      setWalletAddress(connectedAddress);
    }
  }, [connectedAddress]);

  const run = useCallback(async (path: string, init?: RequestInit) => {
    setIsLoading(true);
    setFormError(null);
    try {
      const next = await callDeveloperApi(path, init);
      setResult(next);
      if (!next.ok) {
        setFormError(apiErrorMessage(next.body, `Request failed (${next.status})`));
      }
      return next;
    } catch (error) {
      setResult(null);
      setFormError(error instanceof Error ? error.message : "Request failed");
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      const next = await callDeveloperApi("/api/v1/openapi.json");
      setResult(next);
      if (isApiSuccess(next.body) === false && next.body && typeof next.body === "object" && "paths" in next.body) {
        setOpenApiPaths(Object.keys((next.body as { paths: Record<string, unknown> }).paths).sort());
      } else if (next.body && typeof next.body === "object" && "paths" in next.body) {
        setOpenApiPaths(Object.keys((next.body as { paths: Record<string, unknown> }).paths).sort());
      }
    })();
  }, []);

  const onSelectTab = (id: EndpointId) => {
    setActive(id);
    setFormError(null);
    if (id === "overview") {
      void run("/api/v1/openapi.json").then(next => {
        if (next?.body && typeof next.body === "object" && "paths" in next.body) {
          setOpenApiPaths(Object.keys((next.body as { paths: Record<string, unknown> }).paths).sort());
        }
      });
    } else if (id === "market-eth") {
      void run("/api/v1/market/eth");
    } else {
      setResult(null);
    }
  };

  const onPosition = (event: FormEvent) => {
    event.preventDefault();
    if (!isAddress(walletAddress)) {
      setFormError("Enter a valid Ethereum address.");
      return;
    }
    void run(`/api/v1/position/${walletAddress}`);
  };

  const onBorrowRisk = (event: FormEvent) => {
    event.preventDefault();
    if (!isAddress(walletAddress)) {
      setFormError("Enter a valid Ethereum address.");
      return;
    }
    const params = new URLSearchParams({
      address: walletAddress,
      borrowAmount: borrowAmount || "0",
      targetHealthFactor: targetHf,
      shockPercent,
    });
    void run(`/api/v1/borrow-risk?${params}`);
  };

  const onTokenSearch = (event: FormEvent) => {
    event.preventDefault();
    const q = tokenQuery.trim();
    if (!q) {
      setFormError("Enter a keyword.");
      return;
    }
    const params = new URLSearchParams({ q });
    if (tokenChains) {
      params.set("chainIds", tokenChains);
    }
    void run(`/api/v1/binance/token/search?${params}`);
  };

  const onSimulate = (event: FormEvent) => {
    event.preventDefault();
    let parsed: unknown;
    try {
      parsed = JSON.parse(simulateJson);
    } catch {
      setFormError("Simulate body must be valid JSON.");
      return;
    }
    void run("/api/v1/borrow-risk/simulate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(parsed),
    });
  };

  const marketSummary = useMemo(() => {
    if (!result || active !== "market-eth" || !isApiSuccess(result.body)) {
      return null;
    }
    return result.body.data as {
      price: { usd: number | null; change24hPercent: number | null };
      volatility: { dailySigmaPercent: number; maxDrawdown30dPercent: number };
      derivedScenarios: { label: string; ethPriceChangePercent: number; derivedFrom: string }[];
      provenance: { degraded: boolean; degradedReason: string | null; source: string; asOf: string };
    };
  }, [active, result]);

  const tokenHits = useMemo(() => {
    if (!result || active !== "token-search" || !isApiSuccess(result.body)) {
      return [] as TokenHit[];
    }
    const data = result.body.data as { results?: TokenHit[] };
    return (data.results ?? []).filter(hit => (hit.liquidityUsd ?? 0) >= 10_000).slice(0, 12);
  }, [active, result]);

  const borrowSummary = useMemo(() => {
    if (!result || active !== "borrow-risk" || !isApiSuccess(result.body)) {
      return null;
    }
    return result.body.data as {
      explanation?: string;
      disclaimer?: string;
      proposal?: {
        protocolMaximum?: { formatted: string; symbol: string };
        proposedBorrow?: { formatted: string; symbol: string };
        projectedHealthFactor?: { formatted: string };
        liquidationAtEthChangePercent?: number | null;
      };
      stressTest?: {
        stressTestedMaximum?: { formatted: string; symbol: string };
        cappedByProtocolMaximum?: boolean;
        shockEthPriceChangePercent?: number;
        targetHealthFactor?: { formatted: string };
      };
      scenarios?: {
        label: string;
        ethPriceChangePercent: number;
        projectedHealthFactor: { formatted: string };
        liquidatable: boolean;
        interpretation: string;
        derivedFrom: string;
      }[];
      marketContext?: { ethPriceUsd?: number | null; degraded?: boolean; source?: string };
      selfCheck?: { matches?: boolean };
      warnings?: string[];
      steps?: { tool?: string; detail?: string }[];
    };
  }, [active, result]);

  const positionSummary = useMemo(() => {
    if (!result || active !== "position" || !isApiSuccess(result.body)) {
      return null;
    }
    return result.body.data as {
      account?: {
        totalCollateralBase?: string;
        totalDebtBase?: string;
        availableBorrowsBase?: string;
        healthFactor?: { formatted?: string };
        currentLiquidationThresholdBps?: number;
      };
      borrowAsset?: {
        symbol?: string;
        userDebtFormatted?: string;
        poolLiquidityFormatted?: string;
      };
      market?: { marketId?: string; blockNumber?: string };
    };
  }, [active, result]);

  const simulateSummary = useMemo(() => {
    if (!result || active !== "simulate" || !isApiSuccess(result.body)) {
      return null;
    }
    return result.body.data as {
      projectedHealthFactor?: { formatted: string };
      liquidationAtEthChangePercent?: number | null;
      scenarioSource?: string;
      stressTest?: { stressTestedMaximumFormatted?: string; shockEthPriceChangePercent?: number };
      scenarios?: {
        label: string;
        ethPriceChangePercent: number;
        projectedHealthFactor: { formatted: string };
        liquidatable: boolean;
      }[];
      disclaimer?: string;
    };
  }, [active, result]);

  return (
    <div className="flex flex-col items-center grow pt-8 pb-16 px-4">
      <div className="w-full max-w-5xl flex flex-col gap-6">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <CpuChipIcon className="h-8 w-8 shrink-0" />
            Developer API
          </h1>
          <p className="mt-2 text-sm opacity-80">Public Borrow Risk Assistant API v1 playground</p>
          <p className="text-base font-medium">Open, unauthenticated, read-only. No API key. No wallet signature.</p>
          <p className="text-sm opacity-70 mt-1">
            Exercises the main published routes under <code>/api/v1/*</code>, including Binance-backed market context
            and the Ora Aave position / borrow-risk surface. Spec:{" "}
            <a className="link" href="/api/v1/openapi.json" target="_blank" rel="noreferrer">
              /api/v1/openapi.json
            </a>{" "}
            · docs: <code>docs/API.md</code>
          </p>
        </div>

        <div className="bg-base-200 rounded-lg p-4 text-sm flex flex-col gap-2">
          <p className="font-semibold">Surface</p>
          <div className="grid sm:grid-cols-2 gap-2">
            {API_ENDPOINTS.filter(endpoint => endpoint.id !== "overview").map(endpoint => (
              <button
                key={endpoint.id}
                type="button"
                className="text-left bg-base-100 border border-base-300 rounded-md px-3 py-2 hover:bg-base-300"
                onClick={() => onSelectTab(endpoint.id)}
              >
                <span className="font-mono text-xs opacity-70">
                  {endpoint.method} {endpoint.path}
                </span>
                <span className="block font-medium mt-0.5">{endpoint.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div role="tablist" className="tabs tabs-box flex-wrap bg-base-200 p-1 rounded-lg">
          {API_ENDPOINTS.map(endpoint => (
            <button
              key={endpoint.id}
              type="button"
              role="tab"
              className={`tab gap-2 ${active === endpoint.id ? "tab-active" : ""}`}
              onClick={() => onSelectTab(endpoint.id)}
            >
              {ENDPOINT_ICONS[endpoint.id]}
              {endpoint.label}
            </button>
          ))}
        </div>

        {formError && <p className="text-error text-sm">{formError}</p>}

        {active === "overview" && (
          <section className="flex flex-col gap-4">
            <div className="bg-base-200 rounded-lg p-4 text-sm flex flex-col gap-2">
              <p className="font-semibold">Conventions</p>
              <ul className="list-disc list-inside opacity-90 flex flex-col gap-1">
                <li>
                  Envelope: <code>{`{ ok, schemaVersion, data | error }`}</code>
                </li>
                <li>
                  Chain amounts are decimal strings with a <code>decimals</code> sibling, never JSON numbers.
                </li>
                <li>
                  CORS <code>*</code>, rate-limit headers on every response, Binance failure degrades (no 5xx).
                </li>
                <li>
                  Clients must render <code>disclaimer</code> and must not relabel stress maxima as “safe”.
                </li>
              </ul>
            </div>
            <div className="bg-base-200 rounded-lg p-4 text-sm">
              <p className="font-semibold mb-2">OpenAPI paths</p>
              {openApiPaths.length === 0 ? (
                <p className="opacity-70">Loading spec…</p>
              ) : (
                <ul className="font-mono text-xs flex flex-col gap-1">
                  {openApiPaths.map(path => (
                    <li key={path}>{path}</li>
                  ))}
                </ul>
              )}
            </div>
            <ApiResponsePanel result={result} isLoading={isLoading} emptyHint="OpenAPI document loads automatically." />
          </section>
        )}

        {active === "market-eth" && (
          <section className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm opacity-80 grow">
                <code>GET /api/v1/market/eth</code>: Binance skill dynamic + kline context (cached ~60s).
              </p>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={isLoading}
                onClick={() => void run("/api/v1/market/eth")}
              >
                Refresh
              </button>
            </div>
            {marketSummary && (
              <div className="bg-base-200 rounded-lg p-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                <div>
                  <p className="text-xs opacity-70">ETH price</p>
                  <p className="font-medium">{formatPrice(marketSummary.price.usd)}</p>
                </div>
                <div>
                  <p className="text-xs opacity-70">24h</p>
                  <p className="font-medium">{formatChange(marketSummary.price.change24hPercent)}</p>
                </div>
                <div>
                  <p className="text-xs opacity-70">Daily σ</p>
                  <p className="font-medium">{marketSummary.volatility.dailySigmaPercent.toFixed(2)}%</p>
                </div>
                <div>
                  <p className="text-xs opacity-70">30d drawdown</p>
                  <p className="font-medium">{marketSummary.volatility.maxDrawdown30dPercent.toFixed(2)}%</p>
                </div>
                {marketSummary.provenance.degraded && (
                  <p className="col-span-full text-warning text-xs">{marketSummary.provenance.degradedReason}</p>
                )}
                <div className="col-span-full overflow-x-auto">
                  <table className="table table-sm">
                    <thead>
                      <tr>
                        <th>Derived scenario</th>
                        <th>ETH Δ</th>
                        <th>From</th>
                      </tr>
                    </thead>
                    <tbody>
                      {marketSummary.derivedScenarios.map(scenario => (
                        <tr key={scenario.label}>
                          <td>{scenario.label}</td>
                          <td>{formatChange(scenario.ethPriceChangePercent)}</td>
                          <td>
                            <code className="text-xs">{scenario.derivedFrom}</code>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            <ApiResponsePanel result={result} isLoading={isLoading} />
          </section>
        )}

        {active === "token-search" && (
          <section className="flex flex-col gap-4">
            <p className="text-sm opacity-80">
              <code>GET /api/v1/binance/token/search</code>: Binance <code>query-token-info</code> search skill proxy.
            </p>
            <form onSubmit={onTokenSearch} className="bg-base-200 rounded-lg p-4 flex flex-col sm:flex-row gap-2">
              <input
                className="input input-bordered grow"
                value={tokenQuery}
                onChange={event => setTokenQuery(event.target.value)}
                placeholder="WETH, NZDD, BNB…"
                maxLength={64}
              />
              <select
                className="select select-bordered"
                value={tokenChains}
                onChange={event => setTokenChains(event.target.value)}
              >
                <option value="">All chains</option>
                <option value="1">Ethereum</option>
                <option value="56">BSC</option>
                <option value="8453">Base</option>
                <option value="CT_501">Solana</option>
              </select>
              <button type="submit" className="btn btn-primary" disabled={isLoading}>
                Search
              </button>
            </form>
            {tokenHits.length > 0 && (
              <div className="overflow-x-auto rounded-lg border border-base-300">
                <table className="table table-sm">
                  <thead>
                    <tr>
                      <th>Token</th>
                      <th>Chain</th>
                      <th>Price</th>
                      <th>24h</th>
                      <th>Liquidity</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tokenHits.map(hit => (
                      <tr key={`${hit.chainId}-${hit.contractAddress}`}>
                        <td>
                          <div className="flex items-center gap-2">
                            {hit.iconUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={hit.iconUrl} alt="" className="h-5 w-5 rounded-full" />
                            ) : (
                              <span className="h-5 w-5 rounded-full bg-base-300 inline-block" />
                            )}
                            <div className="flex flex-col">
                              <span className="font-medium">{hit.symbol}</span>
                              <span className="text-xs opacity-60">
                                {hit.name || shortAddress(hit.contractAddress)}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td>{hit.chainLabel}</td>
                        <td>{formatPrice(hit.priceUsd)}</td>
                        <td>{formatChange(hit.change24hPercent)}</td>
                        <td>{formatUsdCompact(hit.liquidityUsd)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <ApiResponsePanel
              result={result}
              isLoading={isLoading}
              emptyHint="Search for a token to call the agent skill."
            />
          </section>
        )}

        {active === "position" && (
          <section className="flex flex-col gap-4">
            <p className="text-sm opacity-80">
              <code>GET /api/v1/position/{"{address}"}</code>: raw Aave position read (RPC).
            </p>
            <form onSubmit={onPosition} className="bg-base-200 rounded-lg p-4 flex flex-col sm:flex-row gap-2">
              <input
                className="input input-bordered grow font-mono text-sm"
                value={walletAddress}
                onChange={event => setWalletAddress(event.target.value)}
                placeholder="0x…"
              />
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setWalletAddress(connectedAddress ?? EXAMPLE_ADDRESS)}
              >
                {connectedAddress ? "Use connected" : "Example"}
              </button>
              <button type="submit" className="btn btn-primary" disabled={isLoading}>
                Read position
              </button>
            </form>
            {positionSummary && (
              <div className="bg-base-200 rounded-lg p-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                <div>
                  <p className="text-xs opacity-70">Collateral (base)</p>
                  <p className="font-medium font-mono text-xs">{positionSummary.account?.totalCollateralBase ?? "-"}</p>
                </div>
                <div>
                  <p className="text-xs opacity-70">Debt (base)</p>
                  <p className="font-medium font-mono text-xs">{positionSummary.account?.totalDebtBase ?? "-"}</p>
                </div>
                <div>
                  <p className="text-xs opacity-70">Health factor</p>
                  <p className="font-medium">{positionSummary.account?.healthFactor?.formatted ?? "-"}</p>
                </div>
                <div>
                  <p className="text-xs opacity-70">Available borrows (base)</p>
                  <p className="font-medium font-mono text-xs">
                    {positionSummary.account?.availableBorrowsBase ?? "-"}
                  </p>
                </div>
                <div className="col-span-full text-xs opacity-70">
                  Market {positionSummary.market?.marketId ?? "-"} · block {positionSummary.market?.blockNumber ?? "-"}{" "}
                  · user debt {positionSummary.borrowAsset?.userDebtFormatted ?? "-"} · pool liquidity{" "}
                  {positionSummary.borrowAsset?.poolLiquidityFormatted ?? "-"}{" "}
                  {positionSummary.borrowAsset?.symbol ?? ""}
                </div>
              </div>
            )}
            <ApiResponsePanel result={result} isLoading={isLoading} />
          </section>
        )}

        {active === "borrow-risk" && (
          <section className="flex flex-col gap-4">
            <p className="text-sm opacity-80">
              <code>GET /api/v1/borrow-risk</code>: full assistant, position + Binance context + stress scenarios +
              agent steps.
            </p>
            <form onSubmit={onBorrowRisk} className="bg-base-200 rounded-lg p-4 flex flex-col gap-3">
              <input
                className="input input-bordered font-mono text-sm"
                value={walletAddress}
                onChange={event => setWalletAddress(event.target.value)}
                placeholder="0x…"
              />
              <div className="grid sm:grid-cols-3 gap-2">
                <label className="form-control">
                  <span className="label-text text-xs">Borrow amount (dNZD)</span>
                  <input
                    className="input input-bordered"
                    value={borrowAmount}
                    onChange={event => setBorrowAmount(event.target.value)}
                  />
                </label>
                <label className="form-control">
                  <span className="label-text text-xs">Target HF</span>
                  <select
                    className="select select-bordered"
                    value={targetHf}
                    onChange={event => setTargetHf(event.target.value)}
                  >
                    <option value="1.1">1.1</option>
                    <option value="1.2">1.2</option>
                    <option value="1.5">1.5</option>
                  </select>
                </label>
                <label className="form-control">
                  <span className="label-text text-xs">Shock %</span>
                  <select
                    className="select select-bordered"
                    value={shockPercent}
                    onChange={event => setShockPercent(event.target.value)}
                  >
                    <option value="10">10%</option>
                    <option value="20">20%</option>
                    <option value="30">30%</option>
                  </select>
                </label>
              </div>
              <button type="submit" className="btn btn-primary self-start" disabled={isLoading}>
                Run borrow-risk
              </button>
            </form>
            {borrowSummary && (
              <div className="bg-base-200 rounded-lg p-4 flex flex-col gap-3 text-sm">
                {borrowSummary.explanation && <p>{borrowSummary.explanation}</p>}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <p className="text-xs opacity-70">Protocol max</p>
                    <p className="font-medium">
                      {borrowSummary.proposal?.protocolMaximum?.formatted ?? "-"}{" "}
                      {borrowSummary.proposal?.protocolMaximum?.symbol ?? ""}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs opacity-70">Stress-tested max</p>
                    <p className="font-medium">
                      {borrowSummary.stressTest?.stressTestedMaximum?.formatted ?? "-"}{" "}
                      {borrowSummary.stressTest?.stressTestedMaximum?.symbol ?? ""}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs opacity-70">Projected HF</p>
                    <p className="font-medium">{borrowSummary.proposal?.projectedHealthFactor?.formatted ?? "-"}</p>
                  </div>
                  <div>
                    <p className="text-xs opacity-70">Liq. at ETH Δ</p>
                    <p className="font-medium">
                      {borrowSummary.proposal?.liquidationAtEthChangePercent != null
                        ? formatChange(borrowSummary.proposal.liquidationAtEthChangePercent)
                        : "-"}
                    </p>
                  </div>
                </div>
                {borrowSummary.scenarios && borrowSummary.scenarios.length > 0 && (
                  <div className="overflow-x-auto">
                    <table className="table table-sm">
                      <thead>
                        <tr>
                          <th>Scenario</th>
                          <th>ETH Δ</th>
                          <th>HF</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {borrowSummary.scenarios.map(scenario => (
                          <tr key={scenario.label}>
                            <td>{scenario.label}</td>
                            <td>{formatChange(scenario.ethPriceChangePercent)}</td>
                            <td className={scenario.liquidatable ? "text-error" : ""}>
                              {scenario.projectedHealthFactor.formatted}
                            </td>
                            <td className="text-xs">{scenario.interpretation}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {borrowSummary.warnings && borrowSummary.warnings.length > 0 && (
                  <ul className="text-warning text-xs list-disc list-inside">
                    {borrowSummary.warnings.map(warning => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                )}
                {borrowSummary.disclaimer && <p className="text-xs opacity-60">{borrowSummary.disclaimer}</p>}
              </div>
            )}
            <ApiResponsePanel result={result} isLoading={isLoading} />
          </section>
        )}

        {active === "simulate" && (
          <section className="flex flex-col gap-4">
            <p className="text-sm opacity-80">
              <code>POST /api/v1/borrow-risk/simulate</code>: bring-your-own position. No wallet / chain read. Omit{" "}
              <code>shocksBps</code> to derive scenarios from Binance; supply them for a deterministic run.
            </p>
            <form onSubmit={onSimulate} className="bg-base-200 rounded-lg p-4 flex flex-col gap-3">
              <textarea
                className="textarea textarea-bordered font-mono text-xs min-h-56"
                value={simulateJson}
                onChange={event => setSimulateJson(event.target.value)}
                spellCheck={false}
              />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => setSimulateJson(SIMULATE_DEFAULT_JSON)}
                >
                  Reset example
                </button>
                <button type="submit" className="btn btn-primary btn-sm" disabled={isLoading}>
                  Simulate
                </button>
              </div>
            </form>
            {simulateSummary && (
              <div className="bg-base-200 rounded-lg p-4 flex flex-col gap-3 text-sm">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <p className="text-xs opacity-70">Projected HF</p>
                    <p className="font-medium">{simulateSummary.projectedHealthFactor?.formatted ?? "-"}</p>
                  </div>
                  <div>
                    <p className="text-xs opacity-70">Stress max (base)</p>
                    <p className="font-medium">{simulateSummary.stressTest?.stressTestedMaximumFormatted ?? "-"}</p>
                  </div>
                  <div>
                    <p className="text-xs opacity-70">Scenario source</p>
                    <p className="font-medium font-mono text-xs">{simulateSummary.scenarioSource ?? "-"}</p>
                  </div>
                  <div>
                    <p className="text-xs opacity-70">Liq. at ETH Δ</p>
                    <p className="font-medium">
                      {simulateSummary.liquidationAtEthChangePercent != null
                        ? formatChange(simulateSummary.liquidationAtEthChangePercent)
                        : "-"}
                    </p>
                  </div>
                </div>
                {simulateSummary.disclaimer && <p className="text-xs opacity-60">{simulateSummary.disclaimer}</p>}
              </div>
            )}
            <ApiResponsePanel result={result} isLoading={isLoading} />
          </section>
        )}
      </div>
    </div>
  );
};

export default DeveloperApiPage;
