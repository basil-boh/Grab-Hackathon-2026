export type Archetype =
  | "italian-chef-happy"
  | "italian-chef-angry"
  | "japanese-chef-happy"
  | "japanese-calm"
  | "sushi-shop-owner"
  | "korean-chef"
  | "indian-abang"
  | "chinese-worker"
  | "mall-guard"
  | "angry-sergeant"
  | "stern-teacher"
  | "airport-staff"
  | "hotel-concierge"
  | "local-neutral";

export type PersonalityReview = {
  text: string;
  rating?: number;
  author?: string;
};

export type Personality = {
  archetype: Archetype;
  displayName: string;
  intro: string;
  imageUrl: string;
  voiceId: string;
  reviews: PersonalityReview[];
};

export type DuelSide = "a" | "b";

export type DuelParticipant = {
  side: DuelSide;
  place: {
    id: string;
    name: string;
    address?: string;
    category?: string;
    lat: number;
    lng: number;
    rating?: number;
  };
  personality: Personality;
};

export type DuelLine = {
  id: string;
  speaker: DuelSide;
  speakerName: string;
  placeId: string;
  placeName: string;
  archetype: Archetype;
  voiceId: string;
  imageUrl: string;
  text: string;
  impact: number;
  winRates: Record<DuelSide, number>;
};

export type PersonalityDuel = {
  distanceMeters: number;
  places: Record<DuelSide, DuelParticipant>;
  suggestion: {
    side: DuelSide;
    verdict: string;
    placeId: string;
    placeName: string;
    speakerName: string;
    archetype: Archetype;
    imageUrl: string;
    winRate: number;
  };
  lines: DuelLine[];
};

type ErrorPayload = { error: string };

export async function fetchPersonality(input: { id: string; name: string; lat: number; lng: number }): Promise<Personality> {
  const params = new URLSearchParams({
    name: input.name,
    lat: String(input.lat),
    lng: String(input.lng),
  });
  const response = await fetch(`/api/personality/${encodeURIComponent(input.id)}?${params}`);
  const payload = (await response.json()) as Personality | ErrorPayload;
  if (!response.ok || "error" in payload) {
    throw new Error("error" in payload ? payload.error : response.statusText);
  }
  return payload;
}

export async function fetchPersonalityDuel(input: {
  places: [
    { id: string; name: string; lat: number; lng: number; address?: string; category?: string; rating?: number },
    { id: string; name: string; lat: number; lng: number; address?: string; category?: string; rating?: number },
  ];
}): Promise<PersonalityDuel> {
  const response = await fetch("/api/personality/duel", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const payload = (await response.json()) as PersonalityDuel | ErrorPayload;
  if (!response.ok || "error" in payload) {
    throw new Error("error" in payload ? payload.error : response.statusText);
  }
  return payload;
}
