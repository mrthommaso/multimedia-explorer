import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/openrouter";
import { readOpenRouterKey } from "@/lib/api-auth";

/**
 * Metadata for the caller's own key — `GET /api/v1/key` upstream, exposed by the SDK as
 * `apiKeys.getCurrentKeyMetadata()`. Used to validate a pasted access key and to show the
 * remaining demo budget. The response describes one specific key, so it is never cached.
 */
const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(request: NextRequest) {
  const apiKey = readOpenRouterKey(request);
  if (!apiKey) {
    return NextResponse.json(
      { error: "Missing API key" },
      { status: 401, headers: NO_STORE }
    );
  }

  try {
    const { data } = await createClient(apiKey).apiKeys.getCurrentKeyMetadata();

    return NextResponse.json(
      {
        limit: data.limit,
        limitRemaining: data.limitRemaining,
        usage: data.usage,
        isFreeTier: data.isFreeTier,
        expiresAt: data.expiresAt ?? null,
      },
      { headers: NO_STORE }
    );
  } catch (err) {
    // Deliberately generic: upstream error bodies are never echoed back here, so a key
    // can't be reflected to the client or captured by error reporting.
    const statusCode = (err as { statusCode?: unknown }).statusCode;
    const status = typeof statusCode === "number" ? statusCode : 502;
    const message =
      status === 401 || status === 403
        ? "OpenRouter rejected that access key."
        : "Could not read key information from OpenRouter.";

    return NextResponse.json({ error: message }, { status, headers: NO_STORE });
  }
}
