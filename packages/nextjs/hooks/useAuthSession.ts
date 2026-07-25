"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import type { AuthSessionData } from "~~/utils/auth/session";
import { defaultSession } from "~~/utils/auth/session";

const fetchSession = async (): Promise<AuthSessionData> => {
  const response = await fetch("/api/auth/session", { credentials: "include" });
  if (!response.ok) {
    return defaultSession;
  }
  return response.json();
};

/**
 * Syncs Privy client auth into an httpOnly iron-session cookie on the server.
 * Mount only inside PrivyProvider (see AuthSessionSync).
 */
export const useAuthSession = () => {
  const { ready, authenticated, user, getAccessToken } = usePrivy();
  const [session, setSession] = useState<AuthSessionData>(defaultSession);
  const [isLoading, setIsLoading] = useState(true);
  const lastSyncedUserId = useRef<string | null>(null);

  const refreshSession = useCallback(async () => {
    const next = await fetchSession();
    setSession(next);
    return next;
  }, []);

  const exchangeToken = useCallback(async () => {
    const accessToken = await getAccessToken();
    if (!accessToken) {
      return defaultSession;
    }

    const response = await fetch("/api/auth/session", {
      method: "POST",
      credentials: "include",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      return defaultSession;
    }

    const next: AuthSessionData = await response.json();
    setSession(next);
    return next;
  }, [getAccessToken]);

  const clearServerSession = useCallback(async () => {
    await fetch("/api/auth/session", { method: "DELETE", credentials: "include" });
    setSession(defaultSession);
    lastSyncedUserId.current = null;
  }, []);

  useEffect(() => {
    if (!ready) {
      return;
    }

    let cancelled = false;

    const sync = async () => {
      setIsLoading(true);
      try {
        if (authenticated && user?.id) {
          if (lastSyncedUserId.current !== user.id) {
            const next = await exchangeToken();
            if (!cancelled) {
              lastSyncedUserId.current = next.isLoggedIn ? user.id : null;
            }
          } else {
            await refreshSession();
          }
        } else if (lastSyncedUserId.current !== null) {
          await clearServerSession();
        } else {
          await refreshSession();
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void sync();

    return () => {
      cancelled = true;
    };
  }, [ready, authenticated, user?.id, exchangeToken, clearServerSession, refreshSession]);

  return {
    session,
    isLoading,
    isLoggedIn: session.isLoggedIn,
    refreshSession,
    exchangeToken,
    clearServerSession,
  };
};

/** Invisible mount point that keeps the server cookie in sync with Privy. */
export const AuthSessionSync = () => {
  useAuthSession();
  return null;
};
