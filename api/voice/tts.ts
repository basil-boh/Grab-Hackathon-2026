import type { VercelRequest, VercelResponse } from "@vercel/node";
import { synthesizeElevenSpeech } from "../../lib/elevenClient.js";
import { isSentiment, voiceForSentiment } from "../../lib/sentimentVoices.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const text = String(req.body?.text ?? "").trim();
  if (!text) {
    res.status(400).json({ error: "text is required" });
    return;
  }

  const sentiment = req.body?.sentiment;
  const bodyVoiceId = String(req.body?.voiceId ?? "").trim();

  let voiceId: string;
  let voiceSettings;

  if (isSentiment(sentiment)) {
    const mapped = voiceForSentiment(sentiment);
    voiceId = mapped.voiceId;
    voiceSettings = mapped.settings;
  } else if (bodyVoiceId) {
    voiceId = bodyVoiceId;
    voiceSettings = undefined;
  } else {
    res.status(400).json({ error: "voiceId or sentiment is required" });
    return;
  }

  try {
    const audio = await synthesizeElevenSpeech(text, voiceId, voiceSettings);
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Cache-Control", "no-store");
    res.status(200).send(audio);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "ElevenLabs TTS failed" });
  }
}
