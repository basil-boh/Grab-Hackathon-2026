import { withTimeout } from "./withTimeout";
import { getServerEnv } from "./env";
import type { NormalizedPlace, Review } from "./grabClient";

const GOOGLE_TIMEOUT_MS = 6000;
const PLACES_BASE = "https://places.googleapis.com/v1";
const DETAILS_FIELD_MASK = "displayName,rating,userRatingCount,reviews";
const SEARCH_FIELD_MASK = "places.id,places.displayName,places.formattedAddress";

function requireGoogleKey(): string {
  const key = getServerEnv("GOOGLE_MAPS_API_KEY");
  if (!key) throw new Error("GOOGLE_MAPS_API_KEY is not configured");
  return key;
}

interface PlacesV1Review {
  rating?: number;
  text?: { text?: string };
  authorAttribution?: { displayName?: string };
}

interface PlacesV1Details {
  displayName?: { text?: string };
  rating?: number;
  userRatingCount?: number;
  reviews?: PlacesV1Review[];
}

async function searchPlaceId(query: string, place: NormalizedPlace, signal: AbortSignal): Promise<string> {
  const body: Record<string, unknown> = { textQuery: query };

  if (Number.isFinite(place.lat) && Number.isFinite(place.lng)) {
    body.locationBias = {
      circle: {
        center: { latitude: place.lat, longitude: place.lng },
        radius: 200,
      },
    };
  }

  const response = await fetch(`${PLACES_BASE}/places:searchText`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": requireGoogleKey(),
      "X-Goog-FieldMask": SEARCH_FIELD_MASK,
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok) {
    throw new Error(`Google Places Text Search returned ${response.status}: ${(await response.text()).slice(0, 180)}`);
  }

  const payload = await response.json();
  const placeId = payload?.places?.[0]?.id;
  if (typeof placeId !== "string" || !placeId) {
    throw new Error("Google Places found no matching place");
  }

  return placeId;
}

async function fetchPlaceDetails(placeId: string, signal: AbortSignal): Promise<PlacesV1Details> {
  const response = await fetch(`${PLACES_BASE}/places/${encodeURIComponent(placeId)}`, {
    headers: {
      "X-Goog-Api-Key": requireGoogleKey(),
      "X-Goog-FieldMask": DETAILS_FIELD_MASK,
    },
    signal,
  });

  if (!response.ok) {
    throw new Error(`Google Places Details returned ${response.status}: ${(await response.text()).slice(0, 180)}`);
  }

  return response.json();
}

function normalizeReviews(input: PlacesV1Review[] | undefined): Review[] {
  if (!Array.isArray(input)) return [];

  const reviews: Review[] = [];
  for (const review of input) {
    const text = review.text?.text?.trim();
    if (!text) continue;

    reviews.push({
      text,
      rating: typeof review.rating === "number" ? review.rating : undefined,
      author: review.authorAttribution?.displayName?.trim() || undefined,
    });
  }

  return reviews;
}

export async function fetchGoogleReviews(place: NormalizedPlace): Promise<Review[]> {
  return withTimeout("Google Places reviews", GOOGLE_TIMEOUT_MS, async (signal) => {
    const placeId = await searchPlaceId(place.name, place, signal);
    const details = await fetchPlaceDetails(placeId, signal);
    return normalizeReviews(details.reviews);
  });
}

export async function fetchGooglePlaceSummary(query: string) {
  return withTimeout("Google Places summary", GOOGLE_TIMEOUT_MS, async (signal) => {
    const placeId = await searchPlaceId(
      query,
      { id: query, name: query, lat: Number.NaN, lng: Number.NaN } as NormalizedPlace,
      signal,
    );
    const details = await fetchPlaceDetails(placeId, signal);

    return {
      placeId,
      name: details.displayName?.text ?? query,
      rating: details.rating,
      userRatingCount: details.userRatingCount,
      reviews: normalizeReviews(details.reviews),
    };
  });
}
