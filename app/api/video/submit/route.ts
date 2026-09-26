import { NextRequest, NextResponse } from "next/server";
import { readOpenRouterKey } from "@/lib/api-auth";
import { parseJsonResponse, fallbackErrorMessage } from "@/lib/safe-json";
import { buildProviderOptions } from "@/lib/video-models";

const OPENROUTER_VIDEO_URL = "https://openrouter.ai/api/v1/videos";

export async function POST(request: NextRequest) {
  const apiKey = readOpenRouterKey(request);
  if (!apiKey) {
    return NextResponse.json({ error: "Missing API key" }, { status: 401 });
  }

  const body = await request.json();
  const { prompt, model } = body;

  if (!prompt || !model) {
    return NextResponse.json(
      { error: "Prompt and model are required" },
      { status: 400 }
    );
  }

  // Build the request payload, only including optional fields if provided
  const payload: Record<string, unknown> = { model, prompt };

  if (body.aspect_ratio) payload.aspect_ratio = body.aspect_ratio;
  if (body.duration) payload.duration = body.duration;
  if (body.resolution) payload.resolution = body.resolution;
  if (body.generate_audio !== undefined) payload.generate_audio = body.generate_audio;
  if (body.seed !== undefined) payload.seed = body.seed;
  if (Array.isArray(body.input_references) && body.input_references.length > 0) {
    payload.input_references = body.input_references;
  }

  // Provider-specific controls, narrowed to this model's allowed_passthrough_parameters
  // and nested into provider.options.<slug>. Anything unknown is dropped here rather than
  // trusted from the browser.
  const provider = await buildProviderOptions(model, body.providerOptions);
  if (provider) payload.provider = provider;

  try {
    const res = await fetch(OPENROUTER_VIDEO_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "http://localhost:3000",
        "X-Title": "Multimedia Explorer",
      },
      body: JSON.stringify(payload),
    });

    const { ok, status, data, text } = await parseJsonResponse<{
      id?: string;
      error?: string | { message?: string; metadata?: { raw?: string } };
    }>(res);

    if (!ok || !data || data.error) {
      let errMsg: string;
      if (data?.error) {
        errMsg =
          typeof data.error === "string"
            ? data.error
            : data.error.message || data.error.metadata?.raw || fallbackErrorMessage(status, text);
      } else {
        errMsg = fallbackErrorMessage(status, text);
      }
      return NextResponse.json(
        { error: errMsg },
        { status: ok ? 400 : status }
      );
    }

    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to submit video generation" },
      { status: 500 }
    );
  }
}
