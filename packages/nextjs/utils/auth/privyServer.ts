import { PrivyClient } from "@privy-io/node";
import type { LinkedAccount, User } from "@privy-io/node";
import { getPrivyAppId } from "~~/utils/auth/isPrivyEnabled";

let privyClient: PrivyClient | null = null;

export function getPrivyClient(): PrivyClient {
  if (privyClient) {
    return privyClient;
  }

  const appSecret = process.env.PRIVY_APP_SECRET;
  if (!appSecret) {
    throw new Error("PRIVY_APP_SECRET must be set to verify Privy access tokens");
  }

  privyClient = new PrivyClient({
    appId: getPrivyAppId(),
    appSecret,
    jwtVerificationKey: process.env.PRIVY_JWT_VERIFICATION_KEY,
  });

  return privyClient;
}

export async function verifyPrivyAccessToken(accessToken: string) {
  const client = getPrivyClient();
  return client.utils().auth().verifyAccessToken(accessToken);
}

export async function getPrivyUser(userId: string): Promise<User> {
  const client = getPrivyClient();
  // Documented as `_get` in @privy-io/node (Stainless path-param getter).
  return client.users()._get(userId);
}

function getLinkedEmail(account: LinkedAccount): string | undefined {
  if (account.type === "email") {
    return account.address;
  }
  if ("email" in account && typeof account.email === "string" && account.email.length > 0) {
    return account.email;
  }
  return undefined;
}

function getEthereumAddress(account: LinkedAccount): string | undefined {
  if (account.type !== "wallet" && account.type !== "smart_wallet") {
    return undefined;
  }
  if (!("address" in account) || typeof account.address !== "string") {
    return undefined;
  }
  if ("chain_type" in account && account.chain_type === "solana") {
    return undefined;
  }
  return account.address;
}

export function extractUserProfile(user: User): { address?: string; email?: string } {
  let email: string | undefined;
  let address: string | undefined;

  for (const account of user.linked_accounts) {
    email ??= getLinkedEmail(account);
    address ??= getEthereumAddress(account);
    if (email && address) break;
  }

  return { address, email };
}
