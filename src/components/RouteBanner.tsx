import { Navigation, Route } from "lucide-react";
import type { RouteData } from "../services/route";

type Props = {
  route: RouteData | null;
  isLoading: boolean;
  error: string | null;
};

function formatDistance(meters: number) {
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${Math.round(meters)} m`;
}

function formatDuration(seconds: number) {
  const minutes = Math.max(1, Math.round(seconds / 60));
  return `${minutes} min`;
}

export function RouteBanner({ route, isLoading, error }: Props) {
  if (!isLoading && !error && !route) return null;

  return (
    <div className="absolute left-6 top-6 z-20 flex min-h-14 min-w-[300px] items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-panel">
      <div className="flex h-9 w-9 items-center justify-center rounded-md bg-teal-700 text-white">
        {isLoading ? <Navigation className="h-5 w-5 animate-pulse" /> : <Route className="h-5 w-5" />}
      </div>
      <div>
        <p className="text-sm font-semibold text-slate-900">
          {isLoading ? "Calculating route" : error ? "Route failed" : "Driving route"}
        </p>
        <p className="text-sm text-slate-600">
          {error || (route ? `${formatDistance(route.distanceMeters)} · ${formatDuration(route.durationSeconds)}` : "")}
        </p>
      </div>
    </div>
  );
}
