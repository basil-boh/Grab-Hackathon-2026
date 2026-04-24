import type { VercelRequest, VercelResponse } from "@vercel/node";
import { fetchGoogleReviews } from "../lib/googlePlacesClient.js";
import type { NormalizedPlace } from "../lib/grabClient.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const name = String(req.query.name ?? "").trim();
  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);

  if (!name || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    res.status(400).json({ error: "name, lat, and lng are required" });
    return;
  }

  try {
    const reviews = await fetchGoogleReviews({ id: "google-review-probe", name, lat, lng } as NormalizedPlace);
    res.status(200).json({ reviews });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Google reviews failed" });
  }
}
