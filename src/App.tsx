import { useRef, useState } from "react";
import { DuelArena } from "./components/DuelArena";
import { DuelCard } from "./components/DuelCard";
import { GrabMap } from "./components/GrabMap";
import { MapErrorBoundary } from "./components/MapErrorBoundary";
import { PersonalityCard } from "./components/PersonalityCard";
import { RouteBanner } from "./components/RouteBanner";
import { usePersonality } from "./hooks/usePersonality";
import { fetchPersonalityDuel, type DuelSide, type PersonalityDuel } from "./services/personality";
import { searchPois, type Poi } from "./services/poi";
import { fetchRoute, type LocationPoint } from "./services/route";
import { useMapStore } from "./store/mapStore";

const MAX_DUEL_DISTANCE_METERS = 500;

export default function App() {
  const selectedPoi = useMapStore((state) => state.selectedPoi);
  const selectPoi = useMapStore((state) => state.selectPoi);
  const setPersonality = useMapStore((state) => state.setPersonality);
  const activeRoute = useMapStore((state) => state.activeRoute);
  const setRoute = useMapStore((state) => state.setRoute);
  const { personality, isLoading, error } = usePersonality(selectedPoi);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [userLocation, setUserLocation] = useState<LocationPoint | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [duelMode, setDuelMode] = useState(false);
  const [duelPois, setDuelPois] = useState<Poi[]>([]);
  const [duel, setDuel] = useState<PersonalityDuel | null>(null);
  const [duelLoading, setDuelLoading] = useState(false);
  const [duelError, setDuelError] = useState<string | null>(null);
  const routeRequestId = useRef(0);
  const duelRequestId = useRef(0);

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
    if (duelMode) {
      await handleDuelPoiSelect(poi);
      return;
    }

    await routeToPoi(poi);
  }

  async function routeToPoi(poi: Poi) {
    const requestId = routeRequestId.current + 1;
    routeRequestId.current = requestId;
    selectPoi(poi);
    setRoute(null);

    setRouteLoading(true);
    setRouteError(null);

    try {
      const route = await routeFromCurrentLocation(poi);
      if (routeRequestId.current !== requestId) return false;
      setRoute(route);
      return true;
    } catch (err) {
      if (routeRequestId.current !== requestId) return false;
      setRoute(null);
      setRouteError(formatRouteError(err));
      return false;
    } finally {
      if (routeRequestId.current === requestId) {
        setRouteLoading(false);
      }
    }
  }

  async function handleDuelPoiSelect(poi: Poi) {
    routeRequestId.current += 1;
    setRoute(null);
    setRouteLoading(false);
    setRouteError(null);

    const firstPoi = duelPois[0];
    if (!firstPoi || duelPois.length >= 2) {
      duelRequestId.current += 1;
      setDuelPois([poi]);
      setDuel(null);
      setDuelError(null);
      setDuelLoading(false);
      return;
    }

    if (firstPoi.id === poi.id) return;

    const distanceMeters = distanceBetweenMeters(firstPoi, poi);
    if (distanceMeters > MAX_DUEL_DISTANCE_METERS) {
      setDuel(null);
      setDuelError(`${poi.name} is ${formatDistance(distanceMeters)} from ${firstPoi.name}. Choose a 500m rival from the list.`);
      return;
    }

    const pair: [Poi, Poi] = [firstPoi, poi];
    setDuelPois(pair);
    await requestDuel(pair);
  }

  async function requestDuel(pair: [Poi, Poi]) {
    const requestId = duelRequestId.current + 1;
    duelRequestId.current = requestId;
    setDuel(null);
    setDuelLoading(true);
    setDuelError(null);

    try {
      const nextDuel = await fetchPersonalityDuel({ places: pair });
      if (duelRequestId.current !== requestId) return;
      setPersonality(nextDuel.places.a.place.id, nextDuel.places.a.personality);
      setPersonality(nextDuel.places.b.place.id, nextDuel.places.b.personality);
      setDuel(nextDuel);
    } catch (err) {
      if (duelRequestId.current !== requestId) return;
      setDuelError(err instanceof Error ? err.message : "Duel request failed");
    } finally {
      if (duelRequestId.current === requestId) {
        setDuelLoading(false);
      }
    }
  }

  function handleDuelModeChange(enabled: boolean) {
    setDuelMode(enabled);
    duelRequestId.current += 1;

    if (enabled) {
      routeRequestId.current += 1;
      setRoute(null);
      setRouteLoading(false);
      setRouteError(null);
    }

    setDuelPois([]);
    setDuel(null);
    setDuelError(null);
    setDuelLoading(false);
  }

  function handleResetDuel() {
    duelRequestId.current += 1;
    setDuelPois([]);
    setDuel(null);
    setDuelError(null);
    setDuelLoading(false);
  }

  async function handleRouteToDuelPlace(side: DuelSide) {
    const choice = duel?.places[side];
    if (!choice) return;

    duelRequestId.current += 1;
    const routed = await routeToPoi(choice.place);

    if (routed) {
      setDuelMode(false);
      setDuelPois([]);
      setDuel(null);
      setDuelError(null);
      setDuelLoading(false);
    }
  }

  function handleDiscardDuelFighter(index: number) {
    duelRequestId.current += 1;
    setDuel(null);
    setDuelError(null);
    setDuelLoading(false);
    setDuelPois((current) => current.filter((_, currentIndex) => currentIndex !== index));
  }

  async function handleRandomNearbyRestaurantDuel() {
    routeRequestId.current += 1;
    setRoute(null);
    setRouteLoading(false);
    setRouteError(null);
    setDuelMode(true);
    setDuelPois([]);
    setDuel(null);
    setDuelError(null);
    setDuelLoading(true);

    try {
      const location = await getCurrentLocation();
      const restaurants = await searchPois("restaurant food", undefined, { location, limit: 20 });
      const nearbyRestaurants = restaurants
        .filter((poi) => distanceBetweenMeters(location, poi) <= 2000)
        .sort((a, b) => distanceBetweenMeters(location, a) - distanceBetweenMeters(location, b));
      const pair = pickRandomDuelPair(nearbyRestaurants);
      if (!pair) {
        throw new Error("Could not find two nearby restaurants within 500m. Try Food near a mall or denser area.");
      }

      setDuelPois(pair);
      await requestDuel(pair);
    } catch (err) {
      setDuelError(err instanceof Error ? formatLocationError(err) : "Random restaurant duel failed");
    } finally {
      setDuelLoading(false);
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
            duelMode={duelMode}
            duelPois={duelPois}
            onDuelModeChange={handleDuelModeChange}
          />
        </MapErrorBoundary>
        <DuelArena active={duelMode} selectedPois={duelPois} duel={duel} isLoading={duelLoading} />
        <RouteBanner route={activeRoute} isLoading={routeLoading} error={routeError} onCancel={handleCancelRoute} />
      </div>
      {duelMode ? (
        <DuelCard
          selectedPois={duelPois}
          duel={duel}
          isLoading={duelLoading}
          routeLoading={routeLoading}
          error={duelError}
          onReset={handleResetDuel}
          onExit={() => handleDuelModeChange(false)}
          onDiscardFighter={handleDiscardDuelFighter}
          onRouteToPlace={handleRouteToDuelPlace}
          onRandomNearbyDuel={handleRandomNearbyRestaurantDuel}
        />
      ) : (
        <PersonalityCard
          poi={selectedPoi}
          personality={personality}
          isLoading={isLoading}
          error={error}
          onDirections={handleDirections}
          routeLoading={routeLoading}
        />
      )}
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

function distanceBetweenMeters(a: LocationPoint, b: LocationPoint) {
  const earthRadiusMeters = 6371008.8;
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const deltaLat = toRadians(b.lat - a.lat);
  const deltaLng = toRadians(b.lng - a.lng);
  const haversine =
    Math.sin(deltaLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2;

  return 2 * earthRadiusMeters * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

function toRadians(degrees: number) {
  return (degrees * Math.PI) / 180;
}

function formatDistance(distanceMeters: number) {
  if (distanceMeters >= 1000) return `${(distanceMeters / 1000).toFixed(1)} km`;
  return `${Math.max(1, Math.round(distanceMeters))} m`;
}

function pickRandomDuelPair(items: Poi[]): [Poi, Poi] | null {
  const validItems = items.filter((poi, index, all) => {
    if (!isValidLocation(poi)) return false;
    return all.findIndex((candidate) => candidate.id === poi.id) === index;
  });

  const validPairs: [Poi, Poi][] = [];
  for (let i = 0; i < validItems.length; i += 1) {
    for (let j = i + 1; j < validItems.length; j += 1) {
      if (distanceBetweenMeters(validItems[i], validItems[j]) <= MAX_DUEL_DISTANCE_METERS) {
        validPairs.push([validItems[i], validItems[j]]);
      }
    }
  }

  if (!validPairs.length) return null;
  return validPairs[Math.floor(Math.random() * validPairs.length)];
}
