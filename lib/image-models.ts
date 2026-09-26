import { type ImageModelConfig } from "@/lib/types";

const IMAGE_MODELS_URL = "https://openrouter.ai/api/v1/images/models";
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes, matching the models route

let cache: { data: Record<string, ImageModelConfig>; ts: number } | null = null;

type EnumParam = { values?: string[] };
type RangeParam = { min?: number; max?: number };

function enumValues(param: unknown): string[] {
  const values = (param as EnumParam | undefined)?.values;
  return Array.isArray(values) ? values.filter((v) => typeof v === "string") : [];
}

/**
 * Image models that OpenRouter serves from `POST /api/v1/images`, keyed by model id.
 *
 * `/api/v1/images/models` is the authoritative list of what that endpoint accepts, so
 * membership is the routing signal: a model in this map uses the images endpoint, and a
 * model absent from it goes through chat completions. The same entries carry the
 * parameters each model accepts, so we only send options it actually supports.
 *
 * The catalogue is unauthenticated, so this never touches the caller's key. If it cannot
 * be read the map stays empty and every model falls back to the chat path, as upstream did.
 */
export async function getImageModelConfigs(): Promise<Record<string, ImageModelConfig>> {
  if (cache && Date.now() - cache.ts < CACHE_TTL) return cache.data;

  try {
    const res = await fetch(IMAGE_MODELS_URL);
    if (!res.ok) return cache?.data ?? {};

    const models = (await res.json())?.data ?? [];

    const configs: Record<string, ImageModelConfig> = {};
    for (const model of models) {
      const supported = (model.supported_parameters ?? {}) as Record<string, unknown>;
      const references = supported.input_references as RangeParam | undefined;

      configs[model.id] = {
        aspectRatios: enumValues(supported.aspect_ratio),
        resolutions: enumValues(supported.resolution),
        requiresReference: (references?.min ?? 0) >= 1,
        maxReferences: references?.max ?? 0,
      };
    }

    cache = { data: configs, ts: Date.now() };
    return configs;
  } catch {
    return cache?.data ?? {};
  }
}
