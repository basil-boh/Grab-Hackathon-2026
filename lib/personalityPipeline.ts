import { personalityCache, type CachedPersonality, type Personality } from "./cache";
import { fetchGoogleReviews } from "./googlePlacesClient";
import { fetchGrabPlaceDetails, type NormalizedPlace } from "./grabClient";
import { generatePersonality } from "./openaiClient";
import { pickVoice } from "./pickVoice";

export type PersonalityLookupInput = Pick<NormalizedPlace, "id" | "name" | "lat" | "lng"> &
  Partial<Pick<NormalizedPlace, "address" | "category" | "rating">>;

export async function getPersonalityForPlace(input: PersonalityLookupInput): Promise<CachedPersonality> {
  const cached = personalityCache.get(input.id);
  if (cached) return cached;

  const fallback: NormalizedPlace = {
    id: input.id,
    name: input.name,
    address: input.address,
    category: input.category,
    lat: input.lat,
    lng: input.lng,
    rating: input.rating,
  };

  const [placeResult, reviewsResult] = await Promise.allSettled([
    fetchGrabPlaceDetails(input.id),
    fetchGoogleReviews(fallback),
  ]);

  const place = placeResult.status === "fulfilled" ? placeResult.value : fallback;
  const reviews = reviewsResult.status === "fulfilled" ? reviewsResult.value : [];
  const generated = await generatePersonality(place, reviews);
  const personality: CachedPersonality = {
    ...generated,
    imageUrl: `/assets/images/${generated.archetype}.webp`,
    voiceId: pickVoice(generated.archetype),
    reviews,
    place,
  };

  personalityCache.set(input.id, personality);
  return personality;
}

export function toPublicPersonality(personality: CachedPersonality): Personality {
  return {
    archetype: personality.archetype,
    displayName: personality.displayName,
    intro: personality.intro,
    imageUrl: personality.imageUrl,
    voiceId: personality.voiceId,
    reviews: personality.reviews,
  };
}
