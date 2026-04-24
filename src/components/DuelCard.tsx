import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, MapPinned, Play, RefreshCw, Shuffle, Square, Swords, TrendingUp, Volume2, X } from "lucide-react";
import { useDuelPlayback } from "../hooks/useDuelPlayback";
import type { DuelSide, PersonalityDuel } from "../services/personality";
import type { Poi } from "../services/poi";

type Props = {
  selectedPois: Poi[];
  duel: PersonalityDuel | null;
  isLoading: boolean;
  routeLoading: boolean;
  error: string | null;
  onReset: () => void;
  onExit: () => void;
  onDiscardFighter: (index: number) => void;
  onRouteToPlace: (side: DuelSide) => void | Promise<void>;
  onRandomNearbyDuel: () => void | Promise<void>;
};

const SIDES = ["a", "b"] as const;

export function DuelCard({
  selectedPois,
  duel,
  isLoading,
  routeLoading,
  error,
  onReset,
  onExit,
  onDiscardFighter,
  onRouteToPlace,
  onRandomNearbyDuel,
}: Props) {
  const { play, stop, isPlaying, activeLineId, error: voiceError } = useDuelPlayback();
  const autoplayedFor = useRef<string | null>(null);
  const [suggestionRevealed, setSuggestionRevealed] = useState(false);
  const duelKey = useMemo(() => duel?.lines.map((line) => `${line.id}:${line.text}`).join("|") ?? null, [duel]);
  const isRangeError = Boolean(error?.includes("500m"));
  const suggestion = duel?.suggestion;
  const activeLineIndex = duel ? duel.lines.findIndex((line) => line.id === activeLineId) : -1;
  const liveLine = activeLineIndex >= 0 ? duel?.lines[activeLineIndex] : suggestionRevealed ? duel?.lines.at(-1) : undefined;
  const liveRates = liveLine?.winRates ?? { a: 50, b: 50 };

  function playFullDuel() {
    if (!duel) return;
    setSuggestionRevealed(false);
    play(duel.lines)
      .then(() => setSuggestionRevealed(true))
      .catch(() => {
        // Browser autoplay can be blocked after async generation; the replay button is ready.
      });
  }

  useEffect(() => {
    if (!duel || !duelKey || autoplayedFor.current === duelKey) return;
    autoplayedFor.current = duelKey;
    setSuggestionRevealed(false);
    playFullDuel();
  }, [duel, duelKey]);

  useEffect(() => stop, [stop]);

  return (
    <aside className="flex h-full w-[430px] flex-col border-l border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-6 py-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-600">Duel Mode</p>
            <h1 className="mt-2 text-2xl font-bold leading-tight text-slate-950">POI Face-Off</h1>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                if (isPlaying) stop();
                else playFullDuel();
              }}
              disabled={!duel || isLoading}
              className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500 text-white transition hover:bg-amber-600 disabled:cursor-not-allowed disabled:bg-slate-300"
              aria-label={isPlaying ? "Stop duel voices" : "Play duel voices"}
              title={isPlaying ? "Stop" : "Play duel"}
            >
              {isPlaying ? <Square className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            </button>
            <button
              type="button"
              onClick={onReset}
              className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-900 text-white transition hover:bg-slate-700"
              aria-label="Reset duel"
              title="Reset duel"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={onExit}
              className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-50"
              aria-label="Exit duel mode"
              title="Exit duel"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <p className="mt-3 text-sm text-slate-500">
          {duel ? `${formatDistance(duel.distanceMeters)} apart` : `${selectedPois.length}/2 places selected`}
        </p>
        {!duel ? (
          <button
            type="button"
            onClick={() => void onRandomNearbyDuel()}
            disabled={isLoading}
            className="mt-4 flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-amber-500 px-4 text-sm font-semibold text-white transition hover:bg-amber-600 disabled:cursor-wait disabled:bg-slate-300"
          >
            <Shuffle className="h-4 w-4" />
            {isLoading ? "Finding restaurants..." : "Random nearby restaurant duel"}
          </button>
        ) : null}
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-6 py-5">
        <div className="grid grid-cols-2 gap-3">
          {SIDES.map((side, index) => {
            const participant = duel?.places[side];
            const pendingPoi = selectedPois[index];
            const title = participant?.place.name ?? pendingPoi?.name ?? "Waiting";
            const subtitle = participant?.personality.displayName ?? pendingPoi?.category ?? "Pick a place";

            return (
              <div key={side} className="min-w-0 rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="relative">
                  {participant ? (
                    <img
                      src={participant.personality.imageUrl}
                      alt={participant.personality.displayName}
                      className="h-28 w-full rounded-md object-cover"
                    />
                  ) : (
                    <div className="flex h-28 w-full items-center justify-center rounded-md bg-white text-amber-500">
                      <Swords className="h-7 w-7" />
                    </div>
                  )}
                  {!duel && pendingPoi ? (
                    <button
                      type="button"
                      onClick={() => onDiscardFighter(index)}
                      className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-md bg-white/90 text-slate-700 shadow-sm transition hover:bg-white"
                      aria-label={`Discard ${pendingPoi.name}`}
                      title="Discard"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  ) : null}
                </div>
                <p className="mt-3 truncate text-sm font-semibold text-slate-950">{title}</p>
                <p className="mt-1 truncate text-xs text-slate-500">{subtitle}</p>
              </div>
            );
          })}
        </div>

        {isLoading ? (
          <div className="space-y-3">
            <div className="h-14 animate-pulse rounded-lg bg-slate-200" />
            <div className="h-14 animate-pulse rounded-lg bg-slate-200" />
            <div className="h-14 animate-pulse rounded-lg bg-slate-200" />
          </div>
        ) : null}

        {error ? (
          <div
            className={`rounded-lg border p-4 ${
              isRangeError ? "border-amber-200 bg-amber-50 text-amber-900" : "border-red-200 bg-red-50 text-red-800"
            }`}
          >
            <div className="mb-2 flex items-center gap-2 font-semibold">
              <AlertTriangle className="h-5 w-5" />
              {isRangeError ? "Outside 500m range" : "Duel failed"}
            </div>
            <p className="text-sm leading-6">{error}</p>
          </div>
        ) : null}

        {voiceError ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{voiceError}</div>
        ) : null}

        {duel ? (
          <section className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Live win rate</p>
                <p className="mt-1 text-sm font-semibold text-slate-950">
                  {activeLineIndex >= 0 ? `Round ${activeLineIndex + 1}` : suggestionRevealed ? "Final score" : "Ready"}
                </p>
              </div>
              {liveLine ? (
                <span className="rounded-md bg-amber-100 px-2 py-1 text-xs font-bold text-amber-800">
                  Impact {liveLine.impact}/10
                </span>
              ) : null}
            </div>
            <WinRateRow
              name={duel.places.a.place.name}
              rate={liveRates.a}
              isLeading={liveRates.a >= liveRates.b}
            />
            <WinRateRow
              name={duel.places.b.place.name}
              rate={liveRates.b}
              isLeading={liveRates.b > liveRates.a}
            />
          </section>
        ) : null}

        {duel && suggestion && suggestionRevealed ? (
          <section className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-950">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-500 text-white">
                <TrendingUp className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-700">Suggested pick</p>
                <h2 className="mt-1 truncate text-lg font-bold">{suggestion.placeName}</h2>
                <p className="mt-1 text-sm font-semibold">{suggestion.winRate}% live win rate</p>
                <p className="mt-2 text-sm leading-6">{suggestion.verdict}</p>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              {SIDES.map((side) => (
                <button
                  type="button"
                  key={side}
                  onClick={() => {
                    stop();
                    void onRouteToPlace(side);
                  }}
                  disabled={routeLoading}
                  className={`flex h-11 min-w-0 items-center justify-center gap-2 rounded-lg px-3 text-sm font-semibold transition disabled:cursor-wait disabled:bg-slate-300 ${
                    suggestion.side === side
                      ? "bg-slate-950 text-white hover:bg-slate-800"
                      : "border border-amber-300 bg-white text-amber-900 hover:bg-amber-100"
                  }`}
                >
                  <MapPinned className="h-4 w-4 shrink-0" />
                  <span className="min-w-0 truncate">{routeLoading ? "Routing..." : duel.places[side].place.name}</span>
                </button>
              ))}
            </div>
          </section>
        ) : null}

        {duel ? (
          <section>
            <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              <Volume2 className="h-4 w-4" />
              Live argument
            </div>
            <ol className="space-y-3">
              {duel.lines.map((line) => (
                <li
                  key={line.id}
                  className={`rounded-lg border px-4 py-3 transition ${
                    activeLineId === line.id ? "border-amber-400 bg-amber-50" : "border-slate-200 bg-white"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <img src={line.imageUrl} alt="" className="h-7 w-7 rounded-md object-cover" />
                    <span className="min-w-0 truncate text-sm font-semibold text-slate-950">{line.speakerName}</span>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-700">{line.text}</p>
                </li>
              ))}
            </ol>
          </section>
        ) : null}
      </div>
    </aside>
  );
}

function WinRateRow({ name, rate, isLeading }: { name: string; rate: number; isLeading: boolean }) {
  return (
    <div className="mb-3 last:mb-0">
      <div className="mb-1 flex items-center justify-between gap-3 text-sm">
        <span className="min-w-0 truncate font-semibold text-slate-800">{name}</span>
        <span className={`shrink-0 font-bold ${isLeading ? "text-amber-700" : "text-slate-500"}`}>{rate}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
        <div
          className={`h-full rounded-full transition-all duration-700 ease-out ${
            isLeading ? "bg-amber-500" : "bg-slate-400"
          }`}
          style={{ width: `${rate}%` }}
        />
      </div>
    </div>
  );
}

function formatDistance(distanceMeters: number) {
  if (distanceMeters >= 1000) return `${(distanceMeters / 1000).toFixed(1)} km`;
  return `${Math.max(1, Math.round(distanceMeters))} m`;
}
