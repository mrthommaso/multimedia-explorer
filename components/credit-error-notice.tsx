"use client";

import { useOpenRouterAuth } from "@/hooks/use-openrouter-auth";

/**
 * Out-of-funds messaging, which differs by how the session is authenticated.
 *
 * A BYOK visitor is spending a key someone else created and has no billing relationship
 * with OpenRouter, so sending them to the credits page is a dead end — they need a fresh
 * key from whoever gave them this one. Account-authenticated users keep upstream's
 * "Add credits" path, which is actionable for them.
 */
export default function CreditErrorNotice({ message }: { message: string }) {
  const { authMode } = useOpenRouterAuth();

  const icon = (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-yellow-400 shrink-0 mt-0.5">
      <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );

  if (authMode === "byok") {
    return (
      <div className="flex items-start gap-2 px-4 py-3 bg-yellow-500/5 border border-yellow-500/20 rounded-xl text-left">
        {icon}
        <div className="space-y-1">
          <p className="text-sm text-yellow-400 font-medium">Generation budget exhausted.</p>
          <p className="text-xs text-yellow-400/80 leading-relaxed">
            This access key has no remaining generation budget. Ask the person who
            provided the key for a new or increased-limit key.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 px-4 py-3 bg-yellow-500/5 border border-yellow-500/20 rounded-xl">
      {icon}
      <p className="text-sm text-yellow-400 flex-1 text-left">{message}</p>
      <a
        href="https://openrouter.ai/settings/credits"
        target="_blank"
        rel="noopener noreferrer"
        className="shrink-0 px-3 py-1.5 text-xs tracking-wide bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-300 border border-yellow-500/20 rounded-lg transition-all"
      >
        Add credits
      </a>
    </div>
  );
}
