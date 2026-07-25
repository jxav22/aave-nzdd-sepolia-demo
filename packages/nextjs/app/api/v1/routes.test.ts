/**
 * Handler-level tests for the public v1 API.
 *
 * Routes are exercised as plain functions over `Request`/`Response`, so no server and no
 * network are involved. Chain reads are stubbed; the simulate route needs neither.
 */
import { GET as getChatStatus, POST as postChat } from "./binance/chat/route";
import { POST as simulate } from "./borrow-risk/simulate/route";
import { GET as getMarket } from "./market/eth/route";
import { GET as getOpenApi } from "./openapi.json/route";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetRateLimits } from "~~/services/api/rateLimit";
import { SCHEMA_VERSION } from "~~/services/api/respond";
import { resetEthMarketCache } from "~~/services/binance/ethMarket";
import { FORBIDDEN_PHRASES } from "~~/utils/risk/wording";

const KLINE_PAYLOAD = {
  data: [
    ["1600", "1660", "1530", "1566", "1000", 1782345600000, 10],
    ["1566", "1593", "1514", "1586", "1000", 1782432000000, 10],
    ["1586", "1610", "1562", "1568", "1000", 1782518400000, 10],
  ],
};

const DYNAMIC_PAYLOAD = {
  code: "000000",
  data: { price: "1854.43", percentChange24h: "-1.6", priceHigh24h: "1958.09", priceLow24h: "1845.93" },
};

function stubBinance() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL) => ({
      ok: true,
      status: 200,
      json: async () => (String(input).includes("k-line") ? KLINE_PAYLOAD : DYNAMIC_PAYLOAD),
    })) as never,
  );
}

/** 1 wETH booked at the market's 1800 oracle price, in 8-decimal base units. */
const ONE_WETH_BASE = "180000000000";

function simulateRequest(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("https://example.test/api/v1/borrow-risk/simulate", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": "203.0.113.1", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

async function readJson(response: Response) {
  return (await response.json()) as Record<string, never>;
}

describe("POST /api/v1/borrow-risk/simulate", () => {
  beforeEach(() => {
    resetRateLimits();
    resetEthMarketCache();
    stubBinance();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the success envelope with a schema version", async () => {
    const response = await simulate(
      simulateRequest({
        collateral: [{ symbol: "WETH", valueBase: ONE_WETH_BASE, liquidationThresholdBps: 8600 }],
        proposedBorrowBase: "120000000000",
        shocksBps: [-1000, -2000, -2500],
      }),
    );
    const body = await readJson(response);

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ ok: true, schemaVersion: SCHEMA_VERSION });
  });

  it("reproduces the documented stress table for a 1 wETH position", async () => {
    const response = await simulate(
      simulateRequest({
        collateral: [{ symbol: "WETH", valueBase: ONE_WETH_BASE, liquidationThresholdBps: 8600 }],
        proposedBorrowBase: "120000000000",
        shocksBps: [-1000, -2000, -2500],
      }),
    );
    const { data } = (await response.json()) as {
      data: {
        projectedHealthFactor: { formatted: string };
        scenarios: {
          ethPriceChangePercent: number;
          projectedHealthFactor: { formatted: string };
          liquidatable: boolean;
        }[];
        liquidationAtEthChangePercent: number;
      };
    };

    expect(data.projectedHealthFactor.formatted).toBe("1.29");
    expect(
      data.scenarios.map(s => [s.ethPriceChangePercent, s.projectedHealthFactor.formatted, s.liquidatable]),
    ).toEqual([
      [0, "1.29", false],
      [-10, "1.16", false],
      [-20, "1.03", false],
      [-25, "0.96", true],
    ]);
    expect(data.liquidationAtEthChangePercent).toBe(-22.48);
  });

  it("returns every numeric chain quantity as a string, never a JSON number", async () => {
    const response = await simulate(
      simulateRequest({
        collateral: [{ symbol: "WETH", valueBase: ONE_WETH_BASE, liquidationThresholdBps: 8600 }],
        proposedBorrowBase: "120000000000",
        shocksBps: [-2000],
      }),
    );
    const { data } = (await response.json()) as {
      data: {
        projectedHealthFactor: { raw: unknown };
        stressTest: { stressTestedMaximumBase: unknown; targetHealthFactor: { raw: unknown } };
        input: { existingDebtBase: unknown };
      };
    };

    expect(typeof data.projectedHealthFactor.raw).toBe("string");
    expect(typeof data.stressTest.stressTestedMaximumBase).toBe("string");
    expect(typeof data.stressTest.targetHealthFactor.raw).toBe("string");
    expect(typeof data.input.existingDebtBase).toBe("string");
  });

  it("skips the Binance call entirely when the caller supplies scenarios", async () => {
    const response = await simulate(
      simulateRequest({
        collateral: [{ valueBase: ONE_WETH_BASE, liquidationThresholdBps: 8600 }],
        shocksBps: [-2000],
      }),
    );
    const { data } = (await response.json()) as { data: { scenarioSource: string; marketContext: unknown } };

    expect(data.scenarioSource).toBe("caller-supplied");
    expect(data.marketContext).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("derives scenarios from Binance data when none are supplied", async () => {
    const response = await simulate(
      simulateRequest({
        collateral: [{ valueBase: ONE_WETH_BASE, liquidationThresholdBps: 8600 }],
        proposedBorrowBase: "120000000000",
      }),
    );
    const { data } = (await response.json()) as {
      data: { scenarioSource: string; marketContext: { degraded: boolean }; scenarios: { derivedFrom: string }[] };
    };

    expect(data.scenarioSource).toBe("binance-market-data");
    expect(data.marketContext.degraded).toBe(false);
    expect(data.scenarios.some(s => s.derivedFrom === "volatility")).toBe(true);
  });

  it("holds unshockable collateral at its current value", async () => {
    const response = await simulate(
      simulateRequest({
        collateral: [
          { symbol: "WETH", valueBase: ONE_WETH_BASE, liquidationThresholdBps: 8600, shockable: true },
          { symbol: "dNZD", valueBase: "100000000000", liquidationThresholdBps: 8600, shockable: false },
        ],
        proposedBorrowBase: "120000000000",
        shocksBps: [-10000],
      }),
    );
    const { data } = (await response.json()) as {
      data: { scenarios: { projectedHealthFactor: { formatted: string } }[] };
    };

    // wETH wiped out; 1000 base of dNZD at 86% still covers 1200 of debt at HF 0.71.
    expect(data.scenarios[1].projectedHealthFactor.formatted).toBe("0.71");
  });

  it("never recommends a borrow that fails the requested stress", async () => {
    const response = await simulate(
      simulateRequest({
        collateral: [{ valueBase: ONE_WETH_BASE, liquidationThresholdBps: 8600 }],
        targetHealthFactor: "1.2",
        shockPercent: 20,
        shocksBps: [-2000],
      }),
    );
    const { data } = (await response.json()) as { data: { stressTest: { stressTestedMaximumBase: string } } };

    // 1800 x 0.8 x 0.86 / 1.2 = 1032
    expect(data.stressTest.stressTestedMaximumBase).toBe("103200000000");
  });

  it("never emits a phrase that overstates certainty", async () => {
    const response = await simulate(
      simulateRequest({
        collateral: [{ valueBase: ONE_WETH_BASE, liquidationThresholdBps: 8600 }],
        proposedBorrowBase: "120000000000",
        shocksBps: [-2000],
      }),
    );
    const text = JSON.stringify(await response.json()).toLowerCase();

    for (const phrase of FORBIDDEN_PHRASES) {
      // "financial advice" is permitted only inside the disclaimer's negation.
      if (phrase === "financial advice") {
        expect(text).toContain("not financial advice");
        continue;
      }
      expect(text).not.toContain(phrase);
    }
  });

  it("always carries a disclaimer and its sources", async () => {
    const response = await simulate(
      simulateRequest({
        collateral: [{ valueBase: ONE_WETH_BASE, liquidationThresholdBps: 8600 }],
        shocksBps: [-2000],
      }),
    );
    const { data } = (await response.json()) as { data: { disclaimer: string; sources: string[] } };

    expect(data.disclaimer).toMatch(/not financial advice/i);
    expect(data.sources.length).toBeGreaterThan(0);
  });

  describe("validation", () => {
    const cases: [string, unknown, string, string][] = [
      ["missing collateral", {}, "INVALID_BODY", "collateral"],
      ["empty collateral", { collateral: [] }, "INVALID_BODY", "collateral"],
      [
        "out-of-range liquidation threshold",
        { collateral: [{ valueBase: "1", liquidationThresholdBps: 20000 }] },
        "INVALID_BODY",
        "collateral",
      ],
      [
        "non-integer base units",
        { collateral: [{ valueBase: "1.5", liquidationThresholdBps: 8600 }] },
        "INVALID_BODY",
        "collateral[0].valueBase",
      ],
      [
        "target health factor below 1",
        { collateral: [{ valueBase: "1", liquidationThresholdBps: 8600 }], targetHealthFactor: "0.9" },
        "INVALID_TARGET_HEALTH_FACTOR",
        "targetHealthFactor",
      ],
      [
        "shock beyond 100%",
        { collateral: [{ valueBase: "1", liquidationThresholdBps: 8600 }], shockPercent: 150 },
        "INVALID_SHOCK",
        "shockPercent",
      ],
      [
        "positive shocksBps entry",
        { collateral: [{ valueBase: "1", liquidationThresholdBps: 8600 }], shocksBps: [500] },
        "INVALID_BODY",
        "shocksBps",
      ],
    ];

    it.each(cases)("rejects %s with a stable error code", async (_label, body, code, field) => {
      const response = await simulate(simulateRequest(body));
      const parsed = (await response.json()) as { ok: boolean; error: { code: string; field: string } };

      expect(response.status).toBe(400);
      expect(parsed.ok).toBe(false);
      expect(parsed.error.code).toBe(code);
      expect(parsed.error.field).toBe(field);
    });

    it("rejects a malformed JSON body", async () => {
      const response = await simulate(simulateRequest("{not json"));
      const parsed = (await response.json()) as { error: { code: string } };

      expect(response.status).toBe(400);
      expect(parsed.error.code).toBe("INVALID_BODY");
    });
  });

  describe("rate limiting", () => {
    it("returns 429 with Retry-After once the bucket is empty", async () => {
      const body = { collateral: [{ valueBase: ONE_WETH_BASE, liquidationThresholdBps: 8600 }], shocksBps: [-2000] };

      let last: Response | undefined;
      for (let i = 0; i < 122; i++) {
        last = await simulate(simulateRequest(body, { "x-forwarded-for": "198.51.100.7" }));
      }

      expect(last!.status).toBe(429);
      expect(last!.headers.get("Retry-After")).toBeTruthy();
      expect((await readJson(last!)) as unknown).toMatchObject({ ok: false, error: { code: "RATE_LIMITED" } });
    });

    it("counts each client independently", async () => {
      const body = { collateral: [{ valueBase: ONE_WETH_BASE, liquidationThresholdBps: 8600 }], shocksBps: [-2000] };

      for (let i = 0; i < 121; i++) {
        await simulate(simulateRequest(body, { "x-forwarded-for": "198.51.100.8" }));
      }
      const other = await simulate(simulateRequest(body, { "x-forwarded-for": "198.51.100.9" }));

      expect(other.status).toBe(200);
    });

    it("advertises the remaining budget on every response", async () => {
      const response = await simulate(
        simulateRequest({
          collateral: [{ valueBase: ONE_WETH_BASE, liquidationThresholdBps: 8600 }],
          shocksBps: [-2000],
        }),
      );

      expect(response.headers.get("X-RateLimit-Limit")).toBe("120");
      expect(Number(response.headers.get("X-RateLimit-Remaining"))).toBeGreaterThanOrEqual(0);
      expect(response.headers.get("X-RateLimit-Reset")).toBeTruthy();
    });
  });
});

describe("GET /api/v1/market/eth", () => {
  beforeEach(() => {
    resetRateLimits();
    resetEthMarketCache();
    stubBinance();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function marketRequest(): Request {
    return new Request("https://example.test/api/v1/market/eth", { headers: { "x-forwarded-for": "203.0.113.2" } });
  }

  it("exposes volatility, drawdown and the scenarios derived from them", async () => {
    const response = await getMarket(marketRequest());
    const { data } = (await response.json()) as {
      data: {
        volatility: { dailySigmaPercent: number; maxDrawdown30dPercent: number };
        derivedScenarios: { ethPriceChangePercent: number }[];
        provenance: { authenticationRequired: boolean; endpoints: string[]; degraded: boolean };
      };
    };

    expect(response.status).toBe(200);
    expect(data.volatility.dailySigmaPercent).toBeGreaterThan(0);
    expect(data.volatility.maxDrawdown30dPercent).toBeLessThan(0);
    expect(data.derivedScenarios.length).toBeGreaterThan(1);
    expect(data.provenance.degraded).toBe(false);
  });

  it("declares that the upstream endpoints need no authentication", async () => {
    const response = await getMarket(marketRequest());
    const { data } = (await response.json()) as {
      data: { provenance: { authenticationRequired: boolean; endpoints: string[] } };
    };

    expect(data.provenance.authenticationRequired).toBe(false);
    expect(data.provenance.endpoints).toHaveLength(2);
    for (const endpoint of data.provenance.endpoints) {
      expect(endpoint).not.toMatch(/api[_-]?key|signature/i);
    }
  });

  it("degrades to fixed scenarios instead of failing when Binance is unreachable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      }) as never,
    );

    const response = await getMarket(marketRequest());
    const { data } = (await response.json()) as {
      data: { provenance: { degraded: boolean; degradedReason: string }; derivedScenarios: { derivedFrom: string }[] };
    };

    expect(response.status).toBe(200);
    expect(data.provenance.degraded).toBe(true);
    expect(data.provenance.degradedReason).toMatch(/network down/);
    expect(data.derivedScenarios.every(s => s.derivedFrom === "current" || s.derivedFrom === "fallback")).toBe(true);
  });

  it("is cacheable so public traffic cannot fan out to Binance", async () => {
    const response = await getMarket(marketRequest());
    expect(response.headers.get("Cache-Control")).toMatch(/max-age=30/);
  });
});

describe("CORS", () => {
  beforeEach(() => {
    resetRateLimits();
    resetEthMarketCache();
    stubBinance();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("allows any origin on a successful response", async () => {
    const response = await getMarket(new Request("https://example.test/api/v1/market/eth"));

    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });

  it("allows any origin on an error response too", async () => {
    const response = await simulate(simulateRequest({}));

    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });
});

describe("GET /api/v1/binance/chat", () => {
  beforeEach(() => {
    resetRateLimits();
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("reports when OpenAI is not configured", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    const response = await getChatStatus(
      new Request("https://example.test/api/v1/binance/chat", { headers: { "x-forwarded-for": "203.0.113.9" } }),
    );
    const body = await readJson(response);

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      data: { configured: false, toolSource: "GET /api/v1/openapi.json" },
    });
  });

  it("advertises the API operations it can call and starter prompts, but never itself", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    const response = await getChatStatus(
      new Request("https://example.test/api/v1/binance/chat", { headers: { "x-forwarded-for": "203.0.113.12" } }),
    );
    const { data } = (await response.json()) as {
      data: { tools: { name: string; method: string; path: string }[]; suggestions: string[] };
    };

    expect(data.tools.length).toBeGreaterThan(0);
    expect(data.tools.map(entry => entry.path)).not.toContain("/api/v1/binance/chat");
    expect(data.suggestions.length).toBeGreaterThan(0);
  });
});

describe("POST /api/v1/binance/chat", () => {
  beforeEach(() => {
    resetRateLimits();
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns MISSING_CONFIG when OPENAI_API_KEY is absent", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    const response = await postChat(
      new Request("https://example.test/api/v1/binance/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-forwarded-for": "203.0.113.10" },
        body: JSON.stringify({ messages: [{ role: "user", content: "price of ETH" }] }),
      }),
    );
    const body = await readJson(response);

    expect(response.status).toBe(503);
    expect(body).toMatchObject({
      ok: false,
      schemaVersion: SCHEMA_VERSION,
      error: { code: "MISSING_CONFIG" },
    });
  });

  it("rejects an empty messages body", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    const response = await postChat(
      new Request("https://example.test/api/v1/binance/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-forwarded-for": "203.0.113.11" },
        body: JSON.stringify({ messages: [] }),
      }),
    );
    const body = await readJson(response);

    expect(response.status).toBe(400);
    expect(body).toMatchObject({ ok: false, error: { code: "INVALID_BODY", field: "messages" } });
  });
});

describe("GET /api/v1/openapi.json", () => {
  it("describes every public route against the requesting origin", async () => {
    const response = getOpenApi(new Request("https://example.test/api/v1/openapi.json"));
    const document = (await response.json()) as {
      openapi: string;
      servers: { url: string }[];
      paths: Record<string, unknown>;
    };

    expect(document.openapi).toBe("3.1.0");
    expect(document.servers[0].url).toBe("https://example.test");
    expect(Object.keys(document.paths).sort()).toEqual([
      "/api/v1/binance/chat",
      "/api/v1/binance/token/dynamic",
      "/api/v1/binance/token/meta",
      "/api/v1/binance/token/search",
      "/api/v1/borrow-risk",
      "/api/v1/borrow-risk/simulate",
      "/api/v1/market/eth",
      "/api/v1/position/{address}",
    ]);
  });

  it("is served as cacheable JSON with CORS", async () => {
    const response = getOpenApi(new Request("https://example.test/api/v1/openapi.json"));

    expect(response.headers.get("Content-Type")).toBe("application/json");
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(response.headers.get("Cache-Control")).toMatch(/max-age/);
  });
});
