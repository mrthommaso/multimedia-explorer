import { OpenRouter } from "@openrouter/sdk";
import { type VideoModelConfig, type ImageModelConfig } from "@/lib/types";
import { getImageModelConfigs } from "@/lib/image-models";
import { getVideoModelConfigs } from "@/lib/video-models";

type ModelEntry = { id: string; label: string };
type CacheData = {
  image: ModelEntry[];
  video: ModelEntry[];
  text: ModelEntry[];
  videoModelConfigs: Record<string, VideoModelConfig>;
  imageModelConfigs: Record<string, ImageModelConfig>;
};

let cache: { data: CacheData; ts: number } | null = null;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

const client = new OpenRouter({
  httpReferer: "http://localhost:3000",
  xTitle: "Multimedia Explorer",
});

function stripProviderPrefix(name: string): string {
  const colonIdx = name.indexOf(": ");
  return colonIdx !== -1 ? name.slice(colonIdx + 2) : name;
}

async function fetchByModality(modality: string): Promise<ModelEntry[]> {
  // The SDK doesn't support output_modalities as a query param yet,
  // so we pass it via serverURL to append it to the request.
  const response = await client.models.list(undefined, {
    serverURL: `https://openrouter.ai/api/v1?output_modalities=${modality}`,
  });

  return response.data.map((m) => ({
    id: m.id,
    label: stripProviderPrefix(m.name),
  }));
}

export async function GET() {
  if (cache && Date.now() - cache.ts < CACHE_TTL) {
    return Response.json(cache.data);
  }

  try {
    const [image, video, text, videoModelConfigs, imageModelConfigs] = await Promise.all([
      fetchByModality("image"),
      fetchByModality("video"),
      fetchByModality("text"),
      getVideoModelConfigs(),
      getImageModelConfigs(),
    ]);

    const result: CacheData = { image, video, text, videoModelConfigs, imageModelConfigs };
    cache = { data: result, ts: Date.now() };

    return Response.json(result);
  } catch {
    return Response.json({ error: "Failed to fetch models from OpenRouter" }, { status: 502 });
  }
}
