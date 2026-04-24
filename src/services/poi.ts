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
type SearchOptions = { location?: LocationLike; limit?: number };

export const FOOD_SEARCH_KEYWORDS = [
  "restaurant",
  "food",
  "hawker",
  "hawker centre",
  "food court",
  "kopitiam",
  "coffee shop",
  "cafe",
  "eatery",
  "bar",
] as const;

export const COFFEE_SEARCH_KEYWORDS = [
  "coffee",
  "cafe",
  "coffee shop",
  "kopitiam",
  "tea",
  "bubble tea",
  "bakery",
] as const;

export const GYM_SEARCH_KEYWORDS = [
  "gym",
  "fitness",
  "fitness centre",
  "yoga",
  "pilates",
  "personal training",
] as const;

export const SPORTS_SEARCH_KEYWORDS = [
  "sports",
  "sports hall",
  "sports centre",
  "stadium",
  "swimming complex",
  "badminton",
  "tennis court",
  "ActiveSG",
] as const;

export const MALL_SEARCH_KEYWORDS = [
  "shopping mall",
  "mall",
  "shopping centre",
  "plaza",
  "retail",
  "market",
] as const;

export const HOTEL_SEARCH_KEYWORDS = [
  "hotel",
  "resort",
  "serviced apartment",
  "hostel",
  "inn",
  "accommodation",
] as const;

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
  options?: SearchOptions,
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

export async function searchPoisByKeywords(
  keywords: readonly string[],
  signal?: AbortSignal,
  options?: SearchOptions,
): Promise<Poi[]> {
  const uniqueKeywords = [...new Set(keywords.map((keyword) => keyword.trim()).filter(Boolean))];
  const results = await Promise.allSettled(uniqueKeywords.map((keyword) => searchPois(keyword, signal, options)));
  const items = results.flatMap((result) => (result.status === "fulfilled" ? result.value : []));

  if (!items.length) {
    const failed = results.find((result) => result.status === "rejected");
    if (failed?.status === "rejected") throw failed.reason;
  }

  return dedupePois(items);
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

function dedupePois(items: Poi[]) {
  const seen = new Set<string>();

  return items.filter((poi) => {
    const key = poi.id || `${poi.name}:${poi.lat.toFixed(6)}:${poi.lng.toFixed(6)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
