import type { VercelRequest, VercelResponse } from "@vercel/node";
import { personalityCache, personalityCacheKey } from "../lib/cache.js";
import { generateChatReply } from "../lib/openaiClient.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const placeId = String(req.body?.placeId ?? "").trim();
  const message = String(req.body?.message ?? "").trim();
  const roast = isRoastBodyFlag(req.body?.roast);

  if (!placeId || !message) {
    res.status(400).json({ error: "placeId and message are required" });
    return;
  }

  const personality = personalityCache.get(personalityCacheKey(placeId, roast));
  if (!personality) {
    res.status(409).json({ error: "Personality is not cached for this place yet" });
    return;
  }

  try {
    const reply = await generateChatReply(personality, message, { roast });
    res.status(200).json({ reply });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Chat failed" });
  }
}

function isRoastBodyFlag(value: unknown) {
  return value === true || value === "true" || value === 1 || value === "1";
}
