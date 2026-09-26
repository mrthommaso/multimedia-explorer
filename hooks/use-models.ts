"use client";

import { useState, useEffect } from "react";
import type { VideoModelConfig, ImageModelConfig } from "@/lib/types";

export interface ModelOption {
  id: string;
  label: string;
}

interface ModelsState {
  imageModels: ModelOption[];
  videoModels: ModelOption[];
  textModels: ModelOption[];
  videoModelConfigs: Record<string, VideoModelConfig>;
  imageModelConfigs: Record<string, ImageModelConfig>;
  loading: boolean;
}

interface ApiResponse {
  image: ModelOption[];
  video: ModelOption[];
  text: ModelOption[];
  videoModelConfigs: Record<string, VideoModelConfig>;
  imageModelConfigs: Record<string, ImageModelConfig>;
}

let cachedData: ApiResponse | null = null;

export function useModels(): ModelsState {
  const [imageModels, setImageModels] = useState<ModelOption[]>(cachedData?.image ?? []);
  const [videoModels, setVideoModels] = useState<ModelOption[]>(cachedData?.video ?? []);
  const [textModels, setTextModels] = useState<ModelOption[]>(cachedData?.text ?? []);
  const [videoModelConfigs, setVideoModelConfigs] = useState<Record<string, VideoModelConfig>>(cachedData?.videoModelConfigs ?? {});
  const [imageModelConfigs, setImageModelConfigs] = useState<Record<string, ImageModelConfig>>(cachedData?.imageModelConfigs ?? {});
  const [loading, setLoading] = useState(!cachedData);

  useEffect(() => {
    if (cachedData) return;

    let cancelled = false;

    fetch("/api/models")
      .then((res) => res.json())
      .then((data: ApiResponse) => {
        if (cancelled) return;
        cachedData = data;
        setImageModels(data.image);
        setVideoModels(data.video);
        setTextModels(data.text ?? []);
        setVideoModelConfigs(data.videoModelConfigs ?? {});
        setImageModelConfigs(data.imageModelConfigs ?? {});
      })
      .catch(() => {
        // Fail silently — dropdowns will just be empty
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return { imageModels, videoModels, textModels, videoModelConfigs, imageModelConfigs, loading };
}
