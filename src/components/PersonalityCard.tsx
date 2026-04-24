import { useEffect, useRef } from "react";
import { AlertTriangle, MapPinned, Play, Sparkles, Star, Volume2 } from "lucide-react";
import { useChat } from "../hooks/useChat";
import { useTts } from "../hooks/useTts";
import { ratingToSentiment, sentimentColorClasses } from "../lib/sentiment";
import type { Personality } from "../services/personality";
import type { Poi } from "../services/poi";
import { useMapStore } from "../store/mapStore";
import { ChatThread } from "./ChatThread";

type Props = {
  poi: Poi | null;
  personality: Personality | null;
  isLoading: boolean;
  error: string | null;
  onDirections: () => void;
  routeLoading: boolean;
};

export function PersonalityCard({ poi, personality, isLoading, error, onDirections, routeLoading }: Props) {
  const { play, isSpeaking, error: voiceError } = useTts();
  const roastMode = useMapStore((state) => state.roastMode);
  const setRoastMode = useMapStore((state) => state.setRoastMode);
  const { messages, send, isSending, error: chatError } = useChat(poi?.id, roastMode);
  const autoplayedFor = useRef<string | null>(null);
  const showGrabFoodCta = Boolean(poi && personality && isFoodRelated(poi, personality));

  useEffect(() => {
    if (!personality || !poi) return;
    const autoplayKey = `${poi.id}:${personality.intro}`;
    if (autoplayedFor.current === autoplayKey) return;
    autoplayedFor.current = autoplayKey;

    play(personality.intro, { voiceId: personality.voiceId }).catch(() => {
      // Browser blocked autoplay; user can still tap Play manually.
    });
  }, [personality, poi, play]);

  if (!poi) {
    return (
      <aside className="flex h-full w-[430px] flex-col border-l border-slate-200 bg-white px-7 py-7">
        <div className="flex h-full flex-col justify-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-teal-700 text-white">
            <Sparkles className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-bold text-slate-950">GrabMaps Personality Map</h1>
          <p className="mt-3 max-w-sm text-sm leading-6 text-slate-600">
            Search a Singapore place and pick a marker.
          </p>
        </div>
      </aside>
    );
  }

  return (
    <aside className="flex h-full w-[430px] flex-col border-l border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-6 py-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-700">{poi.category || "Singapore POI"}</p>
            <h1 className="mt-2 text-2xl font-bold leading-tight text-slate-950">{poi.name}</h1>
            {poi.address ? <p className="mt-2 text-sm leading-5 text-slate-500">{poi.address}</p> : null}
          </div>
          <button
            type="button"
            onClick={() => setRoastMode(!roastMode)}
            className={`shrink-0 rounded-full px-3 py-2 text-sm font-semibold transition ${
              roastMode ? "bg-red-600 text-white" : "bg-slate-200 text-slate-700 hover:bg-slate-300"
            }`}
            aria-pressed={roastMode}
          >
            🔥 Roast
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-6 py-6">
          <div className="h-64 animate-pulse rounded-lg bg-slate-200" />
          <div className="h-5 w-2/3 animate-pulse rounded bg-slate-200" />
          <div className="space-y-3">
            <div className="h-4 animate-pulse rounded bg-slate-200" />
            <div className="h-4 animate-pulse rounded bg-slate-200" />
            <div className="h-4 w-5/6 animate-pulse rounded bg-slate-200" />
          </div>
        </div>
      ) : error ? (
        <div className="mx-6 mt-6 rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">
          <div className="mb-2 flex items-center gap-2 font-semibold">
            <AlertTriangle className="h-5 w-5" />
            Personality failed
          </div>
          <p className="text-sm leading-6">{error}</p>
        </div>
      ) : personality ? (
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-6 py-5">
          <img
            src={personality.imageUrl}
            alt={personality.displayName}
            className="h-64 w-full rounded-lg object-cover"
          />
          <div className="mt-4 flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{personality.archetype}</p>
              <h2 className="mt-1 text-xl font-bold text-slate-950">{personality.displayName}</h2>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => play(personality.intro, { voiceId: personality.voiceId })}
                disabled={isSpeaking}
                className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-700 text-white transition hover:bg-teal-800 disabled:cursor-wait disabled:bg-slate-300"
                aria-label="Replay intro"
                title="Replay intro"
              >
                <Play className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={onDirections}
                disabled={routeLoading}
                className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-900 text-white transition hover:bg-slate-700 disabled:cursor-wait disabled:bg-slate-300"
                aria-label="Get directions"
                title="Directions"
              >
                <MapPinned className="h-4 w-4" />
              </button>
            </div>
          </div>

          <p className="mt-4 text-sm leading-6 text-slate-700">{personality.intro}</p>
          {voiceError ? (
            <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{voiceError}</div>
          ) : null}

          {personality.reviews?.length ? (
            <section className="mt-5 border-t border-slate-200 pt-4">
              <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                Reviews · tap to hear the reviewer's tone
              </h3>
              <ul className="mt-3 space-y-3">
                {personality.reviews.map((review, index) => {
                  const sentiment = ratingToSentiment(review.rating);
                  const classes = sentimentColorClasses(sentiment);
                  return (
                    <li key={index} className={`rounded-lg border px-3 py-2 ${classes}`}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium">{review.author ?? "A visitor"}</span>
                        <div className="flex items-center gap-2">
                          {typeof review.rating === "number" ? (
                            <span className="flex items-center gap-1 text-xs">
                              <Star className="h-3 w-3 fill-current" />
                              {review.rating.toFixed(1)}
                            </span>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => play(review.text, { sentiment })}
                            disabled={isSpeaking}
                            className="flex h-7 w-7 items-center justify-center rounded-md bg-white/80 text-slate-900 shadow-sm transition hover:bg-white disabled:cursor-wait disabled:bg-slate-200"
                            aria-label={`Play ${sentiment} review`}
                            title={`Play review in ${sentiment} voice`}
                          >
                            <Volume2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                      <p className="mt-1 text-sm leading-5">{review.text}</p>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}

          <ChatThread messages={messages} onSend={send} isSending={isSending} error={chatError} disabled={!personality} />

          {showGrabFoodCta ? (
            <button
              type="button"
              onClick={() =>
                window.open(
                  `https://food.grab.com/sg/en/restaurants?search=${encodeURIComponent(poi.name)}`,
                  "_blank",
                )
              }
              className="mt-4 w-full rounded-lg bg-green-600 px-4 py-3 font-semibold text-white transition hover:bg-green-700"
            >
              🛵 Order from {personality.displayName} on GrabFood →
            </button>
          ) : null}
        </div>
      ) : null}
    </aside>
  );
}

const FOOD_KEYWORDS = ["food", "restaurant", "cafe", "eatery", "hawker", "chef", "kopitiam", "bar"];

function isFoodRelated(poi: Poi, personality: Personality) {
  const haystack = `${poi.category ?? ""} ${personality.archetype}`.toLowerCase();
  return FOOD_KEYWORDS.some((keyword) => haystack.includes(keyword));
}
