import type { VercelRequest, VercelResponse } from "@vercel/node";
import { nearbyGrabPois } from "../../lib/grabClient.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const items = await nearbyGrabPois(
      String(req.query.location ?? "1.3521,103.8198"),
      String(req.query.radius ?? "2"),
      String(req.query.limit ?? "10"),
      String(req.query.rankBy ?? "distance"),
    );
    res.status(200).json({ items });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Grab nearby failed" });
  }
}
