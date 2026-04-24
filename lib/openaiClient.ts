import { PERSONALITY_SYSTEM_PROMPT, isArchetype, personalityJsonSchema } from "./archetypes";
import type { Personality } from "./cache";
import { getServerEnv } from "./env";
import type { NormalizedPlace, Review } from "./grabClient";
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
