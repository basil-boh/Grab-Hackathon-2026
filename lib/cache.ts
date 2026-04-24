import type { Archetype } from "./archetypes";
import type { NormalizedPlace, Review } from "./grabClient";

export type Personality = {
  archetype: Archetype;
  displayName: string;
  monologue: string;
  imageUrl: string;
  voiceId: string;
};

export type CachedPersonality = Personality & {
  place: NormalizedPlace;
  reviews: Review[];
};

const globalForCache = globalThis as typeof globalThis & {
  __grabmapsPersonalityCache?: Map<string, CachedPersonality>;
};

export const personalityCache =
  globalForCache.__grabmapsPersonalityCache ?? new Map<string, CachedPersonality>();

globalForCache.__grabmapsPersonalityCache = personalityCache;
