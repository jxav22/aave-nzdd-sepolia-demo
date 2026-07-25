/**
 * Fail fast when `yarn aave:e2e` is run without credentials.
 * Unit suite (`yarn test:aave`) never loads this file.
 */
import { e2eEnvReady } from "./viemClients";

export function assertE2eEnvOrThrow(): void {
  if (e2eEnvReady()) {
    return;
  }

  const missing: string[] = [];
  if (process.env.AAVE_E2E !== "1") {
    missing.push("AAVE_E2E=1");
  }
  if (!process.env.E2E_PRIVATE_KEY?.trim()) {
    missing.push("E2E_PRIVATE_KEY");
  }

  throw new Error(
    `Aave e2e requires ${missing.join(" and ")}.\n` +
      "Example (PowerShell):\n" +
      '  $env:AAVE_E2E="1"; $env:E2E_PRIVATE_KEY="0x..."; yarn aave:e2e\n' +
      "Optional: $env:ALCHEMY_API_KEY or $env:SEPOLIA_RPC_URL",
  );
}

assertE2eEnvOrThrow();
