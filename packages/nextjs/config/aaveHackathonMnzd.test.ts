import { isAddress } from "viem";
import { describe, expect, it } from "vitest";
import { aaveHackathonMnzdConfig, getHackathonAsset } from "~~/config/aaveHackathonMnzd";
import hackathonMarket from "~~/config/hackathon-market.json";

describe("aaveHackathonMnzdConfig", () => {
  it("resolves a complete Sepolia multi-asset market from hackathon-market.json", () => {
    expect(aaveHackathonMnzdConfig.chainId).toBe(11155111);
    expect(aaveHackathonMnzdConfig.marketId).toBe(hackathonMarket.marketId);
    expect(isAddress(aaveHackathonMnzdConfig.poolAddress)).toBe(true);
    expect(isAddress(aaveHackathonMnzdConfig.wrappedTokenGateway)).toBe(true);
    expect(aaveHackathonMnzdConfig.poolAddress).toBe(hackathonMarket.pool);
    expect(aaveHackathonMnzdConfig.assetSymbols).toEqual(["dNZD", "wETH", "wBTC"]);
  });

  it("includes dNZD, wETH, and wBTC with expected acquisition modes", () => {
    const dNZD = getHackathonAsset("dNZD");
    const weth = getHackathonAsset("wETH");
    const wbtc = getHackathonAsset("wBTC");

    expect(dNZD.decimals).toBe(6);
    expect(dNZD.mintable).toBe(true);
    expect(dNZD.acquisition).toBe("ownerMint");
    expect(isAddress(dNZD.underlyingAddress)).toBe(true);

    expect(weth.decimals).toBe(18);
    expect(weth.mintable).toBe(false);
    expect(weth.acquisition).toBe("wrapNative");
    expect(isAddress(weth.underlyingAddress)).toBe(true);
    expect(isAddress(weth.priceFeedAddress)).toBe(true);

    expect(wbtc.decimals).toBe(8);
    expect(wbtc.mintable).toBe(true);
    expect(wbtc.acquisition).toBe("ownerMint");
    expect(isAddress(wbtc.underlyingAddress)).toBe(true);
    expect(isAddress(wbtc.priceFeedAddress)).toBe(true);
  });

  it("keeps legacy asset field as dNZD", () => {
    expect(aaveHackathonMnzdConfig.asset.protocolSymbol).toBe("dNZD");
    expect(aaveHackathonMnzdConfig.asset.decimals).toBe(6);
    expect(aaveHackathonMnzdConfig.asset.underlyingAddress).toBe(aaveHackathonMnzdConfig.assets.dNZD.underlyingAddress);
  });

  it("does not label the stable as NZDD", () => {
    expect(aaveHackathonMnzdConfig.assets.dNZD.protocolSymbol).not.toMatch(/NZDD/i);
    expect(aaveHackathonMnzdConfig.assets.dNZD.displaySymbol).not.toMatch(/NZDD/i);
  });
});
