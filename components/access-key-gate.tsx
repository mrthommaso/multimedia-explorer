"use client";

import { useState } from "react";
import { useOpenRouterAuth } from "@/hooks/use-openrouter-auth";
import { looksLikeOpenRouterKey } from "@/lib/byok-session";
import { openRouterKeyHeaders } from "@/lib/api-auth";
import { SignInButton } from "./auth-button";

/**
 * Entry screen shown whenever no key is active. The pasted key is verified against
 * OpenRouter (via our own `/api/key` route) and then handed to the auth provider, which
 * keeps it in session-scoped storage only. Nothing here logs or serializes the key.
 */
export default function AccessKeyGate() {
  const { submitSessionKey, signIn } = useOpenRouterAuth();
  const [value, setValue] = useState("");
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const key = value.trim();
    if (!key || checking) return;

    if (!looksLikeOpenRouterKey(key)) {
      setError("That doesn't look like an OpenRouter key — they start with \"sk-or-\".");
      return;
    }

    setChecking(true);
    setError(null);

    try {
      const res = await fetch("/api/key", { headers: openRouterKeyHeaders(key) });

      if (res.status === 401 || res.status === 403) {
        setError("OpenRouter rejected that key. Check it and try again.");
        return;
      }
      // Any other failure is treated as a transient upstream problem — accept the key
      // and let the first real request surface the error.
    } catch {
      // Offline or blocked request: fall through and accept the key.
    } finally {
      setChecking(false);
    }

    setValue("");
    submitSessionKey(key);
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-md bg-surface border border-accent/30 rounded-xl p-8 space-y-6 glow-accent-sm">
        <div className="space-y-3">
          <h2 className="text-lg font-heading font-bold tracking-tight text-glow-sm">
            {"// AI MULTIMEDIA PLAYGROUND"}
          </h2>
          <p className="text-sm text-muted leading-relaxed">
            Use the temporary OpenRouter access key you were given. The key is used only
            for this browser session and is not stored persistently.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="password"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              if (error) setError(null);
            }}
            placeholder="OpenRouter API key"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            autoFocus
            aria-label="OpenRouter API key"
            className="w-full px-4 py-3 bg-background border border-border rounded-xl text-sm text-foreground placeholder:text-muted/70 focus:outline-none focus:border-accent/60 focus:shadow-[0_0_12px_rgba(59,130,246,0.15)] transition-all font-mono"
          />

          {error && (
            <div className="flex items-start gap-2 px-4 py-3 bg-red-500/5 border border-red-500/20 rounded-xl">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-red-400 shrink-0 mt-0.5">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={checking || !value.trim()}
            className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-accent hover:bg-accent-hover text-white text-sm font-medium tracking-wide rounded-lg transition-all hover:shadow-[0_0_15px_rgba(59,130,246,0.3)] disabled:opacity-50 cursor-pointer"
          >
            {checking ? (
              <>
                <span className="retro-spinner !w-4 !h-4 !border-[1.5px] !border-white/30 !border-t-white" />
                Checking...
              </>
            ) : (
              "Enter"
            )}
          </button>
        </form>

        <div className="pt-1 border-t border-border/60 space-y-3">
          <p className="text-[11px] text-muted leading-relaxed tracking-wide">
            The key stays in this tab&apos;s session storage, is sent only to OpenRouter
            through this app, and is gone when you close the browser.
          </p>
          <p className="text-[11px] text-muted tracking-wide">
            Have your own OpenRouter account?{" "}
            <SignInButton
              variant="minimal"
              size="sm"
              showLogo={false}
              label="Sign in with OpenRouter"
              className="!h-auto !px-0 !text-[11px]"
              onClick={() => signIn()}
            />
          </p>
        </div>
      </div>
    </div>
  );
}
