"use client";

import type { VideoModelConfig } from "@/lib/types";
import {
  describeTariff,
  estimateVideoCost,
  formatCostEstimate,
} from "@/lib/video-pricing";

/**
 * Compact pricing panel for the selected video model: the published tariff, plus a cost
 * figure for the current settings when the tariff can be applied to them.
 *
 * Purely informational — it never blocks generation, and shows nothing rather than a
 * number it cannot stand behind.
 */
export default function VideoPricing({
  modelId,
  config,
  resolution,
  aspectRatio,
  generateAudio,
  referenceImageCount,
  duration,
  script,
}: {
  modelId: string;
  config: VideoModelConfig | null;
  resolution: string;
  aspectRatio: string;
  generateAudio: boolean;
  /** Reference images travel as `input_references`, not as image-to-video frames. */
  referenceImageCount: number;
  /** Omitted for models without a duration control. */
  duration?: number;
  /** Spoken script, for models whose length follows the speech. */
  script?: string;
}) {
  const tariff = describeTariff(config);
  const estimate = estimateVideoCost({
    modelId,
    config,
    resolution,
    aspectRatio,
    generateAudio,
    referenceImageCount,
    duration,
    script,
  });
  const amount = formatCostEstimate(estimate);

  return (
    <div className="px-4 py-3 bg-surface/60 border border-border rounded-xl space-y-2.5">
      <div className="flex items-baseline justify-between gap-4">
        <span className="text-[10px] font-medium text-muted uppercase tracking-[0.15em]">
          Pricing
        </span>
        {tariff.length === 0 && (
          <span className="text-xs text-muted/70">Pricing unavailable</span>
        )}
      </div>

      {tariff.length > 0 && (
        <div className="space-y-1">
          {tariff.map((row) => (
            <div key={row.label + row.rate} className="flex items-baseline justify-between gap-4 text-xs">
              <span className="text-muted/80">{row.label || "All settings"}</span>
              <span className="text-foreground/90 font-mono">{row.rate}</span>
            </div>
          ))}
        </div>
      )}

      {amount ? (
        <div className="pt-2 border-t border-border/60 flex items-baseline justify-between gap-4">
          <span className="text-xs text-muted">
            Estimated cost
            {estimate.estimatedDurationRange && (
              <span className="text-muted/70">
                {" "}
                (~
                {estimate.estimatedDurationRange.min ===
                estimate.estimatedDurationRange.max
                  ? estimate.estimatedDurationRange.min
                  : `${estimate.estimatedDurationRange.min}–${estimate.estimatedDurationRange.max}`}
                s of speech)
              </span>
            )}
          </span>
          <span className="text-sm text-accent font-mono">{amount}</span>
        </div>
      ) : (
        tariff.length > 0 && (
          <div className="pt-2 border-t border-border/60">
            <p className="text-xs text-muted/80 leading-relaxed">
              Cost calculated after generation.
              {estimate.explanation ? ` ${estimate.explanation}` : ""}
            </p>
          </div>
        )
      )}
    </div>
  );
}
