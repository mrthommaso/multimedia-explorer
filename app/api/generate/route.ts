import { NextRequest, NextResponse } from "next/server";
import { readOpenRouterKey } from "@/lib/api-auth";
import { createClient } from "@/lib/openrouter";
import { getImageModelConfigs } from "@/lib/image-models";
import { parseJsonResponse, fallbackErrorMessage } from "@/lib/safe-json";
import { type ImageModelConfig } from "@/lib/types";

const VALID_ASPECT_RATIOS = new Set(["1:1", "16:9", "9:16", "4:3", "3:2"]);
const EXTENDED_ASPECT_RATIOS = new Set(["1:4", "4:1", "1:8", "8:1"]);
const VALID_RESOLUTIONS = new Set(["1K", "2K", "4K"]);

const OPENROUTER_IMAGES_URL = "https://openrouter.ai/api/v1/images";

/**
 * Generation for models that only emit images. These are not chat models, so chat
 * completions rejects them; OpenRouter serves them from a dedicated synchronous endpoint
 * that answers with base64 image bytes.
 *
 * The result is normalised to the same `{ imageUrl, model }` shape the chat path returns,
 * so the form, result card, history and IndexedDB storage stay untouched.
 */
async function generateViaImagesEndpoint({
  apiKey,
  model,
  prompt,
  systemContent,
  config,
  aspectRatio,
  resolution,
  referenceImages,
}: {
  apiKey: string;
  model: string;
  prompt: string;
  systemContent: string | null;
  config: ImageModelConfig;
  aspectRatio: string;
  resolution: string;
  referenceImages: unknown;
}) {
  // There is no system role here, so brand guidance is folded into the prompt itself.
  const payload: Record<string, unknown> = {
    model,
    prompt: systemContent ? `${systemContent}\n\n${prompt}` : prompt,
  };

  // Only send options this model declares — the accepted values differ per model.
  if (config.aspectRatios.includes(aspectRatio)) payload.aspect_ratio = aspectRatio;
  if (config.resolutions.includes(resolution)) payload.resolution = resolution;

  if (Array.isArray(referenceImages) && referenceImages.length > 0 && config.maxReferences > 0) {
    payload.input_references = referenceImages
      .slice(0, config.maxReferences)
      .map((url: string) => ({ type: "image_url", image_url: { url } }));
  }

  try {
    const res = await fetch(OPENROUTER_IMAGES_URL, {
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
      data?: Array<{ b64_json?: string; url?: string; media_type?: string }>;
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
      return NextResponse.json({ error: errMsg }, { status: ok ? 400 : status });
    }

    const first = data.data?.[0];
    const imageUrl = first?.url
      ? first.url
      : first?.b64_json
        ? `data:${first.media_type ?? "image/png"};base64,${first.b64_json}`
        : null;

    if (!imageUrl) {
      return NextResponse.json(
        { error: "Could not extract image from response" },
        { status: 500 }
      );
    }

    return NextResponse.json({ imageUrl, model });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to generate image" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const apiKey = readOpenRouterKey(request);
  if (!apiKey) {
    return NextResponse.json({ error: "Missing API key" }, { status: 401 });
  }

  const { prompt, brandContext, model, aspectRatio, resolution, referenceImages } = await request.json();

  if (!prompt || !model) {
    return NextResponse.json(
      { error: "Prompt and model are required" },
      { status: 400 }
    );
  }

  const isGeminiFlash = model === "google/gemini-3.1-flash-image-preview";
  const validAspect =
    VALID_ASPECT_RATIOS.has(aspectRatio) || (isGeminiFlash && EXTENDED_ASPECT_RATIOS.has(aspectRatio))
      ? aspectRatio
      : "1:1";
  const validResolution = VALID_RESOLUTIONS.has(resolution) ? resolution : "1K";

  const systemContent: string | null = brandContext
    ? (brandContext.customSystemPrompt ??
      [
        "The user wants the generated image to match a specific brand identity. Apply the following brand guidelines to the image:",
        "",
        `Visual style: ${brandContext.stylePrompt}`,
        `Color palette: ${brandContext.colors?.join(", ")}`,
        `Personality: ${brandContext.personality?.join(", ")}`,
        `Visual descriptors: ${brandContext.visualStyle?.join(", ")}`,
        "",
        "Incorporate these brand elements naturally into the image. The user's prompt below describes what to generate — the brand context above describes how it should look and feel.",
      ].join("\n"))
    : null;

  // Models listed by /api/v1/images/models are served by the dedicated images endpoint;
  // anything else stays on chat completions, including when the catalogue is unreachable.
  const imageModelConfig = (await getImageModelConfigs())[model];
  if (imageModelConfig) {
    return generateViaImagesEndpoint({
      apiKey,
      model,
      prompt,
      systemContent,
      config: imageModelConfig,
      aspectRatio: validAspect,
      resolution: validResolution,
      referenceImages,
    });
  }

  // Build messages with brand context as a system message when available
  type ContentPart =
    | { type: "text"; text: string }
    | { type: "image_url"; imageUrl: { url: string } };
  const messages: Array<
    | { role: "system"; content: string }
    | { role: "user"; content: string | ContentPart[] }
  > = [];

  if (systemContent) {
    messages.push({
      role: "system" as const,
      content: systemContent,
    });
  }

  // Build user message — multipart when reference images are provided
  if (Array.isArray(referenceImages) && referenceImages.length > 0) {
    const contentParts: ContentPart[] = [
      { type: "text", text: prompt },
      ...referenceImages.map((url: string) => ({
        type: "image_url" as const,
        imageUrl: { url },
      })),
    ];
    messages.push({ role: "user" as const, content: contentParts });
  } else {
    messages.push({ role: "user" as const, content: prompt });
  }

  try {
    const client = createClient(apiKey);

    const result = await client.chat.send({
      chatGenerationParams: {
        model,
        messages,
        modalities: ["image"],
        imageConfig: {
          aspect_ratio: validAspect,
          image_size: validResolution,
        },
      },
    });

    const message = result.choices?.[0]?.message as Record<string, unknown>;
    if (!message) {
      throw new Error("No response from model");
    }

    // Extract image from response. The SDK may return images in several places:
    // 1. message.images[] — dedicated array with { imageUrl: { url } } objects
    // 2. message.content[] — content parts with type "image_url" and { imageUrl: { url } }
    // 3. message.content as a string — raw base64 data URL
    let imageUrl: string | null = null;

    // Check message.images first (SDK-parsed dedicated field)
    const images = message.images as Array<{ imageUrl?: { url?: string } }> | undefined;
    if (Array.isArray(images) && images.length > 0) {
      imageUrl = images[0]?.imageUrl?.url ?? null;
    }

    // Fall back to content array parts (SDK uses camelCase imageUrl)
    if (!imageUrl && Array.isArray(message.content)) {
      for (const part of message.content as Array<Record<string, unknown>>) {
        if (part.type === "image_url") {
          const img = part.imageUrl as { url?: string } | undefined;
          if (img?.url) {
            imageUrl = img.url;
            break;
          }
        }
      }
    }

    // Fall back to string content (raw base64 data URL)
    if (!imageUrl && typeof message.content === "string") {
      if ((message.content as string).startsWith("data:image")) {
        imageUrl = message.content as string;
      }
    }

    if (!imageUrl) {
      return NextResponse.json({
        error: "Could not extract image from response",
        raw: message,
      }, { status: 500 });
    }

    return NextResponse.json({ imageUrl, model: result.model });
  } catch (err: unknown) {
    let message = "Failed to generate image";
    let statusCode = 500;

    if (err instanceof Error) {
      message = err.message;

      // OpenRouter SDK errors carry structured detail in .body or .error
      const sdkErr = err as unknown as Record<string, unknown>;

      // Typed SDK errors (BadGatewayResponseError, etc.) have .error.message
      if (sdkErr.error && typeof sdkErr.error === "object") {
        const nested = sdkErr.error as Record<string, unknown>;
        if (typeof nested.message === "string" && nested.message) {
          message = nested.message;
        }
      }

      // Fallback: parse the raw body string for more detail
      if (message === err.message && typeof sdkErr.body === "string") {
        try {
          const body = JSON.parse(sdkErr.body);
          const detail = body?.error?.message || body?.error?.metadata?.raw;
          if (typeof detail === "string" && detail) {
            message = detail;
          }
        } catch {}
      }

      if (typeof sdkErr.statusCode === "number") {
        statusCode = sdkErr.statusCode;
      }
    }

    return NextResponse.json({ error: message }, { status: statusCode });
  }
}
