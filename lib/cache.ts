import type { Archetype } from "./archetypes";
import type { NormalizedPlace, Review } from "./grabClient";

export type Personality = {
  archetype: Archetype;
  displayName: string;
  intro: string;
  imageUrl: string;
  voiceId: string;
  reviews: Review[];
};

export type CachedPersonality = Personality & {
  place: NormalizedPlace;
};

const globalForCache = globalThis as typeof globalThis & {
  __grabmapsPersonalityCache?: Map<string, CachedPersonality>;
};

export const personalityCache =
  globalForCache.__grabmapsPersonalityCache ?? new Map<string, CachedPersonality>();

globalForCache.__grabmapsPersonalityCache = personalityCache;
