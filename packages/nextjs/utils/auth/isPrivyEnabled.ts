/**
 * Privy is the production auth path when an app ID is configured.
 * Without it, the app falls back to RainbowKit for local development.
 */
export const isPrivyEnabled = Boolean(process.env.NEXT_PUBLIC_PRIVY_APP_ID);

export const getPrivyAppId = (): string => {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  if (!appId) {
    throw new Error("NEXT_PUBLIC_PRIVY_APP_ID is not set");
  }
  return appId;
};
