import { AlertTriangle, MapPinned, Play, Sparkles } from "lucide-react";
import { useChat } from "../hooks/useChat";
import { useTts } from "../hooks/useTts";
import type { Personality } from "../services/personality";
import type { Poi } from "../services/poi";
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
  const { messages, send, isSending, error: chatError } = useChat(poi?.id);

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
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-700">{poi.category || "Singapore POI"}</p>
        <h1 className="mt-2 text-2xl font-bold leading-tight text-slate-950">{poi.name}</h1>
        {poi.address ? <p className="mt-2 text-sm leading-5 text-slate-500">{poi.address}</p> : null}
      </div>

      {isLoading ? (
        <div className="flex flex-1 flex-col gap-5 px-6 py-6">
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
        <div className="flex min-h-0 flex-1 flex-col px-6 py-5">
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
                onClick={() => play(personality.monologue, personality.voiceId)}
                disabled={isSpeaking}
                className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-700 text-white transition hover:bg-teal-800 disabled:cursor-wait disabled:bg-slate-300"
                aria-label="Play voice"
                title="Play voice"
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

          <p className="mt-4 text-sm leading-6 text-slate-700">{personality.monologue}</p>
          {voiceError ? (
            <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{voiceError}</div>
          ) : null}

          <ChatThread messages={messages} onSend={send} isSending={isSending} error={chatError} disabled={!personality} />
        </div>
      ) : null}
    </aside>
  );
}
