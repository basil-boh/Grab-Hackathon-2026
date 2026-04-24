import type { VercelRequest, VercelResponse } from "@vercel/node";
import { fetchGrabRoute } from "../lib/grabClient";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const lat = Number(req.body?.lat);
  const lng = Number(req.body?.lng);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    res.status(400).json({ error: "lat and lng are required" });
    return;
  }

  try {
    const route = await fetchGrabRoute(lng, lat);
    res.status(200).json(route);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Grab route failed" });
  }
}
