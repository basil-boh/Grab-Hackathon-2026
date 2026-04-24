import { withTimeout } from "./withTimeout";
import { getServerEnv } from "./env";
import type { NormalizedPlace, Review } from "./grabClient";

const GOOGLE_TIMEOUT_MS = 5000;

function requireGoogleKey() {
  const key = getServerEnv("GOOGLE_MAPS_API_KEY");
  if (!key) throw new Error("GOOGLE_MAPS_API_KEY is not configured");
  return key;
}

export async function fetchGoogleReviews(place: NormalizedPlace): Promise<Review[]> {
  return withTimeout("Google Places reviews", GOOGLE_TIMEOUT_MS, async (signal) => {
    const key = requireGoogleKey();
    const searchParams = new URLSearchParams({
      query: place.name,
      location: `${place.lat},${place.lng}`,
      radius: "200",
      key,
    });

    const searchResponse = await fetch(`https://maps.googleapis.com/maps/api/place/textsearch/json?${searchParams}`, {
      signal,
    });
    if (!searchResponse.ok) {
      throw new Error(`Google Places Text Search returned ${searchResponse.status}`);
    }

    const searchPayload = await searchResponse.json();
    const googlePlaceId = searchPayload?.results?.[0]?.place_id;
    if (!googlePlaceId) {
      throw new Error("Google Places found no matching place");
    }

    const detailParams = new URLSearchParams({
      place_id: googlePlaceId,
      fields: "name,rating,reviews",
      key,
    });

    const detailsResponse = await fetch(`https://maps.googleapis.com/maps/api/place/details/json?${detailParams}`, {
      signal,
    });
    if (!detailsResponse.ok) {
      throw new Error(`Google Places Details returned ${detailsResponse.status}`);
    }

    const detailsPayload = await detailsResponse.json();
    if (detailsPayload?.status && detailsPayload.status !== "OK") {
      throw new Error(`Google Places Details status ${detailsPayload.status}`);
    }

    return normalizeReviews(detailsPayload?.result?.reviews);
  });
}

function normalizeReviews(input: unknown): Review[] {
  if (!Array.isArray(input) || input.length === 0) {
    throw new Error("Google Places returned no reviews");
  }

  return input.slice(0, 5).map((review: any) => ({
    text: String(review.text ?? "").trim(),
    rating: typeof review.rating === "number" ? review.rating : undefined,
    author: typeof review.author_name === "string" ? review.author_name : undefined,
  })).filter((review) => review.text);
}
