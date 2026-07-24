import { isAddress } from "viem";
import { describe, expect, it } from "vitest";
import { aaveSepoliaConfig } from "~~/config/aaveSepolia";

describe("aaveSepoliaConfig", () => {
  it("resolves a complete Sepolia EURS market config from the address book", () => {
    expect(aaveSepoliaConfig.chainId).toBe(11155111);
    expect(isAddress(aaveSepoliaConfig.poolAddress)).toBe(true);
    expect(isAddress(aaveSepoliaConfig.asset.underlyingAddress)).toBe(true);
    expect(isAddress(aaveSepoliaConfig.asset.aTokenAddress)).toBe(true);
    expect(aaveSepoliaConfig.asset.protocolSymbol).toBe("EURS");
    expect(aaveSepoliaConfig.asset.displaySymbol).toBe("EURS");
    expect(aaveSepoliaConfig.asset.decimals).toBe(2);
  });

  it("does not label the asset as NZDD", () => {
    expect(aaveSepoliaConfig.asset.protocolSymbol).not.toMatch(/NZDD/i);
    expect(aaveSepoliaConfig.asset.displaySymbol).not.toMatch(/NZDD/i);
  });
});
