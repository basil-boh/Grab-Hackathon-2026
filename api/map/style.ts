import type { VercelRequest, VercelResponse } from "@vercel/node";
import { fetchGrabStyle } from "../../lib/grabClient.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const style = await fetchGrabStyle();
    res.status(200).json(style);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Map style failed" });
  }
}
