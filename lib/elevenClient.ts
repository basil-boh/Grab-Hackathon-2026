import { getServerEnv } from "./env";
import { withTimeout } from "./withTimeout";

const ELEVEN_TIMEOUT_MS = 12000;

function requireElevenKey() {
  const key = getServerEnv("ELEVENLABS_API_KEY");
  if (!key) throw new Error("ELEVENLABS_API_KEY is not configured");
  return key;
}

export async function synthesizeElevenSpeech(text: string, voiceId: string): Promise<Buffer> {
  return withTimeout("ElevenLabs TTS", ELEVEN_TIMEOUT_MS, async (signal) => {
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}`, {
      method: "POST",
      headers: {
        Accept: "audio/mpeg",
        "Content-Type": "application/json",
        "xi-api-key": requireElevenKey(),
      },
      body: JSON.stringify({
        text,
        model_id: "eleven_multilingual_v2",
        voice_settings: {
          stability: 0.45,
          similarity_boost: 0.8,
          style: 0.35,
          use_speaker_boost: true,
        },
      }),
      signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`ElevenLabs TTS returned ${response.status}: ${errorText.slice(0, 180)}`);
    }

    return Buffer.from(await response.arrayBuffer());
  });
}
