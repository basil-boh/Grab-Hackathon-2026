type ErrorPayload = { error: string };

export async function synthesizeSpeech(text: string, voiceId: string): Promise<Blob> {
  const response = await fetch("/api/voice/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, voiceId }),
  });

  const contentType = response.headers.get("content-type") ?? "";
  if (!response.ok || contentType.includes("application/json")) {
    const payload = (await response.json()) as ErrorPayload;
    throw new Error(payload.error || response.statusText);
  }

  return response.blob();
}
