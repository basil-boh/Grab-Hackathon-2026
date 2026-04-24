import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { CachedPersonality } from "../../lib/cache";
import type { NormalizedPlace } from "../../lib/grabClient";
import { generatePersonalityDuel, type DuelSide, type GeneratedDuelLine } from "../../lib/openaiClient";
import {
  getPersonalityForPlace,
  toPublicPersonality,
  type PersonalityLookupInput,
} from "../../lib/personalityPipeline";

const MAX_DUEL_DISTANCE_METERS = 500;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const body = parseBody(req.body);
  const places = Array.isArray(body?.places) ? body.places.map(parsePlace).filter(Boolean) : [];

  if (places.length !== 2) {
    res.status(400).json({ error: "Exactly two places are required" });
    return;
  }

  const [aInput, bInput] = places as [PersonalityLookupInput, PersonalityLookupInput];
  if (aInput.id === bInput.id) {
    res.status(400).json({ error: "Choose two different places for Duel Mode" });
    return;
  }

  const distanceMeters = distanceBetweenMeters(aInput, bInput);
  if (distanceMeters > MAX_DUEL_DISTANCE_METERS) {
    res.status(400).json({ error: "Duel Mode places must be within 500m" });
    return;
  }

  try {
    const [aPersonality, bPersonality] = await Promise.all([
      getPersonalityForPlace(aInput),
      getPersonalityForPlace(bInput),
    ]);

    const generatedDuel = await generatePersonalityDuel(
      { side: "a", place: aPersonality.place, personality: aPersonality },
      { side: "b", place: bPersonality.place, personality: bPersonality },
    );
    const participants = {
      a: toParticipant("a", aPersonality),
      b: toParticipant("b", bPersonality),
    };
    const winRateTimeline = buildWinRateTimeline(generatedDuel.lines);
    const finalWinRates = winRateTimeline.at(-1) ?? { a: 50, b: 50 };
    const suggestedSide: DuelSide = finalWinRates.a >= finalWinRates.b ? "a" : "b";
    const suggested = participants[suggestedSide];
    const generatedSuggestion = generatedDuel.suggestion.side === suggestedSide ? generatedDuel.suggestion.verdict : undefined;

    res.status(200).json({
      distanceMeters: Math.round(distanceMeters),
      places: participants,
      suggestion: {
        side: suggestedSide,
        verdict: generatedSuggestion ?? `${suggested.place.name} has the stronger live win-rate after the duel.`,
        placeId: suggested.place.id,
        placeName: suggested.place.name,
        speakerName: suggested.personality.displayName,
        archetype: suggested.personality.archetype,
        imageUrl: suggested.personality.imageUrl,
        winRate: finalWinRates[suggestedSide],
      },
      lines: generatedDuel.lines.map((line, index) => {
        const participant = participants[line.speaker];
        return {
          id: `duel-${index}-${line.speaker}`,
          speaker: line.speaker,
          speakerName: participant.personality.displayName,
          placeId: participant.place.id,
          placeName: participant.place.name,
          archetype: participant.personality.archetype,
          voiceId: participant.personality.voiceId,
          imageUrl: participant.personality.imageUrl,
          text: line.text,
          impact: line.impact,
          winRates: winRateTimeline[index],
        };
      }),
    });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Duel generation failed" });
  }
}

function parseBody(body: unknown): Record<string, unknown> | undefined {
  if (typeof body === "string") {
    try {
      return JSON.parse(body) as Record<string, unknown>;
    } catch {
      return undefined;
    }
  }

  if (body && typeof body === "object") return body as Record<string, unknown>;
  return undefined;
}

function parsePlace(input: unknown): PersonalityLookupInput | null {
  if (!input || typeof input !== "object") return null;

  const place = input as Record<string, unknown>;
  const id = String(place.id ?? "").trim();
  const name = String(place.name ?? "").trim();
  const lat = Number(place.lat);
  const lng = Number(place.lng);

  if (!id || !name || !isValidCoordinate(lat, lng)) return null;

  return {
    id,
    name,
    address: optionalString(place.address),
    category: optionalString(place.category),
    lat,
    lng,
    rating: optionalNumber(place.rating),
  };
}

function toParticipant(side: DuelSide, cached: CachedPersonality) {
  return {
    side,
    place: toPublicPlace(cached.place),
    personality: toPublicPersonality(cached),
  };
}

function toPublicPlace(place: NormalizedPlace) {
  return {
    id: place.id,
    name: place.name,
    address: place.address,
    category: place.category,
    lat: place.lat,
    lng: place.lng,
    rating: place.rating,
  };
}

function distanceBetweenMeters(a: Pick<NormalizedPlace, "lat" | "lng">, b: Pick<NormalizedPlace, "lat" | "lng">) {
  const earthRadiusMeters = 6371008.8;
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const deltaLat = toRadians(b.lat - a.lat);
  const deltaLng = toRadians(b.lng - a.lng);
  const haversine =
    Math.sin(deltaLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2;

  return 2 * earthRadiusMeters * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

function toRadians(degrees: number) {
  return (degrees * Math.PI) / 180;
}

function isValidCoordinate(lat: number, lng: number) {
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}

function optionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function optionalNumber(value: unknown) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : undefined;
}

function buildWinRateTimeline(lines: GeneratedDuelLine[]) {
  let aRate = 50;
  return lines.map((line, index) => {
    const lateRoundMultiplier = index >= Math.floor(lines.length / 2) ? 1.12 : 1;
    const swing = (2 + line.impact * 1.55) * lateRoundMultiplier;
    aRate += line.speaker === "a" ? swing : -swing;
    aRate = clamp(aRate, 12, 88);
    return toWinRates(aRate);
  });
}

function toWinRates(aRate: number) {
  const a = Math.round(clamp(aRate, 12, 88));
  return { a, b: 100 - a };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
