"use client";

import { useOpenRouterAuth } from "@/hooks/use-openrouter-auth";
import { useKeyBudget } from "@/hooks/use-key-budget";

function formatUsd(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

/**
 * Header control for the active session: shows how the app is authenticated, how much of
 * the key's spending limit is left, and how to drop the key again.
 */
export default function AuthStatus({ refreshSignal = 0 }: { refreshSignal?: number }) {
  const { apiKey, authMode, forgetKey } = useOpenRouterAuth();
  const budget = useKeyBudget(apiKey, refreshSignal);

  const showBudget =
    budget !== null && budget.limit !== null && budget.limitRemaining !== null;

  return (
    <div className="flex items-center gap-3">
      {showBudget && (
        <span
          className="hidden sm:flex flex-col items-end leading-tight text-[10px] tracking-wide text-muted"
          title="Spending limit configured on this OpenRouter key"
        >
          <span className="text-muted/70">Demo budget</span>
          <span className="text-accent/90 font-mono">
            {formatUsd(budget.limitRemaining!)} / {formatUsd(budget.limit!)} remaining
          </span>
        </span>
      )}

      {authMode === "env" && (
        <span className="text-[10px] tracking-wide text-muted border border-border rounded-lg px-3 py-2">
          dev env key
        </span>
      )}

      {(authMode === "byok" || authMode === "oauth") && (
        <button
          onClick={forgetKey}
          className="px-4 py-2.5 text-xs tracking-wide rounded-lg border border-border text-muted hover:text-foreground hover:border-accent/40 hover:shadow-[0_0_10px_rgba(59,130,246,0.1)] transition-all cursor-pointer"
        >
          {authMode === "byok" ? "Forget API key" : "Sign out"}
        </button>
      )}
    </div>
  );
}
