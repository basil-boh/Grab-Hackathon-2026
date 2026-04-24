import { withTimeout } from "./withTimeout.js";
import { getServerEnv } from "./env.js";
import grabStyleSnapshot from "./grabStyleSnapshot.json" with { type: "json" };

const GRAB_BASE_URL = "https://maps.grab.com";
const GRAB_API_BASE_URL = `${GRAB_BASE_URL}/api/v1`;
const GRAB_TIMEOUT_MS = 5000;

const globalForGrab = globalThis as typeof globalThis & {
  __grabMapStyleCache?: unknown;
};

export type NormalizedPlace = {
  id: string;
  name: string;
  address?: string;
  category?: string;
  lat: number;
  lng: number;
  rating?: number;
  raw?: unknown;
};

export type Review = {
  text: string;
  rating?: number;
  author?: string;
};

function requireGrabKey() {
  const key = getServerEnv("GRAB_MAPS_API_KEY");
  if (!key) throw new Error("GRAB_MAPS_API_KEY is not configured");
  return key;
}

async function grabFetch(path: string, params: URLSearchParams, label: string) {
  return withTimeout(label, GRAB_TIMEOUT_MS, async (signal) => {
    const response = await fetch(`${GRAB_API_BASE_URL}${path}?${formatGrabParams(params)}`, {
      headers: {
        Authorization: `Bearer ${requireGrabKey()}`,
      },
      signal,
    });

    if (!response.ok) {
      throw new Error(`${label} returned ${response.status}`);
    }

    return response.json();
  });
}

function formatGrabParams(params: URLSearchParams) {
  return params.toString().replace(/%2C/gi, ",");
}

export async function fetchGrabStyle() {
  if (globalForGrab.__grabMapStyleCache) {
    return globalForGrab.__grabMapStyleCache;
  }

  try {
    return await withTimeout("Grab map style", GRAB_TIMEOUT_MS, async (signal) => {
      const response = await fetch(`${GRAB_BASE_URL}/api/style.json`, {
        headers: {
          Authorization: `Bearer ${requireGrabKey()}`,
        },
        signal,
      });

      if (!response.ok) {
        throw new Error(`Grab map style returned ${response.status}`);
      }

      return cacheGrabStyle(styleFromUnknown(await response.json()));
    });
  } catch {
    return cacheGrabStyle(styleFromUnknown(grabStyleSnapshot));
  }
}

export async function fetchGrabResource(rawUrl: string) {
  const url = new URL(rawUrl);
  if (url.origin !== GRAB_BASE_URL) {
    throw new Error("Only Grab map resources can be proxied");
  }

  return withTimeout("Grab map resource", GRAB_TIMEOUT_MS, async (signal) => {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${requireGrabKey()}`,
      },
      signal,
    });

    if (!response.ok) {
      throw new Error(`Grab map resource returned ${response.status}`);
    }

    return {
      contentType: response.headers.get("content-type") ?? "application/octet-stream",
      buffer: Buffer.from(await response.arrayBuffer()),
    };
  });
}

export async function searchGrabPois(keyword: string, location: string, limit: string) {
  const params = new URLSearchParams({
    keyword,
    country: "SGP",
    location,
    limit,
  });
  const data = await grabFetch("/maps/poi/v1/search", params, "Grab POI search");
  return extractPlaces(data).map(normalizePlace);
}

export async function nearbyGrabPois(location: string, radius: string, limit: string, rankBy: string) {
  const params = new URLSearchParams({
    location,
    radius,
    limit,
    rankBy,
    language: "en",
  });
  const data = await grabFetch("/maps/place/v2/nearby", params, "Grab nearby places");
  return extractPlaces(data).map(normalizePlace);
}

export async function fetchGrabPlaceDetails(placeId: string) {
  const params = new URLSearchParams({
    placeId,
    id: placeId,
    place_id: placeId,
  });
  const data = await grabFetch("/maps/place/v2/details", params, "Grab Place Details");
  return normalizePlace(extractPlace(data) ?? data);
}

export async function fetchGrabRoute(originLng: number, originLat: number, destLng: number, destLat: number) {
  const params = new URLSearchParams();
  params.append("coordinates", `${originLng},${originLat}`);
  params.append("coordinates", `${destLng},${destLat}`);
  params.set("profile", "driving");
  params.set("overview", "full");

  const data = await grabFetch("/maps/eta/v1/direction", params, "Grab directions");
  const route = Array.isArray(data?.routes) ? data.routes[0] : undefined;
  if (!route) throw new Error("Grab directions returned no route");
  const geometry = normalizeGeometry(route.geometry);
  if (!geometry?.coordinates?.length) throw new Error("Grab directions returned no route geometry");

  return {
    distanceMeters: Number(route.distance ?? route.distanceMeters ?? route.summary?.distance ?? 0),
    durationSeconds: Number(route.duration ?? route.durationSeconds ?? route.summary?.duration ?? 0),
    geometry,
  };
}

function extractPlaces(data: any): unknown[] {
  const candidates = [
    data?.places,
    data?.pois,
    data?.results,
    data?.data,
    data?.items,
    data?.payload?.places,
    data?.payload?.results,
  ];

  const found = candidates.find(Array.isArray);
  if (!found) throw new Error("Grab response did not include places");
  return found;
}

function extractPlace(data: any): unknown | undefined {
  return data?.place ?? data?.poi ?? data?.result ?? data?.data ?? data?.payload ?? undefined;
}

function normalizePlace(input: any): NormalizedPlace {
  const place = input?.place ?? input?.poi ?? input;
  const id = firstString(place?.id, place?.placeId, place?.place_id, place?.poiId, place?.poi_id, place?.uuid);
  const name = firstString(place?.name, place?.title, place?.displayName, place?.display_name);
  const lat = firstNumber(
    place?.lat,
    place?.latitude,
    place?.location?.lat,
    place?.location?.latitude,
    place?.geometry?.location?.lat,
    place?.coordinate?.latitude,
    Array.isArray(place?.coordinates) ? place.coordinates[1] : undefined,
  );
  const lng = firstNumber(
    place?.lng,
    place?.lon,
    place?.long,
    place?.longitude,
    place?.location?.lng,
    place?.location?.lon,
    place?.location?.longitude,
    place?.geometry?.location?.lng,
    place?.coordinate?.longitude,
    Array.isArray(place?.coordinates) ? place.coordinates[0] : undefined,
  );

  if (!id || !name || lat === undefined || lng === undefined) {
    throw new Error("Grab place response was missing id, name, or coordinates");
  }

  return {
    id,
    name,
    address: firstString(
      place?.address,
      place?.formattedAddress,
      place?.formatted_address,
      place?.street,
      place?.description,
    ),
    category: firstString(
      place?.category,
      place?.categoryName,
      place?.type,
      place?.primaryType,
      place?.categories?.[0]?.name,
      place?.categories?.[0],
    ),
    lat,
    lng,
    rating: firstNumber(place?.rating, place?.score, place?.reviewSummary?.rating),
    raw: input,
  };
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return undefined;
}

function firstNumber(...values: unknown[]) {
  for (const value of values) {
    const numberValue = typeof value === "string" ? Number(value) : value;
    if (typeof numberValue === "number" && Number.isFinite(numberValue)) return numberValue;
  }
  return undefined;
}

function normalizeGeometry(geometry: unknown) {
  if (!geometry) return undefined;

  if (typeof geometry === "string") {
    const coordinates = sanitizeRouteCoordinates(decodePolyline(geometry));
    return coordinates.length ? { type: "LineString" as const, coordinates } : undefined;
  }

  const maybeGeometry = geometry as any;
  if (maybeGeometry.type === "LineString" && Array.isArray(maybeGeometry.coordinates)) {
    const coordinates = sanitizeRouteCoordinates(maybeGeometry.coordinates);
    return coordinates.length ? {
      type: "LineString" as const,
      coordinates,
    } : undefined;
  }

  if (Array.isArray(maybeGeometry.coordinates)) {
    const coordinates = sanitizeRouteCoordinates(maybeGeometry.coordinates);
    return coordinates.length ? {
      type: "LineString" as const,
      coordinates,
    } : undefined;
  }

  return undefined;
}

function sanitizeRouteCoordinates(coordinates: unknown[]) {
  return coordinates.map(toLngLat).filter((coord): coord is [number, number] => Boolean(coord));
}

function toLngLat(value: unknown): [number, number] | undefined {
  if (Array.isArray(value)) {
    const lng = Number(value[0]);
    const lat = Number(value[1]);
    return isValidLngLat(lng, lat) ? [lng, lat] : undefined;
  }

  if (value && typeof value === "object") {
    const point = value as Record<string, unknown>;
    const lng = Number(point.lng ?? point.lon ?? point.longitude);
    const lat = Number(point.lat ?? point.latitude);
    return isValidLngLat(lng, lat) ? [lng, lat] : undefined;
  }

  return undefined;
}

function isValidLngLat(lng: number, lat: number) {
  return Number.isFinite(lng) && Number.isFinite(lat) && Math.abs(lng) <= 180 && Math.abs(lat) <= 90;
}

function prefixRelativeGrabUrls(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(prefixRelativeGrabUrls);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, prefixRelativeGrabUrls(entry)]),
    );
  }

  if (typeof value === "string" && value.startsWith("/")) {
    return `${GRAB_BASE_URL}${value}`;
  }

  return value;
}

function cacheGrabStyle(style: unknown) {
  const normalizedStyle = prefixRelativeGrabUrls(style);
  globalForGrab.__grabMapStyleCache = normalizedStyle;
  return normalizedStyle;
}

function styleFromUnknown(style: unknown) {
  if (!style || typeof style !== "object") {
    throw new Error("Grab map style was not a JSON object");
  }

  return style;
}

function decodePolyline(encoded: string): [number, number][] {
  let index = 0;
  let lat = 0;
  let lng = 0;
  const coordinates: [number, number][] = [];
  const precision = 1e6;

  while (index < encoded.length) {
    const latResult = decodeChunk(encoded, index);
    index = latResult.nextIndex;
    const lngResult = decodeChunk(encoded, index);
    index = lngResult.nextIndex;
    lat += latResult.value;
    lng += lngResult.value;
    coordinates.push([lng / precision, lat / precision]);
  }

  return coordinates;
}

function decodeChunk(encoded: string, startIndex: number) {
  let result = 0;
  let shift = 0;
  let index = startIndex;
  let byte = 0;

  do {
    byte = encoded.charCodeAt(index++) - 63;
    result |= (byte & 0x1f) << shift;
    shift += 5;
  } while (byte >= 0x20 && index < encoded.length);

  return {
    value: result & 1 ? ~(result >> 1) : result >> 1,
    nextIndex: index,
  };
}
