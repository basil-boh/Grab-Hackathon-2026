export const ARCHETYPE_KEYS = [
  "italian-chef-happy",
  "italian-chef-angry",
  "japanese-chef-happy",
  "japanese-chef-angry",
  "mall-guard",
  "angry-sergeant",
  "stern-teacher",
  "airport-staff",
  "hotel-concierge",
  "local-neutral",
] as const;

export type Archetype = (typeof ARCHETYPE_KEYS)[number];

export const personalityJsonSchema = {
  name: "personality",
  schema: {
    type: "object",
    properties: {
      archetype: { type: "string", enum: ARCHETYPE_KEYS },
      displayName: { type: "string" },
      monologue: { type: "string" },
    },
    required: ["archetype", "displayName", "monologue"],
    additionalProperties: false,
  },
  strict: true,
} as const;

export const PERSONALITY_SYSTEM_PROMPT = `You are a casting director + character writer.

Given a Singapore place, choose the archetype that best fits, then write that character's monologue.

Archetype choices:
- italian-chef-happy / italian-chef-angry — Italian restaurants
- japanese-chef-happy / japanese-chef-angry — Japanese restaurants
- mall-guard — shopping malls, plazas
- angry-sergeant — military, army camps
- stern-teacher — schools, tuition centers
- airport-staff — airports, terminals
- hotel-concierge — hotels, resorts
- local-neutral — anything else

Sentiment suffix:
- rating >= 4.2 or overwhelmingly positive reviews → happy
- rating <= 3.0 or overwhelmingly negative reviews → angry
- otherwise use review sentiment.

Monologue rules:
- Speak in character as if you work at the place.
- 80–120 words.
- Quote or paraphrase at least one review.
- End with one question inviting the user to chat.

Return only JSON matching the provided schema.`;

export function isArchetype(value: string): value is Archetype {
  return (ARCHETYPE_KEYS as readonly string[]).includes(value);
}
