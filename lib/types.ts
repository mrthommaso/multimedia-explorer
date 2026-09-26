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
}

/**
 * Whether a video model speaks its prompt instead of depicting it.
 *
 * A model that accepts a `voice_id` passthrough parameter is a talking-avatar model: the
 * prompt is a spoken script and the model animates a supplied portrait rather than
 * generating a scene. OpenRouter exposes no dedicated flag for this, so the capability is
 * inferred from the live parameter list, which keeps it generic for future avatar models
 * instead of hardcoding a model id.
 */
export function isScriptVideoModel(
  config: VideoModelConfig | null | undefined
): boolean {
  return config?.passthroughParameters.includes("voice_id") ?? false;
}

/** Avatar-style models animate exactly one source portrait. */
export const SCRIPT_MODEL_MAX_REFERENCES = 1;

/** Models where audio generation is mandatory */
export const REQUIRES_AUDIO_MODELS = new Set(["openai/sora-2-pro"]);

export const DEFAULT_VIDEO_CONFIG: VideoModelConfig = {
  durations: VIDEO_DURATIONS,
  resolutions: VIDEO_RESOLUTIONS,
  aspectRatios: VIDEO_ASPECT_RATIOS,
  supportsAudio: false,
  passthroughParameters: [],
};

export type MediaResult =
  | { type: "image"; imageUrl: string; model: string }
  | { type: "video"; videoUrl: string; model: string };

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
