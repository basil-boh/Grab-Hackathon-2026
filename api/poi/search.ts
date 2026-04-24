import type { VercelRequest, VercelResponse } from "@vercel/node";
import { searchGrabPois } from "../../lib/grabClient";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const keyword = String(req.query.keyword ?? "").trim();
  if (!keyword) {
    res.status(400).json({ error: "keyword is required" });
    return;
  }

  try {
    const items = await searchGrabPois(
      keyword,
      String(req.query.location ?? "1.3521,103.8198"),
      String(req.query.limit ?? "10"),
    );
    res.status(200).json({ items });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Grab POI search failed" });
  }
}
