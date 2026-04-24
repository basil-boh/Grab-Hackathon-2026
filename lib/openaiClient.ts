import { PERSONALITY_SYSTEM_PROMPT, isArchetype, personalityJsonSchema } from "./archetypes";
import type { Personality } from "./cache";
import { getServerEnv } from "./env";
import type { NormalizedPlace, Review } from "./grabClient";
import {
  POI_MODEL_KEYS,
  isPoiModelKey,
  pathForPoiModelKey,
  type PoiModelAssignment,
  type PoiModelInput,
} from "./markerModels";
import { withTimeout } from "./withTimeout";

const OPENAI_TIMEOUT_MS = 10000;

function requireOpenAiKey() {
  const key = getServerEnv("OPENAI_API_KEY");
  if (!key) throw new Error("OPENAI_API_KEY is not configured");
  return key;
}

async function openAiChat(body: Record<string, unknown>, label: string) {
  return withTimeout(label, OPENAI_TIMEOUT_MS, async (signal) => {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${requireOpenAiKey()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`${label} returned ${response.status}: ${text.slice(0, 180)}`);
    }

    return response.json();
  });
}

export async function generatePersonality(place: NormalizedPlace, reviews: Review[]) {
  const userPayload = {
    place: {
      name: place.name,
      category: place.category,
      address: place.address,
      rating: place.rating,
      coordinates: { lat: place.lat, lng: place.lng },
    },
    reviews: reviews.map((review) => ({
      text: review.text,
      rating: review.rating,
      author: review.author,
    })),
  };

  const payload = await openAiChat(
    {
      model: "gpt-4o-mini",
      temperature: 0.8,
      messages: [
        { role: "system", content: PERSONALITY_SYSTEM_PROMPT },
        { role: "user", content: JSON.stringify(userPayload) },
      ],
      response_format: {
        type: "json_schema",
        json_schema: personalityJsonSchema,
      },
    },
    "OpenAI personality",
  );

  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    throw new Error("OpenAI personality returned no content");
  }

  const parsed = JSON.parse(content) as Pick<Personality, "archetype" | "displayName" | "intro">;
  if (!isArchetype(parsed.archetype)) {
    throw new Error("OpenAI personality returned an unknown archetype");
  }

  return parsed;
}

export async function generateChatReply(personality: Personality, message: string) {
  const payload = await openAiChat(
    {
      model: "gpt-4o-mini",
      temperature: 0.75,
      max_tokens: 180,
      messages: [
        {
          role: "system",
          content: [
            "You are replying as a Singapore POI character.",
            `Archetype: ${personality.archetype}`,
            `Character name: ${personality.displayName}`,
            `Character intro context: ${personality.intro}`,
            "Stay in character. Answer only the user's latest message. Keep it under 70 words.",
          ].join("\n"),
        },
        { role: "user", content: message },
      ],
    },
    "OpenAI chat",
  );

  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new Error("OpenAI chat returned no content");
  }

  return content.trim();
}

const poiModelJsonSchema = {
  name: "poi_marker_models",
  schema: {
    type: "object",
    properties: {
      items: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            modelKey: { type: "string", enum: POI_MODEL_KEYS },
            reason: { type: "string" },
          },
          required: ["id", "modelKey", "reason"],
          additionalProperties: false,
        },
      },
    },
    required: ["items"],
    additionalProperties: false,
  },
  strict: true,
} as const;

const POI_MODEL_SYSTEM_PROMPT = `You classify Singapore map places into the closest available 3D marker model.

Return exactly one modelKey for each input id. Do not invent model keys.

Available model keys:
- chef: restaurants, Italian, Mediterranean, general dining, bars with food, food courts when no better cuisine-specific model exists
- barista: cafes, coffee shops, bakeries, dessert shops, tea shops
- mascot: fast food, casual chains, snack kiosks, playful venues
- angry: rating below 3.0 or clearly poor/angry sentiment
- angel: rating above 4.5 or exceptionally premium/beloved places
- japaneseChef: Japanese restaurants, sushi, ramen, izakaya, omakase
- koreanChef: Korean restaurants, Korean BBQ, bibimbap, Korean fried chicken
- mallGuard: malls, shopping centres, retail plazas, department stores
- airportStaff: airports, airport terminals, airline services
- hotelConcierge: hotels, resorts, serviced apartments, hostels
- sternTeacher: schools, tuition centres, academies, libraries
- localNeutral: generic local businesses, offices, clinics, shops, services, anything unclear

Priority rules:
1. If rating is below 3.0, choose angry.
2. If rating is above 4.5, choose angel, unless the place is clearly airport/hotel/school/mall where the professional role is more visually specific.
3. Otherwise use the name and category to choose the closest real-world worker/character model.
4. For any restaurant that is not Japanese/Korean/cafe/fast food, choose chef.

Return compact reasons under 12 words.`;

export async function classifyPoiMarkerModels(items: PoiModelInput[]): Promise<PoiModelAssignment[]> {
  const payload = await openAiChat(
    {
      model: "gpt-4o-mini",
      temperature: 0.1,
      messages: [
        { role: "system", content: POI_MODEL_SYSTEM_PROMPT },
        {
          role: "user",
          content: JSON.stringify({
            items: items.map((item) => ({
              id: item.id,
              name: item.name,
              category: item.category,
              rating: item.rating,
            })),
          }),
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: poiModelJsonSchema,
      },
    },
    "OpenAI POI model classification",
  );

  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    throw new Error("OpenAI POI model classification returned no content");
  }

  const parsed = JSON.parse(content) as { items?: Array<{ id?: string; modelKey?: string; reason?: string }> };
  if (!Array.isArray(parsed.items)) {
    throw new Error("OpenAI POI model classification returned malformed JSON");
  }

  const expectedIds = new Set(items.map((item) => item.id));
  const assignments = parsed.items.map((item) => {
    if (typeof item.id !== "string" || !expectedIds.has(item.id)) {
      throw new Error("OpenAI POI model classification returned an unknown id");
    }
    if (typeof item.modelKey !== "string" || !isPoiModelKey(item.modelKey)) {
      throw new Error("OpenAI POI model classification returned an unknown model key");
    }

    return {
      id: item.id,
      modelKey: item.modelKey,
      modelPath: pathForPoiModelKey(item.modelKey),
      reason: typeof item.reason === "string" ? item.reason : undefined,
    };
  });

  if (assignments.length !== expectedIds.size) {
    throw new Error("OpenAI POI model classification did not return every POI");
  }

  return assignments;
}
