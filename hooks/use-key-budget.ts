"use client";

import { useState, useEffect } from "react";
import { openRouterKeyHeaders } from "@/lib/api-auth";

export interface KeyBudget {
  /** Spending limit in USD configured on the key, or null when uncapped. */
  limit: number | null;
  /** Remaining spend in USD, or null when the key is uncapped. */
  limitRemaining: number | null;
  usage: number;
}

/** OpenRouter bills a generation a few seconds after the result arrives. */
const SETTLE_DELAY = 7000;

/**
 * Read the spending limit of the active key so the UI can show remaining demo budget.
 * Fails silently — a missing budget indicator must never block generation.
 *
 * `refreshSignal` re-fetches when it changes (e.g. after a generation completes), plus one
 * delayed re-read so the figure catches up with OpenRouter's billing. No polling.
 */
export function useKeyBudget(
  apiKey: string | null,
  refreshSignal: number = 0
): KeyBudget | null {
  // Tagged with the key it describes, so switching or forgetting a key never shows a
  // stale budget from the previous one.
  const [fetched, setFetched] = useState<{ apiKey: string; budget: KeyBudget } | null>(
    null
  );

  useEffect(() => {
    if (!apiKey) return;

    let cancelled = false;

    const load = () =>
      fetch("/api/key", { headers: openRouterKeyHeaders(apiKey) })
        .then((res) => (res.ok ? res.json() : null))
        .then((budget: KeyBudget | null) => {
          if (!cancelled && budget) setFetched({ apiKey, budget });
        })
        .catch(() => {
          // Non-essential indicator — leave it as it is.
        });

    load();
    const settleTimer = refreshSignal > 0 ? setTimeout(load, SETTLE_DELAY) : null;

    return () => {
      cancelled = true;
      if (settleTimer) clearTimeout(settleTimer);
    };
  }, [apiKey, refreshSignal]);

  return fetched && fetched.apiKey === apiKey ? fetched.budget : null;
}
