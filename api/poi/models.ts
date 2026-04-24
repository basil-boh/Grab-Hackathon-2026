import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { PoiModelAssignment, PoiModelInput } from "../../lib/markerModels";
import { classifyPoiMarkerModels } from "../../lib/openaiClient";

const globalForModelCache = globalThis as typeof globalThis & {
  __grabmapsPoiModelCache?: Map<string, PoiModelAssignment>;
};

const poiModelCache = globalForModelCache.__grabmapsPoiModelCache ?? new Map<string, PoiModelAssignment>();
globalForModelCache.__grabmapsPoiModelCache = poiModelCache;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const items = normalizeItems(req.body?.items);
  if (!items.length) {
    res.status(400).json({ error: "items are required" });
    return;
  }

  try {
    const cached = new Map<string, PoiModelAssignment>();
    const uncached: PoiModelInput[] = [];

    for (const item of items) {
      const key = cacheKey(item);
      const hit = poiModelCache.get(key);
      if (hit) {
        cached.set(item.id, hit);
      } else {
        uncached.push(item);
      }
    }

    if (uncached.length) {
      const assignments = await classifyPoiMarkerModels(uncached);
      for (const assignment of assignments) {
        const original = uncached.find((item) => item.id === assignment.id);
        if (!original) throw new Error("Model classifier returned an unknown POI");
        poiModelCache.set(cacheKey(original), assignment);
        cached.set(assignment.id, assignment);
      }
    }

    const assignments = items.map((item) => {
      const assignment = cached.get(item.id);
      if (!assignment) throw new Error(`Missing model assignment for ${item.name}`);
      return assignment;
    });

    res.status(200).json({ items: assignments });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "POI model classification failed" });
  }
}

function normalizeItems(value: unknown): PoiModelInput[] {
  if (!Array.isArray(value)) return [];

  return value.slice(0, 24).flatMap((item): PoiModelInput[] => {
    if (!item || typeof item !== "object") return [];
    const candidate = item as Record<string, unknown>;
    const id = typeof candidate.id === "string" ? candidate.id.trim() : "";
    const name = typeof candidate.name === "string" ? candidate.name.trim() : "";
    if (!id || !name) return [];

    return [
      {
        id,
        name,
        category: typeof candidate.category === "string" ? candidate.category : undefined,
        rating: typeof candidate.rating === "number" && Number.isFinite(candidate.rating) ? candidate.rating : undefined,
      },
    ];
  });
}

function cacheKey(item: PoiModelInput) {
  return [item.id, item.name, item.category ?? "", item.rating ?? ""].join("|");
}
