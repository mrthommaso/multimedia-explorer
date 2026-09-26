import type { VideoModelConfig } from "@/lib/types";

/**
 * Pricing for video models, derived from the `pricing_skus` map OpenRouter publishes per
 * model. Nothing here is model-specific: SKU keys encode their own dimensions, so the
 * rules below read those dimensions rather than knowing anything about a given provider.
 *
 * Keys seen in the live catalogue take the form
 *   `[<input mode>_]<unit>[_<resolution>][_with(out)_audio][_with_video_input]`
 * for example `duration_seconds`, `duration_seconds_with_audio_4k`,
 * `text_to_video_duration_seconds_720p`, `cents_per_second_output_1080p`,
 * `video_tokens_without_audio`.
 */

/** How a SKU's published number converts into money. */
export type SkuUnit =
  /** USD per second of output video. */
  | "usdPerSecond"
  /** Cents per second of output video. */
  | "centsPerSecond"
  /** USD per provider-defined video token. */
  | "usdPerToken"
  /** A floor on the total, not a rate. */
  | "minimumUsd"
  /** A charge we do not model (per-input-image fees, per-megapixel units, …). */
  | "other";

export interface ParsedSku {
  key: string;
  /** The published number, as-is. */
  price: number;
  unit: SkuUnit;
  /** Normalised resolution the SKU is restricted to, e.g. `720p`, `4K`. */
  resolution?: string;
  /** True = only with audio, false = only without audio, undefined = either. */
  audio?: boolean;
  /** Input mode the SKU is restricted to. */
  inputMode?: "text" | "image" | "video";
  /** Which dimensions this SKU pins down; used to compare how specific SKUs are. */
  pinned: ReadonlyArray<"resolution" | "audio" | "inputMode">;
}

export type CostConfidence = "exact" | "estimated" | "unavailable";

export interface CostEstimate {
  confidence: CostConfidence;
  currency?: "USD";
  /** Point estimate, when the inputs are known precisely. */
  amount?: number;
  /** Range, when an input (e.g. spoken duration) is itself estimated. */
  minAmount?: number;
  maxAmount?: number;
  /** Human-readable rate actually applied, e.g. `$0.112 / second`. */
  rateLabel?: string;
  /** Short reason, shown when no number can be given. */
  explanation?: string;
  /** Duration used, when it had to be derived rather than chosen. */
  estimatedDurationRange?: { min: number; max: number };
}

export interface TariffRow {
  /** Dimensions this rate applies to, e.g. `720p, with audio`. Empty when it is the only rate. */
  label: string;
  /** e.g. `$0.05 / second`. */
  rate: string;
}

const RESOLUTION_TOKENS = ["480p", "720p", "768p", "1024p", "1080p", "4k"];

function normaliseResolution(token: string): string {
  return token.toLowerCase() === "4k" ? "4K" : token.toLowerCase();
}

/** Parse one SKU key into the dimensions it pins down. Unknown shapes become `other`. */
function parseSkuKey(key: string, rawPrice: string): ParsedSku | null {
  const price = Number(rawPrice);
  if (!Number.isFinite(price)) return null;

  let rest = key.toLowerCase();
  const sku: ParsedSku = { key, price, unit: "other", pinned: [] };

  // Input mode prefixes
  if (rest.startsWith("text_to_video_")) {
    sku.inputMode = "text";
    rest = rest.slice("text_to_video_".length);
  } else if (rest.startsWith("image_to_video_")) {
    sku.inputMode = "image";
    rest = rest.slice("image_to_video_".length);
  }

  // Audio qualifier
  if (rest.includes("_with_audio")) {
    sku.audio = true;
    rest = rest.replace("_with_audio", "");
  } else if (rest.includes("_without_audio")) {
    sku.audio = false;
    rest = rest.replace("_without_audio", "");
  }

  // Video input qualifier (video-to-video pricing)
  if (rest.includes("_with_video_input")) {
    sku.inputMode = "video";
    rest = rest.replace("_with_video_input", "");
  }

  // Resolution suffix
  for (const token of RESOLUTION_TOKENS) {
    if (rest.endsWith(`_${token}`)) {
      sku.resolution = normaliseResolution(token);
      rest = rest.slice(0, -(token.length + 1));
      break;
    }
  }

  // Remaining stem determines the unit
  if (rest === "duration_seconds") sku.unit = "usdPerSecond";
  else if (rest === "cents_per_second_output" || rest === "cents_per_video_output_second")
    sku.unit = "centsPerSecond";
  else if (rest === "video_tokens") sku.unit = "usdPerToken";
  else if (rest === "minimum_cents_per_generation") sku.unit = "minimumUsd";
  else sku.unit = "other";

  sku.pinned = [
    ...(sku.resolution ? (["resolution"] as const) : []),
    ...(sku.audio !== undefined ? (["audio"] as const) : []),
    ...(sku.inputMode ? (["inputMode"] as const) : []),
  ];
  return sku;
}

export function parsePricingSkus(skus: Record<string, string> | undefined): ParsedSku[] {
  if (!skus) return [];
  const parsed: ParsedSku[] = [];
  for (const [key, value] of Object.entries(skus)) {
    const sku = parseSkuKey(key, value);
    if (sku) parsed.push(sku);
  }
  return parsed;
}

function perSecondUsd(sku: ParsedSku): number | null {
  if (sku.unit === "usdPerSecond") return sku.price;
  if (sku.unit === "centsPerSecond") return sku.price / 100;
  return null;
}

function formatUsd(amount: number): string {
  // Per-token rates are far below a cent, where fixed decimals would render $0.00.
  if (amount > 0 && amount < 0.001) return `$${Number(amount.toPrecision(3))}`;

  // Otherwise keep real precision (a $0.112/second rate must not round to $0.11) while
  // still showing money with at least two decimals.
  const trimmed = amount.toFixed(4).replace(/0+$/, "");
  const padded = trimmed.endsWith(".")
    ? `${trimmed}00`
    : /\.\d$/.test(trimmed)
      ? `${trimmed}0`
      : trimmed;
  return `$${padded}`;
}

function describeDimensions(sku: ParsedSku): string {
  const parts: string[] = [];
  if (sku.resolution) parts.push(sku.resolution);
  if (sku.audio === true) parts.push("with audio");
  if (sku.audio === false) parts.push("without audio");
  if (sku.inputMode === "image") parts.push("image input");
  if (sku.inputMode === "video") parts.push("video input");
  if (sku.inputMode === "text") parts.push("text only");
  return parts.join(", ");
}

/**
 * Compact, human-readable tariff for the currently selected model. Rates we can express
 * per second are shown as such; anything else is listed with its raw unit so the UI never
 * invents a label the metadata does not support.
 */
export function describeTariff(config: VideoModelConfig | null | undefined): TariffRow[] {
  const skus = parsePricingSkus(config?.pricingSkus);
  if (skus.length === 0) return [];

  return skus.map((sku) => {
    const perSecond = perSecondUsd(sku);
    if (perSecond !== null) {
      return { label: describeDimensions(sku), rate: `${formatUsd(perSecond)} / second` };
    }
    if (sku.unit === "usdPerToken") {
      return { label: describeDimensions(sku), rate: `${formatUsd(sku.price)} / video token` };
    }
    if (sku.unit === "minimumUsd") {
      return { label: "minimum per generation", rate: formatUsd(sku.price / 100) };
    }
    // Unrecognised unit: show the key so the number is never mislabelled.
    return { label: sku.key.replace(/_/g, " "), rate: String(sku.price) };
  });
}

/**
 * Words per second used to turn a script into a spoken duration.
 *
 * Deliberately a range, not a magic constant: delivery speed varies by voice, language and
 * punctuation, so a point estimate would imply precision we do not have. Roughly 2.0–2.7
 * words/second spans an unhurried to brisk narration pace.
 */
const SPEECH_WORDS_PER_SECOND = { slow: 2.0, fast: 2.7 };

/** Spoken-duration range for a script, in seconds. Returns null for an empty script. */
export function estimateScriptDurationSeconds(
  script: string
): { min: number; max: number } | null {
  const words = script.trim().split(/\s+/).filter(Boolean).length;
  if (words === 0) return null;
  return {
    min: Math.max(1, Math.round(words / SPEECH_WORDS_PER_SECOND.fast)),
    max: Math.max(1, Math.round(words / SPEECH_WORDS_PER_SECOND.slow)),
  };
}

/**
 * Families whose video-token count OpenRouter publishes a formula for:
 *
 *   tokens = (width × height × fps × duration) / 1024
 *
 * Listed explicitly per model rather than inferred from the `video_tokens` unit, because
 * the unit says what a token costs, not how many a generation produces. A token-priced
 * model absent from here stays `unavailable` instead of being given a guessed formula.
 */
const VIDEO_TOKEN_FORMULAS: Record<string, { fps: number }> = {
  "bytedance/seedance-2.5": { fps: 24 },
  "bytedance/seedance-2.0": { fps: 24 },
  "bytedance/seedance-2.0-fast": { fps: 24 },
  "bytedance/seedance-2.0-mini": { fps: 24 },
  "bytedance/seedance-1-5-pro": { fps: 24 },
};

/** Nominal frame height each resolution label denotes. */
const RESOLUTION_HEIGHTS: Record<string, number> = {
  "480p": 480,
  "720p": 720,
  "768p": 768,
  "1024p": 1024,
  "1080p": 1080,
  "4K": 2160,
};

function parseAspectRatio(ratio: string): number | null {
  const [w, h] = ratio.split(":").map(Number);
  return Number.isFinite(w) && Number.isFinite(h) && h > 0 ? w / h : null;
}

/**
 * Exact output dimensions for a request, taken from the model's own `supported_sizes`.
 *
 * The size is the one whose aspect ratio matches the request and whose pixel count sits
 * closest to what the resolution label denotes. Nothing is derived when the model
 * publishes no sizes, or none match — a guessed frame size would silently scale the whole
 * token estimate.
 */
function resolveOutputSize(
  config: VideoModelConfig,
  resolution: string,
  aspectRatio: string
): { width: number; height: number } | null {
  const target = parseAspectRatio(aspectRatio);
  const nominalHeight = RESOLUTION_HEIGHTS[resolution];
  if (target === null || !nominalHeight) return null;
  // A resolution the model does not offer would otherwise fall back to the nearest size
  // it does, quietly pricing a different frame than the one requested.
  if (config.resolutions.length > 0 && !config.resolutions.includes(resolution)) return null;

  const sizes = config.supportedSizes
    .map((size) => {
      const [width, height] = size.split("x").map(Number);
      return Number.isFinite(width) && Number.isFinite(height) && height > 0
        ? { width, height }
        : null;
    })
    .filter((s): s is { width: number; height: number } => s !== null);

  const matching = sizes.filter(
    (s) => Math.abs(s.width / s.height - target) / target < 0.05
  );
  if (matching.length === 0) return null;

  const nominalArea = (16 / 9) * nominalHeight * nominalHeight;
  return matching.reduce((best, s) =>
    Math.abs(s.width * s.height - nominalArea) <
    Math.abs(best.width * best.height - nominalArea)
      ? s
      : best
  );
}

export interface CostEstimateParams {
  /** Model id, needed to look up a documented token formula. */
  modelId: string;
  config: VideoModelConfig | null | undefined;
  resolution: string;
  aspectRatio: string;
  generateAudio: boolean;
  /**
   * How many reference images the request carries. These travel as `input_references`
   * (reference-to-video) and deliberately do **not** select image-to-video pricing; they
   * only matter for per-input-image charges.
   */
  referenceImageCount: number;
  /**
   * True only when the request sends `frame_images`, which is what image-to-video pricing
   * describes. This fork does not implement frame images, so it is always false today.
   */
  usesFrameImages?: boolean;
  /** Chosen clip length, when the model exposes a duration control. */
  duration?: number;
  /** Spoken script, for models whose length follows the speech. */
  script?: string;
}

/** True when `a` constrains a strict superset of the dimensions `b` constrains. */
function dominates(a: ParsedSku, b: ParsedSku): boolean {
  return (
    a.pinned.length > b.pinned.length && b.pinned.every((dim) => a.pinned.includes(dim))
  );
}

/**
 * Pick the single SKU that applies to this request.
 *
 * Only dimensions the SKU itself declares are considered. A SKU that constrains a strict
 * superset of another's dimensions replaces it, since it describes the same request more
 * precisely. What is deliberately *not* done is ranking SKUs that pin different dimensions
 * — a `with_audio` rate and a `720p text_to_video` rate each describe the request equally
 * well, and the metadata does not say how they combine, so a disagreement between them is
 * reported as ambiguous instead of resolved by picking one.
 */
function selectSku(
  skus: ParsedSku[],
  params: Pick<
    CostEstimateParams,
    "resolution" | "generateAudio" | "usesFrameImages"
  >
): { sku: ParsedSku } | { ambiguous: true } | null {
  // `image_to_video_*` prices a frame-image request. Reference images are a different
  // input (`input_references`) and must not switch the request onto that tariff.
  const requestedMode = params.usesFrameImages ? "image" : "text";

  const candidates = skus.filter((sku) => {
    if (sku.unit === "other" || sku.unit === "minimumUsd") return false;
    if (sku.resolution && sku.resolution !== params.resolution) return false;
    if (sku.audio !== undefined && sku.audio !== params.generateAudio) return false;
    // A video-input SKU never applies here: this app submits text or image references only.
    if (sku.inputMode === "video") return false;
    if (sku.inputMode && sku.inputMode !== requestedMode) return false;
    return true;
  });

  if (candidates.length === 0) return null;

  const top = candidates.filter(
    (sku) => !candidates.some((other) => dominates(other, sku))
  );

  const prices = new Set(top.map((s) => `${s.unit}:${s.price}`));
  if (prices.size > 1) return { ambiguous: true };
  return { sku: top[0] };
}

/**
 * Cost of the current generation according to the published tariff.
 *
 * `exact` means the SKU match and every input are known, so the figure follows directly
 * from the current tariff — not that billing is guaranteed. `estimated` means an input had
 * to be derived (a script's spoken length). `unavailable` means the tariff cannot be turned
 * into a number for this request, in which case the caller still shows the rates.
 */
/** Per-input-image charges only bite when the request actually carries reference images. */
function isPerInputImage(sku: ParsedSku): boolean {
  const key = sku.key.toLowerCase();
  return key.includes("image_input") || key === "reference_images";
}

export function estimateVideoCost(params: CostEstimateParams): CostEstimate {
  const skus = parsePricingSkus(params.config?.pricingSkus);
  if (skus.length === 0) {
    return { confidence: "unavailable", explanation: "No pricing published for this model." };
  }

  // Charges that sit alongside the chosen rate rather than replacing it. A minimum we can
  // apply; anything else that might add to this request means the total is not ours to
  // state, so the tariff is shown instead of a number that ignores it.
  const minimumUsd = skus
    .filter((s) => s.unit === "minimumUsd")
    .reduce<number | null>((min, s) => Math.max(min ?? 0, s.price / 100), null);

  const unmodelledCharge = skus.some(
    (s) => s.unit === "other" && (params.referenceImageCount > 0 || !isPerInputImage(s))
  );
  if (unmodelledCharge) {
    return {
      confidence: "unavailable",
      explanation: "This model publishes an additional charge we cannot apply up front.",
    };
  }

  const selection = selectSku(skus, params);
  if (!selection) {
    return { confidence: "unavailable", explanation: "No rate matches these settings." };
  }
  if ("ambiguous" in selection) {
    return {
      confidence: "unavailable",
      explanation: "Several rates could apply to these settings.",
    };
  }

  const { sku } = selection;
  const withMinimum = (amount: number) =>
    minimumUsd !== null ? Math.max(amount, minimumUsd) : amount;

  // Token-priced models: usable only where OpenRouter documents the token formula and the
  // exact output size can be read from the model's own supported sizes.
  if (sku.unit === "usdPerToken") {
    const formula = VIDEO_TOKEN_FORMULAS[params.modelId];
    const size = params.config
      ? resolveOutputSize(params.config, params.resolution, params.aspectRatio)
      : null;

    if (!formula || !size) {
      return {
        confidence: "unavailable",
        explanation: !formula
          ? "Priced per video token; no token formula is published for this model."
          : "Priced per video token; the output frame size cannot be determined from these settings.",
      };
    }
    if (typeof params.duration !== "number" || params.duration <= 0) {
      return {
        confidence: "unavailable",
        explanation: "Priced per video token; a duration is needed to count them.",
      };
    }

    const tokensPerSecond = (size.width * size.height * formula.fps) / 1024;
    const perSecond = tokensPerSecond * sku.price;
    return {
      confidence: "exact",
      currency: "USD",
      amount: withMinimum(perSecond * params.duration),
      rateLabel: `${formatUsd(perSecond)} / second at ${size.width}×${size.height}`,
    };
  }

  const perSecond = perSecondUsd(sku);
  if (perSecond === null) {
    return {
      confidence: "unavailable",
      explanation: "This model's pricing unit cannot be applied before generation.",
    };
  }

  const rateLabel = `${formatUsd(perSecond)} / second`;

  // Models with an explicit duration control: a single, exact figure.
  if (typeof params.duration === "number" && params.duration > 0) {
    return {
      confidence: "exact",
      currency: "USD",
      amount: withMinimum(perSecond * params.duration),
      rateLabel,
    };
  }

  // Script-driven length: a range, never a point estimate.
  const spoken = params.script ? estimateScriptDurationSeconds(params.script) : null;
  if (spoken) {
    return {
      confidence: "estimated",
      currency: "USD",
      minAmount: withMinimum(perSecond * spoken.min),
      maxAmount: withMinimum(perSecond * spoken.max),
      rateLabel,
      estimatedDurationRange: spoken,
    };
  }

  return {
    confidence: "unavailable",
    rateLabel,
    explanation: "Length is set by the script, so cost is known after generation.",
  };
}

/** `$1.20`, or `~$0.45–$0.55` for a range. Null when there is no figure to show. */
export function formatCostEstimate(estimate: CostEstimate): string | null {
  if (estimate.amount !== undefined) return formatUsd(estimate.amount);
  if (estimate.minAmount !== undefined && estimate.maxAmount !== undefined) {
    return estimate.minAmount === estimate.maxAmount
      ? `~${formatUsd(estimate.minAmount)}`
      : `~${formatUsd(estimate.minAmount)}–${formatUsd(estimate.maxAmount)}`;
  }
  return null;
}

/** Actual cost reported by OpenRouter, e.g. `$0.47`. */
export function formatActualCost(cost: number): string {
  return formatUsd(cost);
}
