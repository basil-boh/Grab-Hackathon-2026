import { useEffect, useState } from "react";
import { fetchPersonality, type Personality } from "../services/personality";
import type { Poi } from "../services/poi";
import { personalityCacheKey, useMapStore } from "../store/mapStore";

export function usePersonality(poi?: Poi | null) {
  const placeId = poi?.id;
  const roastMode = useMapStore((state) => state.roastMode);
  const cacheKey = placeId ? personalityCacheKey(placeId, roastMode) : undefined;
  const cached = useMapStore((state) => (cacheKey ? state.personalityCache[cacheKey] : undefined));
  const setPersonality = useMapStore((state) => state.setPersonality);
  const [personality, setLocalPersonality] = useState<Personality | null>(cached ?? null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    if (!poi || !placeId) {
      setLocalPersonality(null);
      setError(null);
      setIsLoading(false);
      return;
    }

    if (cached) {
      setLocalPersonality(cached);
      setError(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    setLocalPersonality(null);

    fetchPersonality(poi, { roast: roastMode })
      .then((next) => {
        if (cancelled) return;
        setPersonality(placeId, next, roastMode);
        setLocalPersonality(next);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Personality request failed");
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [cached, placeId, poi, roastMode, setPersonality]);

  return { personality, isLoading, error };
}
