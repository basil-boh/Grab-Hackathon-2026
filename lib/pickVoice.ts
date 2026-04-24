import registry from "./voiceRegistry.json";
import type { Archetype } from "./archetypes";

const voiceRegistry = registry as Record<Archetype, string[]>;

export function pickVoice(archetype: Archetype): string {
  const voices = voiceRegistry[archetype] ?? voiceRegistry["local-neutral"];
  if (!voices?.length) {
    throw new Error(`No ElevenLabs voice configured for ${archetype}`);
  }

  return voices[Math.floor(Math.random() * voices.length)];
}
