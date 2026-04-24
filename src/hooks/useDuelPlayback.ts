import { useCallback, useEffect, useRef, useState } from "react";
import { synthesizeSpeech } from "../services/tts";
import type { DuelLine } from "../services/personality";

const audioCache = new Map<string, Blob>();

function cacheKey(line: DuelLine) {
  return `v:${line.voiceId}|${line.text}`;
}

export function useDuelPlayback() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const tokenRef = useRef(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeLineId, setActiveLineId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const clearCurrentAudio = useCallback(() => {
    const current = audioRef.current;
    if (current) {
      current.onended = null;
      current.onerror = null;
      current.pause();
      audioRef.current = null;
    }

    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
  }, []);

  const stop = useCallback(() => {
    tokenRef.current += 1;
    clearCurrentAudio();
    setIsPlaying(false);
    setActiveLineId(null);
  }, [clearCurrentAudio]);

  const playLine = useCallback(
    async (line: DuelLine, token: number) => {
      let blob = audioCache.get(cacheKey(line));
      if (!blob) {
        blob = await synthesizeSpeech(line.text, { voiceId: line.voiceId });
        audioCache.set(cacheKey(line), blob);
      }
      if (tokenRef.current !== token) return;

      await new Promise<void>((resolve, reject) => {
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        objectUrlRef.current = url;
        audioRef.current = audio;

        audio.onended = () => {
          clearCurrentAudio();
          resolve();
        };
        audio.onerror = () => {
          clearCurrentAudio();
          reject(new Error("Duel playback failed"));
        };

        audio.play().catch((playError: unknown) => {
          clearCurrentAudio();
          reject(playError instanceof Error ? playError : new Error("Duel playback was blocked"));
        });
      });
    },
    [clearCurrentAudio],
  );

  const play = useCallback(
    async (lines: DuelLine[]) => {
      if (!lines.length) return;

      stop();
      const token = tokenRef.current + 1;
      tokenRef.current = token;
      setError(null);
      setIsPlaying(true);

      try {
        for (const line of lines) {
          if (tokenRef.current !== token) return;
          setActiveLineId(line.id);
          await playLine(line, token);
        }
      } catch (err) {
        if (tokenRef.current === token) {
          setError(err instanceof Error ? err.message : "Duel voice generation failed");
        }
        throw err;
      } finally {
        if (tokenRef.current === token) {
          setIsPlaying(false);
          setActiveLineId(null);
        }
      }
    },
    [playLine, stop],
  );

  useEffect(() => stop, [stop]);

  return { play, stop, isPlaying, activeLineId, error };
}
