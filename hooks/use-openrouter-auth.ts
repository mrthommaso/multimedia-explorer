"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import React from "react";
import {
  getApiKey,
  clearApiKey,
  onAuthChange,
  initiateOAuth,
  handleOAuthCallback,
  hasOAuthCallbackPending,
} from "@/lib/openrouter-auth";
import {
  getSessionKey,
  setSessionKey as storeSessionKey,
  clearSessionKey,
  onSessionKeyChange,
} from "@/lib/byok-session";
import { SignInButtonAuthContext } from "@/components/auth-button";

/**
 * How the active key was obtained:
 * - `byok`  — pasted into the access-key screen, session-scoped (the default path)
 * - `oauth` — issued by OpenRouter's OAuth flow for the visitor's own account
 * - `env`   — local developer convenience key from `.env.local`, never used in production
 */
export type AuthMode = "byok" | "oauth" | "env";

/**
 * Developer-only escape hatch inherited from upstream. Compiled out of production builds
 * so a deployment can never serve a shared credential to its visitors.
 */
const DEV_ENV_KEY =
  process.env.NODE_ENV !== "production"
    ? process.env.NEXT_PUBLIC_OPENROUTER_API_KEY || null
    : null;

export interface OpenRouterAuthContext {
  apiKey: string | null;
  authMode: AuthMode | null;
  isAuthenticated: boolean;
  /** False until browser storage has been read, so the UI never flashes the wrong state. */
  isReady: boolean;
  isLoading: boolean;
  /** Accept a user-supplied key for this browser session only. */
  submitSessionKey: (key: string) => void;
  /** Drop every key we hold and return to the access-key screen. */
  forgetKey: () => void;
  signIn: (callbackUrl?: string) => Promise<void>;
  /** Alias of {@link forgetKey}, kept for upstream call sites. */
  signOut: () => void;
  error: string | null;
}

const AuthContext = createContext<OpenRouterAuthContext | null>(null);

/** Nothing to subscribe to — the value flips once, right after hydration. */
const subscribeNever = () => () => {};

export function OpenRouterAuthProvider({ children }: { children: ReactNode }) {
  // Both key stores are external stores: server and hydration renders see no key, and a
  // store update (this tab or, for the OAuth key, another tab) re-renders consumers.
  const sessionKey = useSyncExternalStore(onSessionKeyChange, getSessionKey, () => null);
  const oauthKey = useSyncExternalStore(onAuthChange, getApiKey, () => null);
  // False through SSR and hydration, true afterwards — lets the UI wait for storage
  // instead of flashing the access-key screen to someone who already has a key.
  const isReady = useSyncExternalStore(
    subscribeNever,
    () => true,
    () => false
  );

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const callbackProcessed = useRef(false);

  // Handle OAuth callback on mount
  useEffect(() => {
    // Guard against StrictMode double-mount
    if (callbackProcessed.current) return;

    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");

    // Only process ?code= if we initiated an OAuth flow (verifier exists)
    if (code && hasOAuthCallbackPending()) {
      callbackProcessed.current = true;
      setIsLoading(true);
      handleOAuthCallback(code)
        .then(() => {
          // Clean the URL
          const url = new URL(window.location.href);
          url.searchParams.delete("code");
          window.history.replaceState({}, "", url.toString());
        })
        .catch((err) => {
          setError(err.message);
        })
        .finally(() => {
          setIsLoading(false);
        });
    }
  }, []);

  const signIn = useCallback(async (callbackUrl?: string) => {
    setError(null);
    await initiateOAuth(callbackUrl);
  }, []);

  const submitSessionKey = useCallback((key: string) => {
    setError(null);
    storeSessionKey(key.trim());
  }, []);

  const forgetKey = useCallback(() => {
    clearSessionKey();
    clearApiKey();
    setError(null);
  }, []);

  const apiKey = sessionKey ?? oauthKey ?? DEV_ENV_KEY;
  const authMode: AuthMode | null = sessionKey
    ? "byok"
    : oauthKey
      ? "oauth"
      : DEV_ENV_KEY
        ? "env"
        : null;

  const authValue: OpenRouterAuthContext = {
    apiKey,
    authMode,
    isAuthenticated: apiKey !== null,
    isReady,
    isLoading,
    submitSessionKey,
    forgetKey,
    signIn,
    signOut: forgetKey,
    error,
  };

  // Provide auth context to both useOpenRouterAuth consumers and auto-wired SignInButtons
  return React.createElement(
    AuthContext.Provider,
    { value: authValue },
    React.createElement(
      SignInButtonAuthContext.Provider,
      { value: { signIn, isLoading } },
      children
    )
  );
}

export function useOpenRouterAuth(): OpenRouterAuthContext {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error(
      "useOpenRouterAuth must be used within <OpenRouterAuthProvider>"
    );
  }
  return ctx;
}
