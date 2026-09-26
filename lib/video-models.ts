import { type VideoModelConfig, REQUIRES_AUDIO_MODELS } from "@/lib/types";

const VIDEO_MODELS_URL = "https://openrouter.ai/api/v1/videos/models";
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes, matching the models route

let configCache: { data: Record<string, VideoModelConfig>; ts: number } | null = null;
const slugCache = new Map<string, { slug: string | null; ts: number }>();

/**
 * Per-model video capabilities straight from OpenRouter's catalogue, including the
 * provider-specific keys each model accepts (`allowed_passthrough_parameters`).
 *
 * Unauthenticated, so this never touches the caller's key. On failure the last good cache
 * is reused and callers fall back to conservative defaults.
 */
export async function getVideoModelConfigs(): Promise<Record<string, VideoModelConfig>> {
  if (configCache && Date.now() - configCache.ts < CACHE_TTL) return configCache.data;

  try {
    const res = await fetch(VIDEO_MODELS_URL);
    if (!res.ok) return configCache?.data ?? {};

    const json = await res.json();
    const models = Array.isArray(json) ? json : (json.data ?? []);

    const configs: Record<string, VideoModelConfig> = {};
    for (const m of models) {
      configs[m.id] = {
        durations: m.supported_durations ?? [],
        resolutions: m.supported_resolutions ?? [],
        aspectRatios: m.supported_aspect_ratios ?? [],
        supportsAudio: m.generate_audio === true,
        passthroughParameters: m.allowed_passthrough_parameters ?? [],
        // Kept as published; unusual shapes are handled by the pricing layer rather
        // than rejected here, so one odd model cannot break model discovery.
        pricingSkus:
          m.pricing_skus && typeof m.pricing_skus === "object" ? m.pricing_skus : {},
        supportedSizes: Array.isArray(m.supported_sizes) ? m.supported_sizes : [],
        ...(REQUIRES_AUDIO_MODELS.has(m.id) && { requiresAudio: true }),
      };
    }

    configCache = { data: configs, ts: Date.now() };
    return configs;
  } catch {
    return configCache?.data ?? {};
  }
}

/**
 * Slug that keys `provider.options` for a model. The video catalogue does not carry it, so
 * it comes from the model's endpoints resource (`tag`) and is resolved per model, on demand,
 * rather than fanning out across the whole catalogue.
 */
export async function getProviderSlug(modelId: string): Promise<string | null> {
  const cached = slugCache.get(modelId);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.slug;

  try {
    const res = await fetch(
      `https://openrouter.ai/api/v1/models/${modelId}/endpoints`
    );
    if (!res.ok) return cached?.slug ?? null;

    const data = (await res.json())?.data;
    const slug: string | null = data?.endpoints?.[0]?.tag ?? null;
    slugCache.set(modelId, { slug, ts: Date.now() });
    return slug;
  } catch {
    return cached?.slug ?? null;
  }
}

/**
 * Narrow the caller's flat option map to what this model actually accepts, then nest it
 * into OpenRouter's `provider.options.<slug>` shape. Unknown or empty keys are dropped,
 * and a model with no usable options produces nothing at all.
 *
 * The keys sit directly under the provider slug: the videos endpoint validates that path
 * itself, rejecting a request with "requires provider.options.heygen.voice_id". (The
 * provider-options cookbook shows an extra `.parameters` level for chat-style calls; the
 * live video validator is what this follows.)
 */
export async function buildProviderOptions(
  model: string,
  requested: unknown
): Promise<Record<string, unknown> | null> {
  if (!requested || typeof requested !== "object" || Array.isArray(requested)) return null;

  const allowed = (await getVideoModelConfigs())[model]?.passthroughParameters ?? [];
  if (allowed.length === 0) return null;

  const options: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(requested as Record<string, unknown>)) {
    if (!allowed.includes(key)) continue;
    if (value === undefined || value === null || value === "") continue;
    options[key] = value;
  }
  if (Object.keys(options).length === 0) return null;

  const slug = await getProviderSlug(model);
  if (!slug) return null;

  return { options: { [slug]: options } };
}
