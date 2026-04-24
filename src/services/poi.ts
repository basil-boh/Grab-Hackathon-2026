import { SG_CENTER } from "../lib/config";
import type { PoiModelAssignment, PoiModelKey, PoiModelPath } from "../lib/poiModel";

export type Poi = {
  id: string;
  name: string;
  address?: string;
  category?: string;
  lat: number;
  lng: number;
  rating?: number;
  modelKey?: PoiModelKey;
  modelPath?: PoiModelPath;
  modelReason?: string;
};

type ErrorPayload = { error: string };

async function readJson<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as T | ErrorPayload;
  if (!response.ok || isErrorPayload(payload)) {
    throw new Error(isErrorPayload(payload) ? payload.error : response.statusText);
  }
  return payload as T;
}

function isErrorPayload(payload: unknown): payload is ErrorPayload {
  return typeof payload === "object" && payload !== null && "error" in payload;
}

export async function searchPois(keyword: string, signal?: AbortSignal, options: { includeModels?: boolean } = {}): Promise<Poi[]> {
  const params = new URLSearchParams({
    keyword,
    location: `${SG_CENTER.lat},${SG_CENTER.lng}`,
    limit: "10",
  });

  const response = await fetch(`/api/poi/search?${params}`, { signal });
  const payload = await readJson<{ items: Poi[] }>(response);
  return options.includeModels === false ? payload.items : assignPoiModels(payload.items, signal);
}

export async function nearbyPois(): Promise<Poi[]> {
  const params = new URLSearchParams({
    location: `${SG_CENTER.lat},${SG_CENTER.lng}`,
    radius: "2",
    limit: "12",
    rankBy: "distance",
  });

  const response = await fetch(`/api/poi/nearby?${params}`);
  const payload = await readJson<{ items: Poi[] }>(response);
  return assignPoiModels(payload.items);
}

export async function assignPoiModels(items: Poi[], signal?: AbortSignal): Promise<Poi[]> {
  if (!items.length) return items;

  const response = await fetch("/api/poi/models", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      items: items.map(({ id, name, category, rating }) => ({ id, name, category, rating })),
    }),
    signal,
  });
  const payload = await readJson<{ items: PoiModelAssignment[] }>(response);
  const modelsById = new Map(payload.items.map((item) => [item.id, item]));

  return items.map((item) => {
    const assignment = modelsById.get(item.id);
    if (!assignment) throw new Error(`No model returned for ${item.name}`);
    return {
      ...item,
      modelKey: assignment.modelKey,
      modelPath: assignment.modelPath,
      modelReason: assignment.reason,
    };
  });
}
