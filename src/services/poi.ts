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

export async function searchPois(keyword: string): Promise<Poi[]> {
  const params = new URLSearchParams({
    keyword,
    location: `${SG_CENTER.lat},${SG_CENTER.lng}`,
    limit: "10",
  });

  const response = await fetch(`/api/poi/search?${params}`);
  const payload = await readJson<{ items: Poi[] }>(response);
  return payload.items;
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
  return payload.items;
}
