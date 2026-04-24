import type { VercelRequest, VercelResponse } from "@vercel/node";
import { fetchGrabPlaceDetails } from "../../lib/grabClient";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const id = String(req.query.id ?? req.query.placeId ?? "").trim();
  if (!id) {
    res.status(400).json({ error: "id is required" });
    return;
  }

  try {
    const place = await fetchGrabPlaceDetails(id);
    res.status(200).json(place);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Grab Place Details failed" });
  }
}
