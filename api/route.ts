import type { VercelRequest, VercelResponse } from "@vercel/node";
import { fetchGrabRoute } from "../lib/grabClient";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const lat = Number(req.body?.lat);
  const lng = Number(req.body?.lng);
  const originLat = Number(req.body?.originLat);
  const originLng = Number(req.body?.originLng);

  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    !Number.isFinite(originLat) ||
    !Number.isFinite(originLng)
  ) {
    res.status(400).json({ error: "originLat, originLng, lat, and lng are required" });
    return;
  }

  try {
    const route = await fetchGrabRoute(originLng, originLat, lng, lat);
    res.status(200).json(route);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Grab route failed" });
  }
}
