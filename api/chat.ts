import type { VercelRequest, VercelResponse } from "@vercel/node";
import { personalityCache } from "../lib/cache";
import { generateChatReply } from "../lib/openaiClient";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const placeId = String(req.body?.placeId ?? "").trim();
  const message = String(req.body?.message ?? "").trim();

  if (!placeId || !message) {
    res.status(400).json({ error: "placeId and message are required" });
    return;
  }

  const personality = personalityCache.get(placeId);
  if (!personality) {
    res.status(409).json({ error: "Personality is not cached for this place yet" });
    return;
  }

  try {
    const reply = await generateChatReply(personality, message);
    res.status(200).json({ reply });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Chat failed" });
  }
}
