import { isAddress } from "viem";
import { describe, expect, it } from "vitest";
import { aaveHackathonMnzdConfig } from "~~/config/aaveHackathonMnzd";
import hackathonMarket from "~~/config/hackathon-market.json";

describe("aaveHackathonMnzdConfig", () => {
  it("resolves a complete Sepolia mNZD market config from hackathon-market.json", () => {
    expect(aaveHackathonMnzdConfig.chainId).toBe(11155111);
    expect(aaveHackathonMnzdConfig.marketId).toBe(hackathonMarket.marketId);
    expect(isAddress(aaveHackathonMnzdConfig.poolAddress)).toBe(true);
    expect(isAddress(aaveHackathonMnzdConfig.asset.underlyingAddress)).toBe(true);
    expect(isAddress(aaveHackathonMnzdConfig.asset.aTokenAddress)).toBe(true);
    expect(aaveHackathonMnzdConfig.poolAddress).toBe(hackathonMarket.pool);
    expect(aaveHackathonMnzdConfig.asset.underlyingAddress).toBe(hackathonMarket.underlying.address);
    expect(aaveHackathonMnzdConfig.asset.aTokenAddress).toBe(hackathonMarket.aToken);
    expect(aaveHackathonMnzdConfig.asset.protocolSymbol).toBe("mNZD");
    expect(aaveHackathonMnzdConfig.asset.displaySymbol).toBe("mNZD");
    expect(aaveHackathonMnzdConfig.asset.decimals).toBe(6);
  });

  it("does not label the asset as NZDD", () => {
    expect(aaveHackathonMnzdConfig.asset.protocolSymbol).not.toMatch(/NZDD/i);
    expect(aaveHackathonMnzdConfig.asset.displaySymbol).not.toMatch(/NZDD/i);
  });
});
