export type Sentiment = "happy" | "angry" | "neutral";

export type VoiceSettings = {
  stability: number;
  similarity_boost: number;
  style: number;
  use_speaker_boost: boolean;
};

type SentimentVoice = {
  voiceId: string;
  settings: VoiceSettings;
};

const SENTIMENT_VOICES: Record<Sentiment, SentimentVoice> = {
  happy: {
    voiceId: "cgSgspJ2msm6clMCkdW9", // Jessica — Playful, Bright, Warm
    settings: { stability: 0.35, similarity_boost: 0.75, style: 0.7, use_speaker_boost: true },
  },
  angry: {
    voiceId: "SOYHLrjzK2X1ezoPC6cr", // Harry — Fierce Warrior
    settings: { stability: 0.2, similarity_boost: 0.85, style: 0.85, use_speaker_boost: true },
  },
  neutral: {
    voiceId: "SAz9YHcvj6GT2YYXdXww", // River — Relaxed, Neutral, Informative
    settings: { stability: 0.45, similarity_boost: 0.8, style: 0.35, use_speaker_boost: true },
  },
};

export function voiceForSentiment(sentiment: Sentiment): SentimentVoice {
  return SENTIMENT_VOICES[sentiment];
}

export function isSentiment(value: unknown): value is Sentiment {
  return value === "happy" || value === "angry" || value === "neutral";
}
