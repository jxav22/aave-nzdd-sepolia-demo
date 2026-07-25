import { buildAgentTools, callAgentTool, findTool, resolveApiOrigin, starterPrompts } from "./apiTools";
import { afterEach, describe, expect, it, vi } from "vitest";

const tools = buildAgentTools();

function tool(name: string) {
  const found = findTool(tools, name);
  if (!found) {
    throw new Error(`${name} is not exposed as a tool`);
  }
  return found;
}

describe("buildAgentTools", () => {
  it("exposes every documented operation except the chat endpoint itself", () => {
    expect(tools.map(entry => entry.name).sort()).toEqual([
      "getBinanceTokenDynamic",
      "getBinanceTokenMeta",
      "getBorrowRisk",
      "getEthMarket",
      "getPosition",
      "searchBinanceTokens",
      "simulateBorrowRisk",
    ]);
  });

  it("carries the method and path in the description so the model knows what it is calling", () => {
    expect(tool("getEthMarket").description).toContain("GET /api/v1/market/eth");
  });

  it("turns path and query parameters into a JSON Schema", () => {
    const position = tool("getPosition");
    const schema = position.parameters as { properties: Record<string, unknown>; required: string[] };

    expect(position.pathParams).toEqual(["address"]);
    expect(schema.properties.address).toMatchObject({ type: "string" });
    expect(schema.required).toContain("address");
  });

  it("inlines request-body $refs, including nested ones", () => {
    const simulate = tool("simulateBorrowRisk");
    const schema = simulate.parameters as {
      properties: { collateral: { items: { properties: Record<string, unknown> } } };
      required: string[];
    };

    expect(simulate.method).toBe("POST");
    expect(simulate.bodyProperties).toContain("collateral");
    expect(schema.properties.collateral.items.properties.liquidationThresholdBps).toBeDefined();
    expect(schema.required).toEqual(["collateral"]);
  });
});

describe("starterPrompts", () => {
  it("takes the documented examples", () => {
    const prompts = starterPrompts(tools, 3);

    expect(prompts).toHaveLength(3);
    expect(prompts.every(prompt => prompt.length > 0)).toBe(true);
  });
});

describe("callAgentTool", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function stubFetch(body: unknown, status = 200) {
    const spy = vi.fn(async () => new Response(JSON.stringify(body), { status }));
    vi.stubGlobal("fetch", spy);
    return spy;
  }

  it("issues a GET against the API with path and query parameters filled in", async () => {
    const spy = stubFetch({ ok: true, data: { account: {}, reserves: [] } });

    const result = await callAgentTool(
      tool("getBorrowRisk"),
      { address: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045", borrowAmount: "400" },
      { origin: "https://example.test", forwardedFor: "203.0.113.5" },
    );

    const [url, init] = spy.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(
      "https://example.test/api/v1/borrow-risk?address=0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045&borrowAmount=400",
    );
    expect(init.method).toBe("GET");
    expect((init.headers as Record<string, string>)["x-forwarded-for"]).toBe("203.0.113.5");
    expect(result.call.status).toBe(200);
    expect(result.call.summary).toContain("account");
  });

  it("substitutes path parameters", async () => {
    const spy = stubFetch({ ok: true, data: {} });

    await callAgentTool(
      tool("getPosition"),
      { address: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045" },
      { origin: "https://example.test" },
    );

    const [url] = spy.mock.calls[0] as unknown as [string];
    expect(url).toBe("https://example.test/api/v1/position/0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045");
  });

  it("rejects a call that omits a required path parameter", async () => {
    stubFetch({ ok: true, data: {} });

    await expect(callAgentTool(tool("getPosition"), {}, { origin: "https://example.test" })).rejects.toThrow(/address/);
  });

  it("posts only the properties the operation documents", async () => {
    const spy = stubFetch({ ok: true, data: {} });

    await callAgentTool(
      tool("simulateBorrowRisk"),
      { collateral: [{ valueBase: "1", liquidationThresholdBps: 8600 }], nonsense: true },
      { origin: "https://example.test" },
    );

    const [, init] = spy.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({
      collateral: [{ valueBase: "1", liquidationThresholdBps: 8600 }],
    });
  });

  it("surfaces an error envelope as the summary instead of throwing", async () => {
    stubFetch({ ok: false, error: { code: "INVALID_ADDRESS", message: "not an address" } }, 400);

    const result = await callAgentTool(tool("getPosition"), { address: "0x1" }, { origin: "https://example.test" });

    expect(result.call.ok).toBe(false);
    expect(result.call.summary).toBe("INVALID_ADDRESS: not an address");
  });

  it("caps long arrays so one response cannot swamp the model's context", async () => {
    stubFetch({ ok: true, data: { results: Array.from({ length: 40 }, (_, index) => ({ index })) } });

    const result = await callAgentTool(tool("searchBinanceTokens"), { q: "ETH" }, { origin: "https://example.test" });
    const payload = result.payload as { data: { results: unknown[] } };

    expect(payload.data.results).toHaveLength(9);
    expect(payload.data.results[8]).toBe("…32 more");
  });
});

describe("resolveApiOrigin", () => {
  it("prefers the forwarded host so the agent calls back through the proxy", () => {
    const request = new Request("http://10.0.0.4/api/v1/binance/chat", {
      headers: { "x-forwarded-host": "demo.example", "x-forwarded-proto": "https" },
    });

    expect(resolveApiOrigin(request)).toBe("https://demo.example");
  });

  it("falls back to the request origin", () => {
    expect(resolveApiOrigin(new Request("https://example.test/api/v1/binance/chat"))).toBe("https://example.test");
  });
});
