import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPersonalityForPlace, toPublicPersonality } from "../../lib/personalityPipeline";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const idParam = req.query.id;
  const placeId = Array.isArray(idParam) ? idParam[0] : idParam;

  if (!placeId) {
    res.status(400).json({ error: "placeId is required" });
    return;
  }

  const name = String(req.query.name ?? "").trim();
  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);
  const roast = isRoastQuery(req.query.roast);

  if (!name || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    res.status(400).json({ error: "name, lat, and lng are required for Google review lookup" });
    return;
  }

  try {
    const personality = await getPersonalityForPlace({ id: placeId, name, lat, lng }, { roast });
    res.status(200).json(toPublicPersonality(personality));
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Personality pipeline failed" });
  }
}

function isRoastQuery(value: unknown) {
  const firstValue = Array.isArray(value) ? value[0] : value;
  return firstValue === "1" || firstValue === "true";
}
