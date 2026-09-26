import { NextRequest, NextResponse } from "next/server";
import { readOpenRouterKey } from "@/lib/api-auth";
import { createClient } from "@/lib/openrouter";

export async function POST(request: NextRequest) {
  const apiKey = readOpenRouterKey(request);
  if (!apiKey) {
    return NextResponse.json({ error: "Missing API key" }, { status: 401 });
  }

  const { prompt, model } = await request.json();
  if (!prompt) {
    return NextResponse.json(
      { error: "A prompt is required" },
      { status: 400 }
    );
  }

  try {
    const client = createClient(apiKey);

    const result = await client.chat.send({
      chatGenerationParams: {
        model: model || "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: `You are an expert at writing image generation prompts. Given a user's rough prompt, rewrite it to be more detailed, vivid, and effective for AI image generation. Keep the core intent but add specific details about composition, lighting, style, colors, and mood where appropriate. Return ONLY the improved prompt text, nothing else. Do not wrap it in quotes.`,
          },
          {
            role: "user",
            content: prompt,
          },
        ],
      },
    });

    const content = result.choices?.[0]?.message?.content;
    if (!content || typeof content !== "string") {
      throw new Error("No content in LLM response");
    }

    return NextResponse.json({ prompt: content.trim() });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to improve prompt",
      },
      { status: 500 }
    );
  }
}
