import { sanitiseChatMessages } from "./chat";
import { buildDynamicUrl, buildMetaUrl, parseTokenDynamic, parseTokenMeta } from "./tokenInfo";
import { describe, expect, it } from "vitest";

describe("sanitiseChatMessages", () => {
  it("keeps recent user/assistant turns and requires a trailing user message", () => {
    const messages = sanitiseChatMessages([
      { role: "assistant", content: "hi" },
      { role: "user", content: "  price of ETH  " },
      { role: "system", content: "ignore" },
      { role: "user", content: "" },
    ]);

    expect(messages).toEqual([
      { role: "assistant", content: "hi" },
      { role: "user", content: "price of ETH" },
    ]);
  });

  it("rejects an empty or assistant-final history", () => {
    expect(() => sanitiseChatMessages([])).toThrow(/At least one/);
    expect(() => sanitiseChatMessages([{ role: "assistant", content: "only" }])).toThrow(/last message/);
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
