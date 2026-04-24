import { PERSONALITY_SYSTEM_PROMPT, buildRoastSystemPrompt, isArchetype, personalityJsonSchema } from "./archetypes";
import type { Personality } from "./cache";
import { getServerEnv } from "./env";
import type { NormalizedPlace, Review } from "./grabClient";
import { withTimeout } from "./withTimeout";

const OPENAI_TIMEOUT_MS = 10000;
const DUEL_TURN_COUNT = 6;

const duelJsonSchema = {
  name: "personality_duel",
  schema: {
    type: "object",
    properties: {
      lines: {
        type: "array",
        items: {
          type: "object",
          properties: {
            speaker: { type: "string", enum: ["a", "b"] },
            text: { type: "string" },
            impact: { type: "number" },
          },
          required: ["speaker", "text", "impact"],
          additionalProperties: false,
        },
      },
      suggestion: {
        type: "object",
        properties: {
          side: { type: "string", enum: ["a", "b"] },
          verdict: { type: "string" },
        },
        required: ["side", "verdict"],
        additionalProperties: false,
      },
    },
    required: ["lines", "suggestion"],
    additionalProperties: false,
  },
  strict: true,
} as const;

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

export async function generatePersonality(place: NormalizedPlace, reviews: Review[], options: { roast?: boolean } = {}) {
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
        { role: "system", content: options.roast ? buildRoastSystemPrompt(place) : PERSONALITY_SYSTEM_PROMPT },
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

export async function generateChatReply(personality: Personality, message: string, options: { roast?: boolean } = {}) {
  const payload = await openAiChat(
    {
      model: "gpt-4o-mini",
      temperature: 0.75,
      max_tokens: 180,
      messages: [
        {
          role: "system",
          content: [
            ...(options.roast
              ? [
                  "ROAST MODE: Reply in savage-comedy roast register, using the place's reviews and venue details as ammunition. Be witty, specific, and cutting while staying in character.",
                ]
              : []),
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

export type DuelSide = "a" | "b";

export type GeneratedDuelLine = {
  speaker: DuelSide;
  text: string;
  impact: number;
};

export type GeneratedPersonalityDuel = {
  lines: GeneratedDuelLine[];
  suggestion: {
    side: DuelSide;
    verdict: string;
  };
};

type DuelParticipant = {
  side: DuelSide;
  place: NormalizedPlace;
  personality: Personality;
};

export async function generatePersonalityDuel(
  a: DuelParticipant,
  b: DuelParticipant,
  options: { roast?: boolean } = {},
): Promise<GeneratedPersonalityDuel> {
  const payload = await openAiChat(
    {
      model: "gpt-4o-mini",
      temperature: 0.9,
      max_tokens: 520,
      messages: [
        {
          role: "system",
          content: [
            "You write a punchy live debate between two Singapore map POI characters.",
            `Generate exactly ${DUEL_TURN_COUNT} short turns that strictly alternate speakers: a, b, a, b, a, b.`,
            "Each line is playful trash-talk about the other place's reviews, rating, category, or venue vibe.",
            ...(options.roast
              ? [
                  "Roast Mode is ON: make both characters sharper, more savage, more specific, and unmistakably in stand-up roast battle mode.",
                ]
              : []),
            "After the debate, suggest which side currently has the stronger case, but do not decide for the user.",
            "The suggestion should consider review signal, argument quality, place fit, and the line impact scores.",
            "For every line, assign impact from 1-10: 1 is a weak comeback, 10 is a devastating crowd-winning roast.",
            "Write a short verdict under 18 words explaining why that side is the stronger suggestion.",
            "Keep each character's archetype voice, but avoid slurs, profanity, threats, and unverifiable health or safety claims.",
            "Lines should be 8-18 words, demo-friendly, and easy to perform with TTS.",
            "Return only JSON matching the schema.",
          ].join("\n"),
        },
        {
          role: "user",
          content: JSON.stringify({
            participants: [toDuelPromptParticipant(a), toDuelPromptParticipant(b)],
          }),
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: duelJsonSchema,
      },
    },
    "OpenAI personality duel",
  );

  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    throw new Error("OpenAI personality duel returned no content");
  }

  const parsed = JSON.parse(content) as { lines?: GeneratedDuelLine[] };
  const suggestion = parseDuelSuggestion((parsed as { suggestion?: unknown }).suggestion);
  const lines = Array.isArray(parsed.lines) ? parsed.lines : [];
  if (!lines.length) {
    throw new Error("OpenAI personality duel returned no lines");
  }

  return {
    lines: lines.slice(0, DUEL_TURN_COUNT).map((line, index) => {
      const speaker: DuelSide = index % 2 === 0 ? "a" : "b";
      return {
        speaker,
        text: sanitizeDuelLine(line.text),
        impact: sanitizeImpact(line.impact),
      };
    }),
    suggestion,
  };
}

function toDuelPromptParticipant(participant: DuelParticipant) {
  return {
    side: participant.side,
    place: {
      name: participant.place.name,
      category: participant.place.category,
      address: participant.place.address,
      rating: participant.place.rating,
      coordinates: { lat: participant.place.lat, lng: participant.place.lng },
    },
    character: {
      archetype: participant.personality.archetype,
      displayName: participant.personality.displayName,
      intro: participant.personality.intro,
    },
    reviews: participant.personality.reviews.slice(0, 4).map((review) => ({
      text: review.text,
      rating: review.rating,
      author: review.author,
    })),
  };
}

function sanitizeDuelLine(value: unknown) {
  if (typeof value !== "string") return "I have no comeback, but my place still wins.";
  return value.replace(/\s+/g, " ").trim().slice(0, 220);
}

function sanitizeImpact(value: unknown) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return 5;
  return Math.min(10, Math.max(1, Math.round(numberValue)));
}

function parseDuelSuggestion(value: unknown): GeneratedPersonalityDuel["suggestion"] {
  if (!value || typeof value !== "object") {
    return { side: "a", verdict: "Stronger reviews and sharper character energy make this the safer pick." };
  }

  const suggestion = value as Record<string, unknown>;
  const side = suggestion.side === "b" ? "b" : "a";
  const verdict =
    typeof suggestion.verdict === "string" && suggestion.verdict.trim()
      ? suggestion.verdict.replace(/\s+/g, " ").trim().slice(0, 180)
      : "Stronger reviews and sharper character energy make this the safer pick.";

  return { side, verdict };
}
