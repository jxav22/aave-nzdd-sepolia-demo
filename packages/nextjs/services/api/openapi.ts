/**
 * OpenAPI 3.1 description of the public v1 API, served at /api/v1/openapi.json so the
 * surface can be imported into Postman, Insomnia or a codegen client.
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
