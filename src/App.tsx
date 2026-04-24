import { useRef, useState } from "react";
import { GrabMap } from "./components/GrabMap";
import { MapErrorBoundary } from "./components/MapErrorBoundary";
import { PersonalityCard } from "./components/PersonalityCard";
import { RouteBanner } from "./components/RouteBanner";
import { usePersonality } from "./hooks/usePersonality";
import type { Poi } from "./services/poi";
import { fetchRoute, type LocationPoint } from "./services/route";
import { useMapStore } from "./store/mapStore";

export default function App() {
  const selectedPoi = useMapStore((state) => state.selectedPoi);
  const selectPoi = useMapStore((state) => state.selectPoi);
  const activeRoute = useMapStore((state) => state.activeRoute);
  const setRoute = useMapStore((state) => state.setRoute);
  const { personality, isLoading, error } = usePersonality(selectedPoi);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [userLocation, setUserLocation] = useState<LocationPoint | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const routeRequestId = useRef(0);

  async function getCurrentLocation() {
    if (!("geolocation" in navigator)) {
      throw new Error("Browser location is not available");
    }

    const position = await new Promise<GeolocationPosition>((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 30000,
      });
    });

    const location = {
      lat: position.coords.latitude,
      lng: position.coords.longitude,
    };

    if (!isValidLocation(location)) {
      throw new Error("Browser returned an invalid current location");
    }

    setUserLocation(location);
    return location;
  }

  async function routeFromCurrentLocation(poi: Poi) {
    const location = await getCurrentLocation();

    return fetchRoute(poi, {
      lat: location.lat,
      lng: location.lng,
    });
  }

  async function handleLocateMe() {
    setIsLocating(true);
    setRouteError(null);

    try {
      await getCurrentLocation();
    } catch (err) {
      setRouteError(formatLocationError(err));
    } finally {
      setIsLocating(false);
    }
  }

  async function handlePoiSelect(poi: Poi) {
    const requestId = routeRequestId.current + 1;
    routeRequestId.current = requestId;
    selectPoi(poi);
    setRoute(null);

    setRouteLoading(true);
    setRouteError(null);

    try {
      const route = await routeFromCurrentLocation(poi);
      if (routeRequestId.current !== requestId) return;
      setRoute(route);
    } catch (err) {
      if (routeRequestId.current !== requestId) return;
      setRoute(null);
      setRouteError(formatRouteError(err));
    } finally {
      if (routeRequestId.current === requestId) {
        setRouteLoading(false);
      }
    }
  }

  async function handleDirections() {
    if (!selectedPoi) return;
    await handlePoiSelect(selectedPoi);
  }

  function handleCancelRoute() {
    routeRequestId.current += 1;
    setRoute(null);
    setRouteError(null);
    setRouteLoading(false);
  }

  return (
    <main className="flex h-screen min-h-[720px] w-screen overflow-hidden bg-slate-100">
      <div className="relative flex min-w-0 flex-1">
        <MapErrorBoundary>
          <GrabMap
            selectedPoi={selectedPoi}
            activeRoute={activeRoute}
            userLocation={userLocation}
            onPoiTap={handlePoiSelect}
            onLocateMe={handleLocateMe}
            isLocating={isLocating}
          />
        </MapErrorBoundary>
        <RouteBanner route={activeRoute} isLoading={routeLoading} error={routeError} onCancel={handleCancelRoute} />
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

function formatRouteError(error: unknown) {
  return formatLocationError(error);
}

function formatLocationError(error: unknown) {
  if (isGeolocationError(error)) {
    if (error.code === error.PERMISSION_DENIED) {
      return "Location permission is required to show your current location";
    }
    if (error.code === error.TIMEOUT) {
      return "Current location lookup timed out";
    }
  }

  return error instanceof Error ? error.message : "Route request failed";
}

function isGeolocationError(error: unknown): error is GeolocationPositionError {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof (error as { code?: unknown }).code === "number"
  );
}

function isValidLocation(location: LocationPoint) {
  return (
    Number.isFinite(location.lat) &&
    Number.isFinite(location.lng) &&
    Math.abs(location.lat) <= 90 &&
    Math.abs(location.lng) <= 180
  );
}
