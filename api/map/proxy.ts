import type { VercelRequest, VercelResponse } from "@vercel/node";
import { fetchGrabResource } from "../../lib/grabClient.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const url = String(req.query.url ?? "").trim();
  if (!url) {
    res.status(400).json({ error: "url is required" });
    return;
  }

  try {
    const resource = await fetchGrabResource(url);
    res.setHeader("Content-Type", resource.contentType);
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.status(200).send(resource.buffer);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Grab map proxy failed" });
  }
}
