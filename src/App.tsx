import { useState } from "react";
import { GrabMap } from "./components/GrabMap";
import { PersonalityCard } from "./components/PersonalityCard";
import { RouteBanner } from "./components/RouteBanner";
import { usePersonality } from "./hooks/usePersonality";
import { fetchRoute } from "./services/route";
import { useMapStore } from "./store/mapStore";

export default function App() {
  const selectedPoi = useMapStore((state) => state.selectedPoi);
  const selectPoi = useMapStore((state) => state.selectPoi);
  const activeRoute = useMapStore((state) => state.activeRoute);
  const setRoute = useMapStore((state) => state.setRoute);
  const { personality, isLoading, error } = usePersonality(selectedPoi);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);

  async function handleDirections() {
    if (!selectedPoi) return;

    setRouteLoading(true);
    setRouteError(null);

    try {
      const route = await fetchRoute(selectedPoi);
      setRoute(route);
    } catch (err) {
      setRoute(null);
      setRouteError(err instanceof Error ? err.message : "Route request failed");
    } finally {
      setRouteLoading(false);
    }
  }

  return (
    <main className="flex h-screen min-h-[720px] w-screen overflow-hidden bg-slate-100">
      <div className="relative flex min-w-0 flex-1">
        <GrabMap selectedPoi={selectedPoi} activeRoute={activeRoute} onPoiTap={selectPoi} />
        <RouteBanner route={activeRoute} isLoading={routeLoading} error={routeError} />
      </div>
      <PersonalityCard
        poi={selectedPoi}
        personality={personality}
        isLoading={isLoading}
        error={error}
        onDirections={handleDirections}
        routeLoading={routeLoading}
      />
    </main>
  );
}
