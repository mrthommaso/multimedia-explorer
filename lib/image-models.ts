import { type ImageModelConfig } from "@/lib/types";

const MODELS_URL = "https://openrouter.ai/api/v1/models?output_modalities=image";
const IMAGE_MODELS_URL = "https://openrouter.ai/api/v1/images/models";
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes, matching the models route

let cache: { data: Record<string, ImageModelConfig>; ts: number } | null = null;

type EnumParam = { type?: string; values?: string[] };
type RangeParam = { type?: string; min?: number; max?: number };

function enumValues(param: unknown): string[] {
  const values = (param as EnumParam | undefined)?.values;
  return Array.isArray(values) ? values.filter((v) => typeof v === "string") : [];
}

/**
 * Capability lookup for image models, merged from two public catalogues:
 *
 * - `/api/v1/models?output_modalities=image` says whether a model can emit text. One that
 *   cannot is not a chat model, so chat completions rejects it ("Use the /api/v1/images
 *   endpoint instead") — that is the routing signal.
 * - `/api/v1/images/models` lists the parameters each dedicated-endpoint model accepts.
 *
 * Both are unauthenticated, so this never touches the caller's key. On failure the cache
 * stays empty and callers fall back to the chat path, i.e. upstream's behaviour.
 */
export async function getImageModelConfigs(): Promise<Record<string, ImageModelConfig>> {
  if (cache && Date.now() - cache.ts < CACHE_TTL) return cache.data;

  try {
    const [modelsRes, imageModelsRes] = await Promise.all([
      fetch(MODELS_URL),
      fetch(IMAGE_MODELS_URL),
    ]);
    if (!modelsRes.ok || !imageModelsRes.ok) return cache?.data ?? {};

    const models = (await modelsRes.json())?.data ?? [];
    const imageModels = (await imageModelsRes.json())?.data ?? [];

    const params = new Map<string, Record<string, unknown>>();
    for (const m of imageModels) {
      params.set(m.id, (m.supported_parameters ?? {}) as Record<string, unknown>);
    }

    const configs: Record<string, ImageModelConfig> = {};
    for (const m of models) {
      const outputs: string[] = m.architecture?.output_modalities ?? [];
      const supported = params.get(m.id) ?? {};
      const references = supported.input_references as RangeParam | undefined;

      configs[m.id] = {
        endpoint: outputs.includes("text") ? "chat" : "images",
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
