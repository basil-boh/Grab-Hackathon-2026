import { useRef, useState } from "react";
import { synthesizeSpeech } from "../services/tts";

export function useTts() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function play(text: string, voiceId: string) {
    setIsSpeaking(true);
    setError(null);

    try {
      audioRef.current?.pause();
      const blob = await synthesizeSpeech(text, voiceId);
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => {
        URL.revokeObjectURL(url);
        setIsSpeaking(false);
      };
      audio.onerror = () => {
        URL.revokeObjectURL(url);
        setIsSpeaking(false);
        setError("Voice playback failed");
      };
      await audio.play();
    } catch (err) {
      setIsSpeaking(false);
      setError(err instanceof Error ? err.message : "Voice generation failed");
    }
  }

  return { play, isSpeaking, error };
}
