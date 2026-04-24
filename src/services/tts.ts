import type { Sentiment } from "../lib/sentiment";

type ErrorPayload = { error: string };

export type SpeakOptions = { voiceId: string } | { sentiment: Sentiment };

export async function synthesizeSpeech(text: string, opts: SpeakOptions): Promise<Blob> {
  const body: Record<string, string> = { text };
  if ("sentiment" in opts) body.sentiment = opts.sentiment;
  else body.voiceId = opts.voiceId;

  const response = await fetch("/api/voice/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const contentType = response.headers.get("content-type") ?? "";
  if (!response.ok || contentType.includes("application/json")) {
    const payload = (await response.json()) as ErrorPayload;
    throw new Error(payload.error || response.statusText);
  }

  return response.blob();
}
