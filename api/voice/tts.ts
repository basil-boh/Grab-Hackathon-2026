import type { VercelRequest, VercelResponse } from "@vercel/node";
import { synthesizeElevenSpeech } from "../../lib/elevenClient";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const text = String(req.body?.text ?? "").trim();
  const voiceId = String(req.body?.voiceId ?? "").trim();

  if (!text || !voiceId) {
    res.status(400).json({ error: "text and voiceId are required" });
    return;
  }

  try {
    const audio = await synthesizeElevenSpeech(text, voiceId);
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Cache-Control", "no-store");
    res.status(200).send(audio);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "ElevenLabs TTS failed" });
  }
}
