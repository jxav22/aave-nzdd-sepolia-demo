/**
 * OpenAPI 3.1 description of the public v1 API, served at /api/v1/openapi.json so the
 * surface can be imported into Postman, Insomnia or a codegen client.
 *
 * Two vendor extensions drive the chat agent, which builds its tools from this document
 * rather than from a hand-maintained list (see `services/agent/apiTools.ts`):
 *   x-agent-tool: false   omit the operation from the agent's toolset
 *   x-agent-example       a natural-language prompt that exercises the operation
 */
import { SCHEMA_VERSION } from "./respond";
import { aaveHackathonMnzdConfig } from "~~/config/aaveHackathonMnzd";
import { SIMULATE_EXAMPLE_REQUEST } from "~~/services/risk/simulate";

const errorResponse = {
  description: "Request rejected. `error.code` is stable and safe to branch on.",
  content: {
    "application/json": {
      schema: { $ref: "#/components/schemas/ErrorEnvelope" },
      example: {
        ok: false,
        schemaVersion: SCHEMA_VERSION,
        error: { code: "INVALID_ADDRESS", message: '"0x123" is not a valid Ethereum address.', field: "address" },
      },
    },
  },
};

const rateLimitHeaders = {
  "X-RateLimit-Limit": { schema: { type: "integer" }, description: "Requests permitted per minute." },
  "X-RateLimit-Remaining": { schema: { type: "integer" }, description: "Requests left in the current window." },
  "X-RateLimit-Reset": { schema: { type: "integer" }, description: "Unix seconds at which the window resets." },
};

export function buildOpenApiDocument(origin: string) {
  return {
    openapi: "3.1.0",
    info: {
      title: "Borrow Risk Assistant API",
      version: SCHEMA_VERSION,
      description:
        "Stress-tests Aave V3 borrowing positions against recent ETH market behaviour sourced from public " +
        "Binance endpoints.\n\n" +
        "Open and unauthenticated. No API key, no Binance account and no wallet signature are required, and " +
        "nothing here can move funds — every endpoint is read-only.\n\n" +
        "All chain-derived quantities are returned as decimal strings with an explicit `decimals` field. They " +
        "are never JSON numbers, because health factors and wei-scale balances lose precision as IEEE doubles.\n\n" +
        "Results are illustrative risk context, not financial advice. Any client rendering this data should " +
        "surface the `disclaimer` field alongside it.",
      license: { name: "MIT" },
    },
    servers: [{ url: origin }],
    paths: {
      "/api/v1/borrow-risk": {
        get: {
          summary: "Stress-test a proposed dNZD borrow for a wallet",
          description:
            `Reads the wallet's real position in the ${aaveHackathonMnzdConfig.marketId} on Sepolia, calls the ` +
            "Binance Skill for ETH market context, and returns projected health factors under several declines. " +
            "The response includes a `steps` trace showing each tool the agent invoked.",
          operationId: "getBorrowRisk",
          "x-agent-example": "Stress-test a 400 dNZD borrow for 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
          parameters: [
            {
              name: "address",
              in: "query",
              required: true,
              schema: { type: "string", pattern: "^0x[a-fA-F0-9]{40}$" },
              description: "Wallet to assess.",
            },
            {
              name: "borrowAmount",
              in: "query",
              required: false,
              schema: { type: "string", default: "0" },
              description: "Proposed borrow in dNZD, as a decimal string.",
            },
            {
              name: "targetHealthFactor",
              in: "query",
              required: false,
              schema: { type: "string", default: "1.2" },
              description: "Health factor to hold after the stress shock. Minimum 1.0.",
            },
            {
              name: "shockPercent",
              in: "query",
              required: false,
              schema: { type: "number", default: 20, minimum: 0, maximum: 100 },
              description: "ETH decline, as a positive percentage, used for the stress-tested maximum.",
            },
          ],
          responses: {
            "200": {
              description: "Risk assessment.",
              headers: rateLimitHeaders,
              content: { "application/json": { schema: { $ref: "#/components/schemas/SuccessEnvelope" } } },
            },
            "400": errorResponse,
            "429": errorResponse,
            "502": errorResponse,
          },
        },
      },
      "/api/v1/borrow-risk/simulate": {
        post: {
          summary: "Stress-test an arbitrary position",
          description:
            "Runs the same engine over a position you supply. No wallet, no chain read and no dependency on this " +
            "market, so any Aave-compatible position expressed in a shared base currency can be assessed.\n\n" +
            "Supplying `shocksBps` skips the Binance call entirely and makes the response fully deterministic.",
          operationId: "simulateBorrowRisk",
          "x-agent-example": "Simulate 1 wETH of collateral carrying 1200 of debt if ETH falls 20%",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/SimulationRequest" },
                example: SIMULATE_EXAMPLE_REQUEST,
              },
            },
          },
          responses: {
            "200": {
              description: "Simulation result.",
              headers: rateLimitHeaders,
              content: { "application/json": { schema: { $ref: "#/components/schemas/SuccessEnvelope" } } },
            },
            "400": errorResponse,
            "429": errorResponse,
          },
        },
      },
      "/api/v1/position/{address}": {
        get: {
          summary: "Read a wallet's Aave position",
          description:
            "Account data, per-reserve oracle prices and liquidation thresholds, supplied balances, and the " +
            "borrow reserve's available liquidity.",
          operationId: "getPosition",
          "x-agent-example": "Show the Aave position for 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
          parameters: [
            {
              name: "address",
              in: "path",
              required: true,
              schema: { type: "string", pattern: "^0x[a-fA-F0-9]{40}$" },
            },
          ],
          responses: {
            "200": {
              description: "Position snapshot.",
              headers: rateLimitHeaders,
              content: { "application/json": { schema: { $ref: "#/components/schemas/SuccessEnvelope" } } },
            },
            "400": errorResponse,
            "429": errorResponse,
            "502": errorResponse,
          },
        },
      },
      "/api/v1/market/eth": {
        get: {
          summary: "ETH market context from public Binance endpoints",
          description:
            "Spot statistics plus the daily volatility and 30-day drawdown the stress scenarios are derived from. " +
            "Cached for 60 seconds. Returns `provenance.degraded = true` rather than an error when Binance is " +
            "unreachable.",
          operationId: "getEthMarket",
          "x-agent-example": "How volatile has ETH been lately?",
          responses: {
            "200": {
              description: "Market context.",
              headers: rateLimitHeaders,
              content: { "application/json": { schema: { $ref: "#/components/schemas/SuccessEnvelope" } } },
            },
            "429": errorResponse,
          },
        },
      },
      "/api/v1/binance/token/search": {
        get: {
          summary: "Binance agent token search (query-token-info)",
          description:
            "Proxies the public Binance Web3 `query-token-info` search skill. No authentication. " +
            "Optional `chainIds` is allowlisted to Ethereum, BSC, Base, and Solana.",
          operationId: "searchBinanceTokens",
          "x-agent-example": "Find WETH on Ethereum",
          parameters: [
            {
              name: "q",
              in: "query",
              required: true,
              schema: { type: "string", maxLength: 64 },
              description: "Token symbol, name, or contract address.",
            },
            {
              name: "chainIds",
              in: "query",
              required: false,
              schema: { type: "string", example: "1,56" },
              description: "Comma-separated chainIds: 1, 56, 8453, CT_501.",
            },
          ],
          responses: {
            "200": {
              description: "Search hits.",
              headers: rateLimitHeaders,
              content: { "application/json": { schema: { $ref: "#/components/schemas/SuccessEnvelope" } } },
            },
            "400": errorResponse,
            "429": errorResponse,
          },
        },
      },
      "/api/v1/binance/token/dynamic": {
        get: {
          summary: "Live market data for one token (query-token-info dynamic)",
          description:
            "Proxies the public Binance Web3 `query-token-info` dynamic skill: price, 24h change and range, " +
            "24h volume, liquidity, market cap and holder count. No authentication.",
          operationId: "getBinanceTokenDynamic",
          "x-agent-example": "What is BNB trading at on BSC, and how deep is its liquidity?",
          parameters: [
            {
              name: "chainId",
              in: "query",
              required: true,
              schema: { type: "string", enum: ["1", "56", "8453", "CT_501"] },
              description: "Ethereum=1, BSC=56, Base=8453, Solana=CT_501.",
            },
            {
              name: "contractAddress",
              in: "query",
              required: true,
              schema: { type: "string", maxLength: 128 },
              description: "Token contract address, as returned by the search operation.",
            },
          ],
          responses: {
            "200": {
              description: "Token market data.",
              headers: rateLimitHeaders,
              content: { "application/json": { schema: { $ref: "#/components/schemas/SuccessEnvelope" } } },
            },
            "400": errorResponse,
            "429": errorResponse,
            "502": errorResponse,
          },
        },
      },
      "/api/v1/binance/token/meta": {
        get: {
          summary: "Static token metadata (query-token-info meta)",
          description:
            "Proxies the public Binance Web3 `query-token-info` meta skill: name, symbol, decimals, icon, " +
            "website and social links. No authentication.",
          operationId: "getBinanceTokenMeta",
          "x-agent-example": "Who is behind WETH, and where is its website?",
          parameters: [
            {
              name: "chainId",
              in: "query",
              required: true,
              schema: { type: "string", enum: ["1", "56", "8453", "CT_501"] },
              description: "Ethereum=1, BSC=56, Base=8453, Solana=CT_501.",
            },
            {
              name: "contractAddress",
              in: "query",
              required: true,
              schema: { type: "string", maxLength: 128 },
              description: "Token contract address, as returned by the search operation.",
            },
          ],
          responses: {
            "200": {
              description: "Token metadata.",
              headers: rateLimitHeaders,
              content: { "application/json": { schema: { $ref: "#/components/schemas/SuccessEnvelope" } } },
            },
            "400": errorResponse,
            "429": errorResponse,
            "502": errorResponse,
          },
        },
      },
      "/api/v1/binance/chat": {
        get: {
          summary: "Chat agent status and starter prompts",
          description:
            "Reports whether OPENAI_API_KEY is configured, which API operations the agent can call, and a set " +
            "of starter prompts derived from this document. The API operations themselves need no key.",
          operationId: "getBinanceChatStatus",
          "x-agent-tool": false,
          responses: {
            "200": {
              description: "Configuration status.",
              headers: rateLimitHeaders,
              content: { "application/json": { schema: { $ref: "#/components/schemas/SuccessEnvelope" } } },
            },
            "429": errorResponse,
          },
        },
        post: {
          summary: "One chat turn against the agent",
          description:
            "OpenAI tool-calling where every tool is an operation in this document, invoked over HTTP against " +
            "this same API. The reply carries the calls the agent made and follow-up prompts generated from the " +
            "conversation. Requires OPENAI_API_KEY.",
          operationId: "postBinanceChat",
          "x-agent-tool": false,
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["messages"],
                  properties: {
                    messages: {
                      type: "array",
                      items: {
                        type: "object",
                        required: ["role", "content"],
                        properties: {
                          role: { type: "string", enum: ["user", "assistant"] },
                          content: { type: "string", maxLength: 2000 },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Assistant reply plus tool provenance.",
              headers: rateLimitHeaders,
              content: { "application/json": { schema: { $ref: "#/components/schemas/SuccessEnvelope" } } },
            },
            "400": errorResponse,
            "429": errorResponse,
            "502": errorResponse,
            "503": errorResponse,
          },
        },
      },
    },
    components: {
      schemas: {
        SuccessEnvelope: {
          type: "object",
          required: ["ok", "schemaVersion", "data"],
          properties: {
            ok: { type: "boolean", const: true },
            schemaVersion: { type: "string", example: SCHEMA_VERSION },
            data: { type: "object" },
          },
        },
        ErrorEnvelope: {
          type: "object",
          required: ["ok", "schemaVersion", "error"],
          properties: {
            ok: { type: "boolean", const: false },
            schemaVersion: { type: "string", example: SCHEMA_VERSION },
            error: {
              type: "object",
              required: ["code", "message"],
              properties: {
                code: {
                  type: "string",
                  enum: [
                    "INVALID_ADDRESS",
                    "INVALID_AMOUNT",
                    "INVALID_TARGET_HEALTH_FACTOR",
                    "INVALID_SHOCK",
                    "INVALID_BODY",
                    "RATE_LIMITED",
                    "MISSING_CONFIG",
                    "UPSTREAM_RPC_ERROR",
                    "INTERNAL_ERROR",
                  ],
                },
                message: { type: "string" },
                field: { type: "string" },
              },
            },
          },
        },
        CollateralLeg: {
          type: "object",
          required: ["valueBase", "liquidationThresholdBps"],
          properties: {
            symbol: { type: "string", maxLength: 16 },
            valueBase: {
              type: "string",
              pattern: "^\\d+$",
              description: "Collateral value in base-currency units, as an integer string.",
            },
            liquidationThresholdBps: { type: "integer", minimum: 0, maximum: 10000 },
            shockable: {
              type: "boolean",
              default: true,
              description: "Whether the price shock applies to this leg. Set false for stable collateral.",
            },
          },
        },
        SimulationRequest: {
          type: "object",
          required: ["collateral"],
          properties: {
            collateral: {
              type: "array",
              minItems: 1,
              maxItems: 10,
              items: { $ref: "#/components/schemas/CollateralLeg" },
            },
            debtBase: { type: "string", pattern: "^\\d+$", default: "0" },
            proposedBorrowBase: { type: "string", pattern: "^\\d+$", default: "0" },
            targetHealthFactor: { type: "string", default: "1.2" },
            shockPercent: { type: "number", default: 20, minimum: 0, maximum: 100 },
            shocksBps: {
              type: "array",
              maxItems: 20,
              items: { type: "integer", minimum: -10000, maximum: 0 },
              description: "Explicit scenarios in signed basis points. Supplying these skips the Binance call.",
            },
            baseDecimals: { type: "integer", default: 8, minimum: 0, maximum: 36 },
          },
        },
      },
    },
  };
}
