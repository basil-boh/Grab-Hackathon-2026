import type { VercelRequest, VercelResponse } from "@vercel/node";
import { personalityCache, type Personality } from "../../lib/cache";
import { fetchGoogleReviews } from "../../lib/googlePlacesClient";
import { fetchGrabPlaceDetails, type NormalizedPlace } from "../../lib/grabClient";
import { generatePersonality } from "../../lib/openaiClient";
import { pickVoice } from "../../lib/pickVoice";

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

  const cached = personalityCache.get(placeId);
  if (cached) {
    const publicPayload: Personality = {
      archetype: cached.archetype,
      displayName: cached.displayName,
      intro: cached.intro,
      imageUrl: cached.imageUrl,
      voiceId: cached.voiceId,
      reviews: cached.reviews,
    };
    res.status(200).json(publicPayload);
    return;
  }

  const name = String(req.query.name ?? "").trim();
  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);

  if (!name || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    res.status(400).json({ error: "name, lat, and lng are required for Google review lookup" });
    return;
  }

  try {
    const fallback: NormalizedPlace = { id: placeId, name, lat, lng };
    const [placeResult, reviewsResult] = await Promise.allSettled([
      fetchGrabPlaceDetails(placeId),
      fetchGoogleReviews(fallback),
    ]);

    const place = placeResult.status === "fulfilled" ? placeResult.value : fallback;
    const reviews = reviewsResult.status === "fulfilled" ? reviewsResult.value : [];

    const generated = await generatePersonality(place, reviews);
    const voiceId = pickVoice(generated.archetype);
    const personality: Personality = {
      ...generated,
      imageUrl: `/assets/images/${generated.archetype}.webp`,
      voiceId,
      reviews,
    };

    personalityCache.set(placeId, {
      ...personality,
      place,
    });

    res.status(200).json(personality);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Personality pipeline failed" });
  }
}
