import { SG_CENTER } from "../lib/config";

export type Poi = {
  id: string;
  name: string;
  address?: string;
  category?: string;
  lat: number;
  lng: number;
  rating?: number;
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

export async function searchPois(
  keyword: string,
  signal?: AbortSignal,
  options?: { location?: LocationLike; limit?: number },
): Promise<Poi[]> {
  const location = options?.location ?? SG_CENTER;
  const params = new URLSearchParams({
    keyword,
    location: formatLocation(location),
    limit: String(options?.limit ?? 10),
  });

  const response = await fetch(`/api/poi/search?${params}`, { signal });
  const payload = await readJson<{ items: Poi[] }>(response);
  return payload.items;
}

export async function nearbyPois(options?: { location?: LocationLike; radiusKm?: number; limit?: number }): Promise<Poi[]> {
  const location = options?.location ?? SG_CENTER;
  const params = new URLSearchParams({
    location: formatLocation(location),
    radius: String(options?.radiusKm ?? 2),
    limit: String(options?.limit ?? 12),
    rankBy: "distance",
  });

  const response = await fetch(`/api/poi/nearby?${params}`);
  const payload = await readJson<{ items: Poi[] }>(response);
  return payload.items;
}

type LocationLike = {
  lat: number;
  lng: number;
};

function formatLocation(location: LocationLike) {
  return `${location.lat},${location.lng}`;
}
