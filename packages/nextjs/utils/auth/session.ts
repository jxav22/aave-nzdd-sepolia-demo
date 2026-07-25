import type { SessionOptions } from "iron-session";

/**
 * App session cookie populated after Privy JWT verification.
 * Treat as a convenience mirror of Privy auth, re-verify the Privy access token
 * on sensitive server actions rather than trusting this cookie alone.
 */
export type AuthSessionData = {
  isLoggedIn: boolean;
  privyUserId?: string;
  address?: string;
  email?: string;
  signedInAt?: string;
};

export const defaultSession: AuthSessionData = { isLoggedIn: false };

/** Lazy getter, defers env evaluation so `next build` does not require secrets. */
export function getSessionOptions(): SessionOptions {
  const secret = process.env.IRON_SESSION_SECRET;
  const password =
    secret && secret.length >= 32
      ? secret
      : process.env.NODE_ENV === "production"
        ? (() => {
            throw new Error("IRON_SESSION_SECRET must be set in production (32+ chars)");
          })()
        : "complex_password_at_least_32_characters_long_for_dev";

  return {
    password,
    cookieName: "auth-session",
    cookieOptions: {
      httpOnly: true,
      sameSite: "lax" as const,
      secure: process.env.NODE_ENV === "production",
      maxAge: 7 * 24 * 60 * 60,
    },
  };
}
