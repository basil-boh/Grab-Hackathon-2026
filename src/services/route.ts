import type { Poi } from "./poi";

export type LocationPoint = {
  lat: number;
  lng: number;
};

export type RouteData = {
  distanceMeters: number;
  durationSeconds: number;
  geometry?: {
    type: "LineString";
    coordinates: [number, number][];
  };
};

type ErrorPayload = { error: string };

export async function fetchRoute(destination: Poi, origin: LocationPoint): Promise<RouteData> {
  const response = await fetch("/api/route", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      originLat: origin.lat,
      originLng: origin.lng,
      lat: destination.lat,
      lng: destination.lng,
    }),
  });

  const payload = (await response.json()) as RouteData | ErrorPayload;
  if (!response.ok || "error" in payload) {
    throw new Error("error" in payload ? payload.error : response.statusText);
  }

  return payload;
}
