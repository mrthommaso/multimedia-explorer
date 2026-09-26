export const DEFAULT_TEXT_MODEL = "openai/gpt-5.4-mini";

export interface ReferenceImage {
  id: string;
  url: string;
  name: string;
}

export type CardId = "mood" | "model" | "inputImages" | "output";

export const ASPECT_RATIOS = ["1:1", "16:9", "9:16", "4:3", "3:2"];
export const EXTENDED_ASPECT_RATIOS = ["1:4", "4:1", "1:8", "8:1"];
export const RESOLUTIONS = ["1K", "2K", "4K"];

/** Default fallbacks for unknown video models */
export const VIDEO_ASPECT_RATIOS = ["16:9", "9:16", "1:1"];
export const VIDEO_RESOLUTIONS = ["720p", "1080p"];
export const VIDEO_DURATIONS = [5, 10, 15];

export interface VideoModelConfig {
  durations: number[];
  resolutions: string[];
  aspectRatios: string[];
  supportsAudio: boolean;
  /** When true, audio generation is mandatory and cannot be toggled off */
  requiresAudio?: boolean;
  /** Provider-specific keys this model accepts, from `allowed_passthrough_parameters`. */
  passthroughParameters: string[];
  /**
   * OpenRouter's `pricing_skus` for this model, kept in its published form: a map of SKU
   * key to price. The keys encode their own dimensions (resolution, audio, input mode), so
   * flattening this to a single rate would be wrong for multi-SKU models.
   */
  pricingSkus: Record<string, string>;
}

/**
 * Video models whose prompt is a spoken script rather than a description of a scene, and
 * which animate one supplied portrait.
 *
 * This is a semantic profile, not a capability: `allowed_passthrough_parameters` states
 * which provider keys a model accepts, not what its prompt means or whether an image is
 * mandatory. Accepting a `voice_id` does not by itself imply any of that, so the models
 * carrying these semantics are named explicitly and reviewed as they are added. Which
 * controls appear for them stays driven by the live parameter list.
 */
const SCRIPT_VIDEO_MODELS = new Set(["heygen/avatar-iv"]);

export function isScriptVideoModel(modelId: string): boolean {
  return SCRIPT_VIDEO_MODELS.has(modelId);
}

/** Script-avatar models animate exactly one source portrait. */
export const SCRIPT_MODEL_MAX_REFERENCES = 1;

/** Models where audio generation is mandatory */
export const REQUIRES_AUDIO_MODELS = new Set(["openai/sora-2-pro"]);

export const DEFAULT_VIDEO_CONFIG: VideoModelConfig = {
  durations: VIDEO_DURATIONS,
  resolutions: VIDEO_RESOLUTIONS,
  aspectRatios: VIDEO_ASPECT_RATIOS,
  supportsAudio: false,
  passthroughParameters: [],
  pricingSkus: {},
};

export type MediaResult =
  | { type: "image"; imageUrl: string; model: string }
  | {
      type: "video";
      videoUrl: string;
      model: string;
      /** Actual cost in USD as reported by OpenRouter, when the job returned one. */
      costUsd?: number;
    };

export interface HistoryEntry {
  id: string;
  timestamp: number;
  /** Loaded from IndexedDB at runtime, not persisted in localStorage */
  imageUrl?: string;
  model: string;
  prompt: string;
  brandData: import("@/components/moodboard").BrandData | null;
  referenceImages: ReferenceImage[];
  aspectRatio: string;
  resolution: string;
  mediaType?: "image" | "video";
  duration?: number;
  generateAudio?: boolean;
  videoJobId?: string;
  /**
   * Actual cost in USD reported by OpenRouter for this generation. Optional: entries
   * written before cost was recorded, or jobs that reported none, simply omit it.
   */
  actualCostUsd?: number;
}

/**
 * Request options accepted by an image model that OpenRouter serves from
 * `POST /api/v1/images`, taken from that endpoint's own catalogue. Models without an entry
 * are not served there and go through chat completions instead.
 */
export interface ImageModelConfig {
  aspectRatios: string[];
  resolutions: string[];
  /** Image-to-image models reject a request that has no reference image. */
  requiresReference: boolean;
  maxReferences: number;
}
