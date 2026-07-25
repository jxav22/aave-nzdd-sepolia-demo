/**
 * Binance Skill `query-token-info` — search / meta / dynamic helpers.
 *
 * Server-side only. Mirrors the public endpoints documented by the skill CLI at
 * `.agents/skills/query-token-info/scripts/cli.mjs`. No API key required.
 */

const REQUEST_HEADERS = { "Accept-Encoding": "identity", "User-Agent": "binance-web3/2.0 (Skill)" };
const REQUEST_TIMEOUT_MS = 10_000;

const SEARCH_ENDPOINT = "https://web3.binance.com/bapi/defi/v5/public/wallet-direct/buw/wallet/market/token/search/ai";
const META_ENDPOINT =
  "https://web3.binance.com/bapi/defi/v1/public/wallet-direct/buw/wallet/dex/market/token/meta/info/ai";
const DYNAMIC_ENDPOINT =
  "https://web3.binance.com/bapi/defi/v4/public/wallet-direct/buw/wallet/market/token/dynamic/info/ai";

const ICON_CDN = "https://bin.bnbstatic.com";

export const TOKEN_INFO_SOURCE = "Binance Skill query-token-info, public endpoints";

export const CHAIN_LABELS: Record<string, string> = {
  "1": "Ethereum",
  "56": "BSC",
  "8453": "Base",
  CT_501: "Solana",
};

export const ALLOWED_CHAIN_IDS = new Set(Object.keys(CHAIN_LABELS));

export type TokenSearchHit = {
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
  marketCapUsd: number | null;
};

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value !== "string" || value.trim() === "") {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function iconUrl(path: unknown): string | null {
  if (typeof path !== "string" || path.trim() === "") {
    return null;
  }
  if (path.startsWith("http://") || path.startsWith("https://")) {
    return path;
  }
  return `${ICON_CDN}${path.startsWith("/") ? path : `/${path}`}`;
}

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, {
    headers: REQUEST_HEADERS,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Binance endpoint returned HTTP ${response.status}`);
  }

  return response.json();
}

/** Keep only known skill chainIds so the proxy cannot amplify arbitrary query params. */
export function sanitizeChainIds(chainIds?: string): string | undefined {
  if (!chainIds?.trim()) {
    return undefined;
  }
  const allowed = chainIds
    .split(",")
    .map(id => id.trim())
    .filter(id => ALLOWED_CHAIN_IDS.has(id));
  return allowed.length > 0 ? allowed.join(",") : undefined;
}

export function buildSearchUrl(keyword: string, chainIds?: string): string {
  const params = new URLSearchParams({ keyword: keyword.trim() });
  const sanitized = sanitizeChainIds(chainIds);
  if (sanitized) {
    params.set("chainIds", sanitized);
  }
  return `${SEARCH_ENDPOINT}?${params}`;
}

export function parseSearchHits(payload: unknown): TokenSearchHit[] {
  const rows = (payload as { data?: unknown })?.data;
  if (!Array.isArray(rows)) {
    throw new Error("Search response did not contain a data array.");
  }

  const hits: TokenSearchHit[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") {
      continue;
    }
    const item = row as Record<string, unknown>;
    const chainId = typeof item.chainId === "string" ? item.chainId : "";
    const contractAddress = typeof item.contractAddress === "string" ? item.contractAddress : "";
    if (!chainId || !contractAddress) {
      continue;
    }

    hits.push({
      chainId,
      chainLabel: CHAIN_LABELS[chainId] ?? chainId,
      contractAddress,
      name: typeof item.name === "string" ? item.name : "",
      symbol: typeof item.symbol === "string" ? item.symbol : "",
      iconUrl: iconUrl(item.icon),
      priceUsd: toFiniteNumber(item.price),
      change24hPercent: toFiniteNumber(item.percentChange24h),
      volume24hUsd: toFiniteNumber(item.volume24h),
      liquidityUsd: toFiniteNumber(item.liquidity),
      marketCapUsd: toFiniteNumber(item.marketCap),
    });
  }

  // Highest liquidity first so real markets surface above dust / meme matches.
  return hits.sort((a, b) => (b.liquidityUsd ?? 0) - (a.liquidityUsd ?? 0));
}

export async function searchTokens(keyword: string, chainIds?: string): Promise<TokenSearchHit[]> {
  const trimmed = keyword.trim();
  if (!trimmed) {
    return [];
  }
  const payload = await fetchJson(buildSearchUrl(trimmed, chainIds));
  return parseSearchHits(payload);
}

export type TokenMeta = {
  chainId: string;
  chainLabel: string;
  contractAddress: string;
  name: string;
  symbol: string;
  decimals: number | null;
  iconUrl: string | null;
  website: string | null;
  twitter: string | null;
  telegram: string | null;
  description: string | null;
};

export type TokenDynamic = {
  chainId: string;
  chainLabel: string;
  contractAddress: string;
  priceUsd: number | null;
  change24hPercent: number | null;
  high24hUsd: number | null;
  low24hUsd: number | null;
  volume24hUsd: number | null;
  liquidityUsd: number | null;
  marketCapUsd: number | null;
  holders: number | null;
};

/** Reject empty / oversized addresses so the proxy cannot amplify garbage upstream. */
export function sanitizeContractAddress(address?: string): string | undefined {
  const trimmed = address?.trim();
  if (!trimmed || trimmed.length > 128) {
    return undefined;
  }
  return trimmed;
}

export function buildMetaUrl(chainId: string, contractAddress: string): string {
  const params = new URLSearchParams({ chainId, contractAddress });
  return `${META_ENDPOINT}?${params}`;
}

export function buildDynamicUrl(chainId: string, contractAddress: string): string {
  const params = new URLSearchParams({ chainId, contractAddress });
  return `${DYNAMIC_ENDPOINT}?${params}`;
}

function requireChainAndAddress(
  chainId: string,
  contractAddress: string,
): { chainId: string; contractAddress: string } {
  if (!ALLOWED_CHAIN_IDS.has(chainId)) {
    throw new Error(`Unsupported chainId "${chainId}". Use 1, 56, 8453, or CT_501.`);
  }
  const address = sanitizeContractAddress(contractAddress);
  if (!address) {
    throw new Error("contractAddress is required.");
  }
  return { chainId, contractAddress: address };
}

export function parseTokenMeta(payload: unknown, chainId: string, contractAddress: string): TokenMeta {
  const data = (payload as { data?: Record<string, unknown> })?.data;
  if (!data || typeof data !== "object") {
    throw new Error("Meta response did not contain a data object.");
  }

  const social = (data.socialMedia ?? data.social) as Record<string, unknown> | undefined;

  return {
    chainId,
    chainLabel: CHAIN_LABELS[chainId] ?? chainId,
    contractAddress,
    name: typeof data.name === "string" ? data.name : "",
    symbol: typeof data.symbol === "string" ? data.symbol : "",
    decimals: toFiniteNumber(data.decimals),
    iconUrl: iconUrl(data.icon ?? data.logo),
    website:
      typeof data.website === "string"
        ? data.website
        : typeof data.officialWebsite === "string"
          ? data.officialWebsite
          : null,
    twitter:
      typeof social?.twitter === "string" ? social.twitter : typeof data.twitter === "string" ? data.twitter : null,
    telegram:
      typeof social?.telegram === "string" ? social.telegram : typeof data.telegram === "string" ? data.telegram : null,
    description: typeof data.description === "string" ? data.description : null,
  };
}

export function parseTokenDynamic(payload: unknown, chainId: string, contractAddress: string): TokenDynamic {
  const data = (payload as { data?: Record<string, unknown> })?.data;
  if (!data || typeof data !== "object") {
    throw new Error("Dynamic response did not contain a data object.");
  }

  return {
    chainId,
    chainLabel: CHAIN_LABELS[chainId] ?? chainId,
    contractAddress,
    priceUsd: toFiniteNumber(data.price),
    change24hPercent: toFiniteNumber(data.percentChange24h),
    high24hUsd: toFiniteNumber(data.priceHigh24h),
    low24hUsd: toFiniteNumber(data.priceLow24h),
    volume24hUsd: toFiniteNumber(data.volume24h),
    liquidityUsd: toFiniteNumber(data.liquidity),
    marketCapUsd: toFiniteNumber(data.marketCap),
    holders: toFiniteNumber(data.holders ?? data.holderCount),
  };
}

export async function getTokenMeta(chainId: string, contractAddress: string): Promise<TokenMeta> {
  const args = requireChainAndAddress(chainId, contractAddress);
  const payload = await fetchJson(buildMetaUrl(args.chainId, args.contractAddress));
  return parseTokenMeta(payload, args.chainId, args.contractAddress);
}

export async function getTokenDynamic(chainId: string, contractAddress: string): Promise<TokenDynamic> {
  const args = requireChainAndAddress(chainId, contractAddress);
  const payload = await fetchJson(buildDynamicUrl(args.chainId, args.contractAddress));
  return parseTokenDynamic(payload, args.chainId, args.contractAddress);
}
