export type Personality = {
  archetype:
    | "italian-chef-happy"
    | "italian-chef-angry"
    | "japanese-chef-happy"
    | "japanese-chef-angry"
    | "mall-guard"
    | "angry-sergeant"
    | "stern-teacher"
    | "airport-staff"
    | "hotel-concierge"
    | "local-neutral";
  displayName: string;
  monologue: string;
  imageUrl: string;
  voiceId: string;
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
