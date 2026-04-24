import { useRef, useState } from "react";
import { synthesizeSpeech, type SpeakOptions } from "../services/tts";

const audioCache = new Map<string, Blob>();

function cacheKey(text: string, opts: SpeakOptions): string {
  const scope = "sentiment" in opts ? `s:${opts.sentiment}` : `v:${opts.voiceId}`;
  return `${scope}|${text}`;
}

export function useTts() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function stopCurrent() {
    const current = audioRef.current;
    if (!current) return;
    current.onended = null;
    current.onerror = null;
    current.pause();
    audioRef.current = null;
  }

  async function play(text: string, opts: SpeakOptions): Promise<void> {
    if (!text.trim()) return;

    stopCurrent();
    setError(null);
    setIsSpeaking(true);

    try {
      const key = cacheKey(text, opts);
      let blob = audioCache.get(key);
      if (!blob) {
        blob = await synthesizeSpeech(text, opts);
        audioCache.set(key, blob);
      }

      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioRef.current = audio;

      audio.onended = () => {
        URL.revokeObjectURL(url);
        if (audioRef.current === audio) audioRef.current = null;
        setIsSpeaking(false);
      };
      audio.onerror = () => {
        URL.revokeObjectURL(url);
        if (audioRef.current === audio) audioRef.current = null;
        setIsSpeaking(false);
        setError("Voice playback failed");
      };

      try {
        await audio.play();
      } catch (playErr) {
        URL.revokeObjectURL(url);
        if (audioRef.current === audio) audioRef.current = null;
        setIsSpeaking(false);
        throw playErr;
      }
    } catch (err) {
      setIsSpeaking(false);
      setError(err instanceof Error ? err.message : "Voice generation failed");
      throw err;
    }
  }

  return { play, isSpeaking, error };
}
