"use client";

import { useState } from "react";
import type { BrandData } from "./moodboard";
import {
  DEFAULT_TEXT_MODEL,
  SCRIPT_MODEL_MAX_REFERENCES,
  isScriptVideoModel,
  type ReferenceImage,
  type MediaResult,
  type VideoModelConfig,
} from "@/lib/types";
import type { ModelOption } from "@/hooks/use-models";
import { parseJsonResponse, fallbackErrorMessage } from "@/lib/safe-json";
import { openRouterKeyHeaders } from "@/lib/api-auth";
import { isCreditError } from "@/lib/credit-error";
import CreditErrorNotice from "./credit-error-notice";
import VideoPricing from "./video-pricing";
import AuthPrompt from "./auth-prompt";

export default function GenerateForm({
  apiKey,
  brandData,
  model,
  textModels,
  referenceImages,
  aspectRatio,
  resolution,
  prompt,
  onPromptChange,
  onResult,
  onLoading,
  isVideoModel,
  videoConfig,
  duration,
  generateAudio,
  onVideoSubmit,
}: {
  apiKey: string | null;
  brandData: BrandData | null;
  model: string;
  textModels: ModelOption[];
  referenceImages: ReferenceImage[];
  aspectRatio: string;
  resolution: string;
  prompt: string;
  onPromptChange: (prompt: string) => void;
  onResult: (result: MediaResult | null) => void;
  onLoading: (loading: boolean) => void;
  isVideoModel: boolean;
  videoConfig: VideoModelConfig | null;
  duration: number;
  generateAudio: boolean;
  onVideoSubmit: (params: {
    model: string;
    prompt: string;
    aspect_ratio: string;
    duration?: number;
    resolution: string;
    generate_audio?: boolean;
    input_references?: Array<{ type: "image_url"; image_url: { url: string } }>;
    providerOptions?: Record<string, unknown>;
  }) => void;
}) {
  const [loading, setLoadingState] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAuthPrompt, setShowAuthPrompt] = useState(false);
  const [improveModel, setImproveModel] = useState(DEFAULT_TEXT_MODEL);
  const [improving, setImproving] = useState(false);
  const [previousPrompt, setPreviousPrompt] = useState<string | null>(null);
  const [voiceId, setVoiceId] = useState("");
  const [motionPrompt, setMotionPrompt] = useState("");
  const [expressiveness, setExpressiveness] = useState("");

  // Script-avatar models speak the prompt and animate one supplied portrait, so the form
  // changes meaning rather than just gaining extra fields. Which controls it then offers
  // still comes from the model's live passthrough parameters.
  const isScriptModel = isVideoModel && isScriptVideoModel(model);
  const allows = (param: string) =>
    videoConfig?.passthroughParameters.includes(param) ?? false;

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    if (!prompt.trim()) return;

    if (!apiKey) {
      setShowAuthPrompt(true);
      return;
    }

    setShowAuthPrompt(false);
    setError(null);

    if (isVideoModel) {
      // Avatar models animate a supplied portrait — without one there is nothing to drive.
      if (isScriptModel && referenceImages.length === 0) {
        setError(
          "This model animates a portrait. Add one image under Input Images before generating."
        );
        return;
      }

      // A spoken script needs a voice; OpenRouter rejects the request without one.
      if (isScriptModel && allows("voice_id") && !voiceId.trim()) {
        setError("Add a Voice ID — this model needs a voice to speak the script.");
        return;
      }

      // Video: delegate to parent's video submission handler
      const usableRefs = isScriptModel
        ? referenceImages.slice(0, SCRIPT_MODEL_MAX_REFERENCES)
        : referenceImages;
      const inputRefs =
        usableRefs.length > 0
          ? usableRefs.map((img) => ({
              type: "image_url" as const,
              image_url: { url: img.url },
            }))
          : undefined;

      // Provider-specific controls, only for parameters this model advertises. The route
      // filters these again against live metadata before forwarding them.
      const providerOptions: Record<string, unknown> = {};
      if (allows("voice_id") && voiceId.trim()) {
        providerOptions.voice_id = voiceId.trim();
      }
      if (allows("motion_prompt") && motionPrompt.trim()) {
        providerOptions.motion_prompt = motionPrompt.trim();
      }
      if (allows("expressiveness") && expressiveness.trim()) {
        // OpenRouter publishes no value metadata for this key, so the typed value is
        // passed through as-is, numeric when it reads as a number.
        const raw = expressiveness.trim();
        const asNumber = Number(raw);
        providerOptions.expressiveness = Number.isFinite(asNumber) ? asNumber : raw;
      }

      onVideoSubmit({
        model,
        prompt: prompt.trim(),
        aspect_ratio: aspectRatio,
        resolution,
        // Only send generic controls the model actually supports.
        ...(videoConfig && videoConfig.durations.length > 0 ? { duration } : {}),
        ...(videoConfig?.supportsAudio ? { generate_audio: generateAudio } : {}),
        input_references: inputRefs,
        ...(Object.keys(providerOptions).length > 0 ? { providerOptions } : {}),
      });
      return;
    }

    // Image generation (existing flow)
    setLoadingState(true);
    onLoading(true);
    onResult(null);

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...openRouterKeyHeaders(apiKey),
        },
        body: JSON.stringify({
          prompt: prompt.trim(),
          brandContext: brandData ?? undefined,
          model,
          aspectRatio,
          resolution,
          referenceImages: referenceImages.length > 0
            ? referenceImages.map((img) => img.url)
            : undefined,
        }),
      });

      const { ok, status, data, text } = await parseJsonResponse<{
        imageUrl?: string;
        model?: string;
        error?: string;
      }>(res);

      if (!ok || !data) {
        throw new Error(data?.error || fallbackErrorMessage(status, text) || "Failed to generate image");
      }

      onResult({ type: "image", imageUrl: data.imageUrl!, model: data.model! });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoadingState(false);
      onLoading(false);
    }
  }

  async function handleImprovePrompt() {
    if (!prompt.trim()) return;

    if (!apiKey) {
      setShowAuthPrompt(true);
      return;
    }

    setImproving(true);
    setError(null);

    try {
      const res = await fetch("/api/improve-prompt", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...openRouterKeyHeaders(apiKey),
        },
        body: JSON.stringify({
          prompt: prompt.trim(),
          model: improveModel,
        }),
      });

      const { ok, status, data, text } = await parseJsonResponse<{
        prompt?: string;
        error?: string;
      }>(res);

      if (!ok || !data) {
        throw new Error(data?.error || fallbackErrorMessage(status, text) || "Failed to improve prompt");
      }

      setPreviousPrompt(prompt);
      onPromptChange(data.prompt!);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to improve prompt");
    } finally {
      setImproving(false);
    }
  }

  function handleUndo() {
    if (previousPrompt !== null) {
      onPromptChange(previousPrompt);
      setPreviousPrompt(null);
    }
  }

  const mediaType = isVideoModel ? "Video" : "Image";

  return (
    <div className="space-y-5">
      <h2 className="text-base font-heading font-bold tracking-tight text-glow-sm">
        // GENERATE {mediaType.toUpperCase()}
      </h2>

      <form onSubmit={handleGenerate} className="space-y-4">
        {isScriptModel && (
          <div>
            <label className="block text-[10px] font-medium text-muted uppercase tracking-[0.15em] mb-1.5">
              Script
            </label>
            <p className="text-xs text-muted/80 mb-2 leading-relaxed">
              What the avatar will say out loud. The clip runs as long as the spoken
              script, so there is no separate duration setting.
            </p>
          </div>
        )}

        {/* Prompt textarea */}
        <textarea
          value={prompt}
          onChange={(e) => {
            onPromptChange(e.target.value);
            // Clear undo when user manually edits
            if (previousPrompt !== null) setPreviousPrompt(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (prompt.trim() && !loading) {
                e.currentTarget.form?.requestSubmit();
              }
            }
          }}
          placeholder={
            isScriptModel
              ? "Cześć! Witam was na lekcji robotyki..."
              : isVideoModel
                ? "Describe the video you want to generate..."
                : "Describe the image you want to generate..."
          }
          rows={3}
          className="w-full px-4 py-3 bg-surface border border-border rounded-xl text-sm text-foreground placeholder:text-muted/70 focus:outline-none focus:border-accent/60 focus:shadow-[0_0_12px_rgba(59,130,246,0.15)] transition-all resize-none"
        />

        {isScriptModel && (
          <div className="space-y-4 p-4 bg-surface/60 border border-border rounded-xl">
            {allows("motion_prompt") && (
              <div>
                <label className="block text-[10px] font-medium text-muted uppercase tracking-[0.15em] mb-1.5">
                  Motion instructions
                </label>
                <p className="text-xs text-muted/80 mb-2 leading-relaxed">
                  How the avatar should move — facial expression, posture and gestures.
                  This is not spoken.
                </p>
                <textarea
                  value={motionPrompt}
                  onChange={(e) => setMotionPrompt(e.target.value)}
                  placeholder="Warm and friendly expression. Look directly at the camera..."
                  rows={2}
                  className="w-full px-4 py-3 bg-surface border border-border rounded-xl text-sm text-foreground placeholder:text-muted/70 focus:outline-none focus:border-accent/60 transition-all resize-none"
                />
              </div>
            )}

            <div className="flex gap-3 flex-wrap">
              {allows("voice_id") && (
                <div className="flex-1 min-w-[200px]">
                  <label className="block text-[10px] font-medium text-muted uppercase tracking-[0.15em] mb-1.5">
                    Voice ID <span className="text-accent/80">*</span>
                  </label>
                  <input
                    type="text"
                    value={voiceId}
                    onChange={(e) => setVoiceId(e.target.value)}
                    placeholder="Required — provider voice id"
                    className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-foreground placeholder:text-muted/70 focus:outline-none focus:border-accent/60 transition-all"
                  />
                  <p className="text-[11px] text-muted/70 mt-1.5 leading-relaxed">
                    Required for a spoken script. OpenRouter publishes no voice list, and
                    lists a few examples in its error if the id is missing.
                  </p>
                </div>
              )}

              {allows("expressiveness") && (
                <div className="flex-1 min-w-[160px]">
                  <label className="block text-[10px] font-medium text-muted uppercase tracking-[0.15em] mb-1.5">
                    Expressiveness
                  </label>
                  <input
                    type="text"
                    value={expressiveness}
                    onChange={(e) => setExpressiveness(e.target.value)}
                    placeholder="Optional"
                    className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-foreground placeholder:text-muted/70 focus:outline-none focus:border-accent/60 transition-all"
                  />
                  <p className="text-[11px] text-muted/70 mt-1.5 leading-relaxed">
                    Passed through as given. Leave empty for the provider default.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {isVideoModel && (
          <VideoPricing
            config={videoConfig}
            resolution={resolution}
            generateAudio={generateAudio}
            hasInputReference={referenceImages.length > 0}
            duration={
              videoConfig && videoConfig.durations.length > 0 ? duration : undefined
            }
            script={isScriptModel ? prompt : undefined}
          />
        )}

        {/* Bottom bar: Improve prompt (left) + Generate (right) */}
        <div className="flex items-center justify-between gap-3">
          {/* Improve prompt controls */}
          <div className={`flex items-center gap-2 ${isScriptModel ? "invisible" : ""}`}>
            <select
              value={improveModel}
              onChange={(e) => setImproveModel(e.target.value)}
              className="px-3 py-2 bg-surface border border-border rounded-lg text-xs text-muted focus:outline-none focus:border-accent/60 transition-all cursor-pointer"
            >
              {textModels.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={handleImprovePrompt}
              disabled={improving || !prompt.trim()}
              className="px-3 py-2 text-xs tracking-wide bg-surface border border-border rounded-lg hover:border-accent/40 hover:shadow-[0_0_8px_rgba(59,130,246,0.1)] transition-all disabled:opacity-50 cursor-pointer"
            >
              {improving ? (
                <span className="flex items-center gap-2">
                  <span className="retro-spinner !w-3 !h-3 !border-[1.5px]" />
                  Improving...
                </span>
              ) : (
                "Improve Prompt"
              )}
            </button>
            {previousPrompt !== null && (
              <button
                type="button"
                onClick={handleUndo}
                className="px-3 py-2 text-xs tracking-wide text-muted hover:text-accent border border-border rounded-lg hover:border-accent/40 transition-all cursor-pointer"
                title="Undo prompt improvement"
              >
                Undo
              </button>
            )}
          </div>

          {/* Generate button */}
          <button
            type="submit"
            disabled={loading || !prompt.trim()}
            className="flex items-center gap-2 px-6 py-2.5 bg-accent hover:bg-accent-hover text-white text-sm font-medium tracking-wide rounded-lg transition-all hover:shadow-[0_0_15px_rgba(59,130,246,0.4)] disabled:opacity-50 cursor-pointer"
          >
            {loading ? (
              <>
                <span className="retro-spinner !w-4 !h-4 !border-[1.5px] !border-white/30 !border-t-white" />
                Generating...
              </>
            ) : (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                  <path fillRule="evenodd" d="M14.615 1.595a.75.75 0 0 1 .359.852L12.982 9.75h7.268a.75.75 0 0 1 .548 1.262l-10.5 11.25a.75.75 0 0 1-1.272-.71l1.992-7.303H3.75a.75.75 0 0 1-.548-1.262l10.5-11.25a.75.75 0 0 1 .913-.142Z" clipRule="evenodd" />
                </svg>
                Generate {mediaType}
              </>
            )}
          </button>
        </div>

        {error &&
          (isCreditError(error) ? (
            <CreditErrorNotice message={error} />
          ) : (
            <div className="flex items-start gap-2 px-4 py-3 bg-red-500/5 border border-red-500/20 rounded-xl">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-red-400 shrink-0 mt-0.5">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <p className="text-sm text-red-400">{error}</p>
            </div>
          ))}

        {showAuthPrompt && <AuthPrompt onDismiss={() => setShowAuthPrompt(false)} />}
      </form>
    </div>
  );
}
