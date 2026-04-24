import { Navigation, Route, X } from "lucide-react";
import type { RouteData } from "../services/route";

type Props = {
  route: RouteData | null;
  isLoading: boolean;
  error: string | null;
  onCancel: () => void;
};

function formatDistance(meters: number) {
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${Math.round(meters)} m`;
}

function formatDuration(seconds: number) {
  const minutes = Math.max(1, Math.round(seconds / 60));
  return `${minutes} min`;
}

export function RouteBanner({ route, isLoading, error, onCancel }: Props) {
  if (!isLoading && !error && !route) return null;

  return (
    <div className="absolute bottom-[354px] left-6 z-20 flex min-h-14 w-[360px] items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-panel">
      <div className="flex h-9 w-9 items-center justify-center rounded-md bg-teal-700 text-white">
        {isLoading ? <Navigation className="h-5 w-5 animate-pulse" /> : <Route className="h-5 w-5" />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-slate-900">
          {isLoading ? "Calculating route" : error ? "Route failed" : "Driving route"}
        </p>
        <p className="truncate text-sm text-slate-600">
          {error || (route ? `${formatDistance(route.distanceMeters)} · ${formatDuration(route.durationSeconds)}` : "")}
        </p>
      </div>
      <button
        type="button"
        onClick={onCancel}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
        aria-label="Cancel driving route"
        title="Cancel driving route"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
