import {
  buildDynamicUrl,
  buildMetaUrl,
  buildSearchUrl,
  parseSearchHits,
  parseTokenDynamic,
  parseTokenMeta,
  sanitizeChainIds,
} from "./tokenInfo";
import { describe, expect, it } from "vitest";

describe("sanitizeChainIds", () => {
  it("keeps known chain ids and drops the rest", () => {
    expect(sanitizeChainIds("1,56,999,CT_501")).toBe("1,56,CT_501");
  });

  it("returns undefined when nothing is allowed", () => {
    expect(sanitizeChainIds("999")).toBeUndefined();
    expect(sanitizeChainIds("")).toBeUndefined();
    expect(sanitizeChainIds(undefined)).toBeUndefined();
  });
});

describe("buildSearchUrl", () => {
  it("encodes keyword and sanitized chain ids", () => {
    expect(buildSearchUrl(" ETH ", "1,bogus")).toContain("keyword=ETH");
    expect(buildSearchUrl("ETH", "1,bogus")).toContain("chainIds=1");
    expect(buildSearchUrl("ETH", "bogus")).not.toContain("chainIds=");
  });
});

describe("parseSearchHits", () => {
  it("maps a skill-shaped search payload", () => {
    const hits = parseSearchHits({
      data: [
        {
          chainId: "1",
          contractAddress: "0xdust",
          name: "Dust",
          symbol: "DUST",
          price: "1",
          liquidity: "100",
        },
        {
          chainId: "1",
          contractAddress: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
          name: "Wrapped Ether",
          symbol: "WETH",
          icon: "/images/weth.png",
          price: "2500.12",
          percentChange24h: "-1.5",
          volume24h: "1000000",
          liquidity: "500000",
          marketCap: "30000000000",
        },
      ],
    });

    expect(hits).toHaveLength(2);
    expect(hits[0].symbol).toBe("WETH");
    expect(hits[0]).toMatchObject({
      chainId: "1",
      chainLabel: "Ethereum",
      iconUrl: "https://bin.bnbstatic.com/images/weth.png",
      priceUsd: 2500.12,
      change24hPercent: -1.5,
    });
  });

  it("throws when data is missing", () => {
    expect(() => parseSearchHits({})).toThrow(/data array/);
  });
});

describe("token meta/dynamic parsers", () => {
  const chainId = "1";
  const address = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";

  it("builds meta and dynamic URLs", () => {
    expect(buildMetaUrl(chainId, address)).toContain("meta/info/ai");
    expect(buildDynamicUrl(chainId, address)).toContain("dynamic/info/ai");
    expect(buildDynamicUrl(chainId, address)).toContain(`contractAddress=${address}`);
  });

  it("parses meta and dynamic payloads", () => {
    expect(
      parseTokenMeta(
        {
          data: {
            name: "Wrapped Ether",
            symbol: "WETH",
            decimals: "18",
            website: "https://ethereum.org",
            socialMedia: { twitter: "https://x.com/ethereum" },
          },
        },
        chainId,
        address,
      ),
    ).toMatchObject({
      symbol: "WETH",
      website: "https://ethereum.org",
      twitter: "https://x.com/ethereum",
      chainLabel: "Ethereum",
    });

    expect(
      parseTokenDynamic(
        {
          data: {
            price: "2500",
            percentChange24h: "1.2",
            volume24h: "100",
            liquidity: "200",
            holders: "42",
          },
        },
        chainId,
        address,
      ),
    ).toMatchObject({
      priceUsd: 2500,
      change24hPercent: 1.2,
      holders: 42,
    });
  });
});
