import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import maplibregl, { type Map as MapLibreMap, type Marker } from "maplibre-gl";
import { Building2, Coffee, Dumbbell, LocateFixed, MapPin, Search, ShoppingBag, Swords, Trophy, Utensils, X } from "lucide-react";
import { DEFAULT_ZOOM, SG_CENTER } from "../lib/config";
import { searchPois, type Poi } from "../services/poi";
import type { LocationPoint, RouteData } from "../services/route";

type Props = {
  selectedPoi: Poi | null;
  activeRoute: RouteData | null;
  userLocation: LocationPoint | null;
  onPoiTap: (poi: Poi) => void | Promise<void>;
  onLocateMe: () => void | Promise<void>;
  isLocating: boolean;
  duelMode: boolean;
  duelPois: Poi[];
  onDuelModeChange: (enabled: boolean) => void;
};

type GrabMapsConstructor = new (options: Record<string, unknown>) => {
  getMap?: () => MapLibreMap;
  onReady?: (callback: () => void) => void;
  destroy?: () => void;
};

type DiscoveryAnchor = {
  name: string;
  lat: number;
  lng: number;
};

const ROUTE_SOURCE_ID = "selected-route-source";
const ROUTE_CASING_LAYER_ID = "selected-route-casing-layer";
const ROUTE_LAYER_ID = "selected-route-layer";
const BUILDING_3D_LAYER_ID = "grab-3d-buildings";
const DISCOVERY_RADIUS_SOURCE_ID = "discovery-radius-source";
const DISCOVERY_RADIUS_FILL_LAYER_ID = "discovery-radius-fill-layer";
const DISCOVERY_RADIUS_LINE_LAYER_ID = "discovery-radius-line-layer";
const MAP_3D_PITCH = 58;
const MAP_3D_BEARING = -24;
const MAX_DUEL_DISTANCE_METERS = 500;
const DISCOVERY_RADIUS_KM = 2;
const DISCOVERY_RADIUS_METERS = DISCOVERY_RADIUS_KM * 1000;
const PLACE_CATEGORY_OPTIONS = [
  { label: "Food", keyword: "restaurant food", icon: Utensils },
  { label: "Coffee", keyword: "coffee cafe", icon: Coffee },
  { label: "Gyms", keyword: "gym fitness", icon: Dumbbell },
  { label: "Sports", keyword: "sports hall facilities", icon: Trophy },
  { label: "Malls", keyword: "shopping mall", icon: ShoppingBag },
  { label: "Hotels", keyword: "hotel", icon: Building2 },
] as const;

export function GrabMap({
  selectedPoi,
  activeRoute,
  userLocation,
  onPoiTap,
  onLocateMe,
  isLocating,
  duelMode,
  duelPois,
  onDuelModeChange,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const grabRef = useRef<{ destroy?: () => void } | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const userLocationMarkerRef = useRef<Marker | null>(null);
  const suppressAutocompleteRef = useRef(false);
  const [mapReady, setMapReady] = useState(false);
  const [query, setQuery] = useState("");
  const [pois, setPois] = useState<Poi[]>([]);
  const [suggestions, setSuggestions] = useState<Poi[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [isAutocompleteOpen, setIsAutocompleteOpen] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [anchor, setAnchor] = useState<DiscoveryAnchor | null>(null);
  const duelAnchor = duelMode ? duelPois[0] : undefined;
  const categoryCenter = anchor ?? (userLocation ? { ...userLocation, name: "Current location" } : null) ?? (selectedPoi ? toAnchor(selectedPoi) : null);
  const distanceCenter = duelAnchor ?? (activeCategory ? categoryCenter : null);
  const shouldShowPoiList = duelMode || isSearching || Boolean(searchError) || pois.length > 0;
  const listedPois = useMemo(() => {
    if (!distanceCenter) {
      return pois.map((poi) => ({
        poi,
        distanceMeters: undefined,
        isWithinDuelRange: true,
        isDuelAnchor: false,
      }));
    }

    const rows = pois
      .map((poi) => {
        const distanceMeters = poi.id === duelAnchor?.id ? 0 : distanceBetweenMeters(distanceCenter, poi);
        return {
          poi,
          distanceMeters,
          isWithinDuelRange: duelAnchor ? distanceMeters <= MAX_DUEL_DISTANCE_METERS : true,
          isDuelAnchor: duelAnchor ? poi.id === duelAnchor.id : false,
        };
      });

    return rows.sort((a, b) => {
      if (duelAnchor) {
        if (a.isDuelAnchor !== b.isDuelAnchor) return a.isDuelAnchor ? -1 : 1;
        if (a.isWithinDuelRange !== b.isWithinDuelRange) return a.isWithinDuelRange ? -1 : 1;
      }

      return (a.distanceMeters ?? Number.POSITIVE_INFINITY) - (b.distanceMeters ?? Number.POSITIVE_INFINITY);
    });
  }, [distanceCenter, duelAnchor, pois]);

  useEffect(() => {
    let cancelled = false;

    async function bootMap() {
      if (!containerRef.current) return;

      try {
        const [style, grabModule] = await Promise.all([
          fetch("/api/map/style").then(async (response) => {
            const payload = await response.json();
            if (!response.ok || "error" in payload) {
              throw new Error(payload.error || "Map style failed");
            }
            return payload;
          }),
          import("grab-maps"),
        ]);

        if (cancelled || !containerRef.current) return;

        const grabExports = grabModule as unknown as {
          GrabMapsLib?: GrabMapsConstructor;
          default?: GrabMapsConstructor;
        };
        const GrabMapsLib = grabExports.GrabMapsLib ?? grabExports.default;

        if (!GrabMapsLib) {
          throw new Error("GrabMapsLib export was not found");
        }

        const grab = new GrabMapsLib({
          container: containerRef.current,
          baseUrl: window.location.origin,
          apiKey: "browser-routes-through-bff",
          style,
          lat: SG_CENTER.lat,
          lng: SG_CENTER.lng,
          zoom: DEFAULT_ZOOM,
          pitch: MAP_3D_PITCH,
          bearing: MAP_3D_BEARING,
          maxPitch: 70,
          navigation: true,
          attribution: true,
          showSearchBar: false,
          showLayersMenu: true,
          showWaypointsModal: false,
        });

        grabRef.current = grab;

        const setMap = () => {
          const map = grab.getMap?.();
          if (map) {
            mapRef.current = map;
            enable3DMap(map);
            setMapReady(true);
            map.resize();
          }
        };

        grab.onReady?.(setMap);
        window.setTimeout(setMap, 250);
      } catch (err) {
        if (!cancelled) setMapError(err instanceof Error ? err.message : "Map failed to load");
      }
    }

    bootMap();

    return () => {
      cancelled = true;
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [];
      userLocationMarkerRef.current?.remove();
      userLocationMarkerRef.current = null;
      grabRef.current?.destroy?.();
      setMapReady(false);
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    const radiusCenter =
      anchor ?? (userLocation ? { ...userLocation, name: "Current location" } : null) ?? (activeCategory && selectedPoi ? toAnchor(selectedPoi) : null);
    if (!radiusCenter) {
      clearDiscoveryRadius(map);
      return;
    }

    try {
      drawDiscoveryRadius(map, radiusCenter);
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : "Search radius could not be drawn");
    }
  }, [activeCategory, anchor, mapReady, selectedPoi, userLocation]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    const duelPoiIds = new Set(duelPois.map((poi) => poi.id));
    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = pois.filter(isValidPoiLocation).map((poi) => {
      const markerEl = document.createElement("button");
      markerEl.type = "button";
      markerEl.className = [
        "poi-marker",
        !duelMode && selectedPoi?.id === poi.id ? "is-selected" : "",
        duelPoiIds.has(poi.id) ? "is-duel-selected" : "",
      ]
        .filter(Boolean)
        .join(" ");
      markerEl.title = poi.name;
      markerEl.addEventListener("click", () => onPoiTap(poi));

      return new maplibregl.Marker({ element: markerEl, anchor: "center" })
        .setLngLat([poi.lng, poi.lat])
        .addTo(map);
    });
  }, [duelMode, duelPois, mapReady, onPoiTap, pois, selectedPoi?.id]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !selectedPoi) return;
    if (duelMode) return;
    if (activeRoute?.geometry?.coordinates?.length) return;
    if (!isValidPoiLocation(selectedPoi)) return;

    try {
      map.flyTo({
        center: [selectedPoi.lng, selectedPoi.lat],
        zoom: Math.max(map.getZoom(), 14),
        pitch: MAP_3D_PITCH,
        bearing: MAP_3D_BEARING,
        essential: true,
      });
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : "Selected place could not be centered");
    }
  }, [activeRoute, duelMode, mapReady, selectedPoi]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || duelPois.length < 2) return;

    const bounds = getCoordinateBounds(duelPois.map((poi) => [poi.lng, poi.lat]));
    if (bounds) {
      map.fitBounds(bounds, {
        padding: 120,
        duration: 700,
        maxZoom: 17,
        pitch: MAP_3D_PITCH,
        bearing: MAP_3D_BEARING,
      });
    }
  }, [duelPois, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    if (!userLocation) {
      userLocationMarkerRef.current?.remove();
      userLocationMarkerRef.current = null;
      return;
    }

    if (!isValidLocation(userLocation)) return;

    const lngLat: [number, number] = [userLocation.lng, userLocation.lat];

    try {
      if (!userLocationMarkerRef.current) {
        const markerEl = document.createElement("div");
        markerEl.className = "current-location-marker";
        markerEl.title = "Your current location";
        userLocationMarkerRef.current = new maplibregl.Marker({ element: markerEl, anchor: "center" })
          .setLngLat(lngLat)
          .addTo(map);
      } else {
        userLocationMarkerRef.current.setLngLat(lngLat);
      }

      map.flyTo({
        center: lngLat,
        zoom: Math.max(map.getZoom(), 15),
        pitch: MAP_3D_PITCH,
        bearing: MAP_3D_BEARING,
        essential: true,
      });
    } catch (err) {
      userLocationMarkerRef.current?.remove();
      userLocationMarkerRef.current = null;
      setSearchError(err instanceof Error ? err.message : "Current location could not be shown");
    }
  }, [mapReady, userLocation]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    const showRoute = (route: RouteData) => {
      try {
        drawRoute(map, route);
      } catch (err) {
        clearRoute(map);
        setSearchError(err instanceof Error ? err.message : "Route could not be drawn");
      }
    };

    if (!map.isStyleLoaded()) {
      map.once("load", () => {
        if (activeRoute?.geometry?.coordinates?.length) {
          showRoute(activeRoute);
        }
      });
      return;
    }

    if (!activeRoute?.geometry?.coordinates?.length) {
      clearRoute(map);
      return;
    }

    showRoute(activeRoute);
  }, [activeRoute, mapReady]);

  useEffect(() => {
    const keyword = query.trim();
    if (suppressAutocompleteRef.current) {
      suppressAutocompleteRef.current = false;
      return;
    }

    if (keyword.length < 2) {
      setSuggestions([]);
      setIsSuggesting(false);
      return;
    }

    const controller = new AbortController();
    const debounce = window.setTimeout(() => {
      setIsSuggesting(true);
      setSearchError(null);

      searchPois(keyword, controller.signal)
        .then((items) => {
          setSuggestions(items);
          setIsAutocompleteOpen(true);
        })
        .catch((err: unknown) => {
          if (err instanceof DOMException && err.name === "AbortError") return;
          setSuggestions([]);
          setSearchError(err instanceof Error ? err.message : "Autocomplete failed");
        })
        .finally(() => {
          setIsSuggesting(false);
        });
    }, 250);

    return () => {
      window.clearTimeout(debounce);
      controller.abort();
    };
  }, [query]);

  async function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const keyword = query.trim();
    if (!keyword) return;

    await runPlaceSearch(keyword, null, undefined);
  }

  async function runPlaceSearch(keyword: string, categoryLabel: string | null, center: DiscoveryAnchor | undefined) {
    setIsSearching(true);
    setSearchError(null);
    setActiveCategory(categoryLabel);

    try {
      const rawItems = await searchPois(keyword, undefined, center ? { location: center, limit: 30 } : undefined);
      const items =
        categoryLabel && center
          ? rawItems
              .map((poi) => ({ poi, distanceMeters: distanceBetweenMeters(center, poi) }))
              .filter((item) => item.distanceMeters <= DISCOVERY_RADIUS_METERS)
              .sort((a, b) => a.distanceMeters - b.distanceMeters)
              .map((item) => item.poi)
          : rawItems;

      setPois(items);
      setSuggestions(items);
      setIsAutocompleteOpen(false);
      if (items[0]) {
        const validItems = items.filter(isValidPoiLocation);
        if (!validItems.length) return;

        const bounds = center ? getRadiusBounds(center, DISCOVERY_RADIUS_METERS) : getCoordinateBounds(validItems.map((poi) => [poi.lng, poi.lat]));
        if (bounds) mapRef.current?.fitBounds(bounds, { padding: 96, duration: 700, maxZoom: 15 });
      } else if (center) {
        const bounds = getRadiusBounds(center, DISCOVERY_RADIUS_METERS);
        if (bounds) mapRef.current?.fitBounds(bounds, { padding: 96, duration: 700, maxZoom: 15 });
      }
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setIsSearching(false);
    }
  }

  async function chooseCategory(option: (typeof PLACE_CATEGORY_OPTIONS)[number]) {
    if (!categoryCenter) {
      setSearchError("Choose an area first, or tap current location before picking a category.");
      return;
    }

    suppressAutocompleteRef.current = true;
    setQuery(`${option.label} near ${categoryCenter.name}`);
    setSuggestions([]);
    setIsAutocompleteOpen(false);
    await runPlaceSearch(option.keyword, option.label, categoryCenter);
  }

  function chooseAnchor(poi: Poi) {
    const nextAnchor = toAnchor(poi);
    suppressAutocompleteRef.current = true;
    setAnchor(nextAnchor);
    setQuery(poi.name);
    setPois([]);
    setSuggestions([]);
    setActiveCategory(null);
    setSearchError(null);
    setIsAutocompleteOpen(false);

    if (mapRef.current && isValidPoiLocation(poi)) {
      mapRef.current.flyTo({
        center: [poi.lng, poi.lat],
        zoom: Math.max(mapRef.current.getZoom(), 15),
        pitch: MAP_3D_PITCH,
        bearing: MAP_3D_BEARING,
        essential: true,
      });
    }
  }

  function choosePoi(poi: Poi) {
    suppressAutocompleteRef.current = true;
    setQuery(poi.name);
    setPois((current) => {
      if (current.some((item) => item.id === poi.id)) return current;
      return [poi, ...current];
    });
    setSuggestions([]);
    setIsAutocompleteOpen(false);
    void onPoiTap(poi);
  }

  function chooseListedPoi(poi: Poi) {
    if (duelMode && !activeCategory && !duelAnchor) {
      chooseAnchor(poi);
      return;
    }

    choosePoi(poi);
  }

  return (
    <div className="relative min-w-0 flex-1 overflow-hidden bg-slate-200">
      <div ref={containerRef} className="h-full w-full" />

      <div className="absolute left-6 top-6 z-10 w-[430px]">
        <form onSubmit={handleSearch} className="flex gap-2 rounded-lg bg-white p-2 shadow-panel">
          <div className="flex min-w-0 flex-1 items-center gap-2 rounded-md border border-slate-200 px-3">
            <Search className="h-4 w-4 shrink-0 text-slate-400" />
            <input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setActiveCategory(null);
                setAnchor(null);
              }}
              onFocus={() => setIsAutocompleteOpen(suggestions.length > 0)}
              onBlur={() => window.setTimeout(() => setIsAutocompleteOpen(false), 140)}
              className="h-10 min-w-0 flex-1 bg-transparent text-sm text-slate-900 outline-none"
              placeholder="Marina Bay Sands, ramen, school..."
              autoComplete="off"
            />
          </div>
          <button
            type="submit"
            disabled={isSearching || !query.trim()}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-teal-700 text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-slate-300"
            aria-label="Search"
            title="Search"
          >
            <Search className={`h-4 w-4 ${isSearching ? "animate-pulse" : ""}`} />
          </button>
          <button
            type="button"
            onClick={() => void onLocateMe()}
            disabled={isLocating}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-slate-900 text-white transition hover:bg-slate-700 disabled:cursor-wait disabled:bg-slate-300"
            aria-label="Show current location"
            title="Show current location"
          >
            <LocateFixed className={`h-4 w-4 ${isLocating ? "animate-pulse" : ""}`} />
          </button>
          <button
            type="button"
            onClick={() => onDuelModeChange(!duelMode)}
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-white transition ${
              duelMode ? "bg-amber-500 hover:bg-amber-600" : "bg-slate-900 hover:bg-slate-700"
            }`}
            aria-label={duelMode ? "Exit Duel Mode" : "Start Duel Mode"}
            title={duelMode ? "Exit Duel Mode" : "Duel Mode"}
          >
            <Swords className="h-4 w-4" />
          </button>
        </form>

        <div className="mt-2 flex gap-2 overflow-x-auto rounded-lg border border-slate-200 bg-white p-2 shadow-panel">
          {PLACE_CATEGORY_OPTIONS.map((option) => {
            const Icon = option.icon;
            const isActive = activeCategory === option.label;
            return (
              <button
                type="button"
                key={option.label}
                onClick={() => void chooseCategory(option)}
                className={`flex h-9 shrink-0 items-center gap-2 rounded-md px-3 text-xs font-semibold transition ${
                  isActive ? "bg-amber-500 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {option.label}
              </button>
            );
          })}
        </div>

        {anchor ? (
          <div className="mt-2 flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-950 shadow-panel">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-amber-700">Search area</p>
              <p className="truncate text-sm font-semibold">{anchor.name}</p>
            </div>
            <button
              type="button"
              onClick={() => {
                setAnchor(null);
                setActiveCategory(null);
                setPois([]);
                setSearchError(null);
              }}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-white/80 text-amber-900 transition hover:bg-white"
              aria-label="Clear search area"
              title="Clear area"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : null}

        {isAutocompleteOpen || isSuggesting ? (
          <div className="mt-2 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-panel">
            <div className="max-h-[300px] overflow-y-auto">
              {isSuggesting ? (
                <div className="px-4 py-3 text-sm text-slate-500">Searching...</div>
              ) : suggestions.length ? (
                suggestions.map((poi) => (
                  <button
                    type="button"
                    key={poi.id}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => (duelMode ? chooseAnchor(poi) : choosePoi(poi))}
                    className="flex w-full items-start gap-3 border-b border-slate-100 px-4 py-3 text-left transition last:border-b-0 hover:bg-slate-50"
                  >
                    <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-teal-700" />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-slate-900">{poi.name}</span>
                      <span className="mt-1 block truncate text-xs text-slate-500">
                        {poi.address || poi.category || "Singapore"}
                      </span>
                    </span>
                  </button>
                ))
              ) : (
                <div className="px-4 py-3 text-sm text-slate-500">No matching places.</div>
              )}
            </div>
          </div>
        ) : null}
      </div>

      {shouldShowPoiList ? (
      <div className="absolute bottom-6 left-6 z-10 w-[360px] overflow-hidden rounded-lg border border-slate-200 bg-white shadow-panel">
        <div className="border-b border-slate-200 px-4 py-3">
          <p className="text-sm font-semibold text-slate-900">
            {duelMode && duelAnchor
              ? "Rivals by distance"
              : duelMode
                ? categoryCenter && activeCategory
                  ? "Choose Fighter A"
                  : categoryCenter
                    ? "Pick a category"
                    : "Choose an area first"
                : isSearching
                  ? "Searching..."
                  : "Places"}
          </p>
          {duelMode && duelAnchor ? (
            <p className="mt-1 truncate text-xs text-slate-500">From {duelAnchor.name}</p>
          ) : duelMode && categoryCenter ? (
            <p className="mt-1 truncate text-xs text-slate-500">
              {activeCategory ? `${activeCategory} near ${categoryCenter.name}` : `Area: ${categoryCenter.name}`}
            </p>
          ) : activeCategory && categoryCenter ? (
            <p className="mt-1 truncate text-xs text-slate-500">
              Nearest first within {DISCOVERY_RADIUS_KM} km of {categoryCenter.name}
            </p>
          ) : null}
          {searchError ? <p className="mt-1 text-xs text-red-700">{searchError}</p> : null}
        </div>
        <div className="max-h-[260px] overflow-y-auto">
          {listedPois.map(({ poi, distanceMeters, isWithinDuelRange, isDuelAnchor }) => (
            <button
              type="button"
              key={poi.id}
              onClick={() => chooseListedPoi(poi)}
              className={`block w-full border-b border-slate-100 px-4 py-3 text-left transition last:border-b-0 hover:bg-slate-50 ${
                duelPois.some((item) => item.id === poi.id)
                  ? "bg-amber-50"
                  : selectedPoi?.id === poi.id && !duelMode
                    ? "bg-teal-50"
                    : "bg-white"
              }`}
            >
              <span className="flex min-w-0 items-start justify-between gap-3">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-slate-900">{poi.name}</span>
                  <span className="mt-1 block truncate text-xs text-slate-500">
                    {poi.address || poi.category || "Singapore"}
                  </span>
                </span>
                {typeof distanceMeters === "number" ? (
                  <span
                    className={`shrink-0 rounded-md px-2 py-1 text-xs font-semibold ${
                      duelMode && isDuelAnchor
                        ? "bg-amber-500 text-white"
                        : duelMode && isWithinDuelRange
                          ? "bg-emerald-100 text-emerald-800"
                          : duelMode
                            ? "bg-slate-100 text-slate-500"
                            : "bg-teal-100 text-teal-800"
                    }`}
                  >
                    {duelMode && isDuelAnchor ? "A" : formatDistance(distanceMeters)}
                  </span>
                ) : null}
              </span>
              {duelMode && typeof distanceMeters === "number" && !isDuelAnchor ? (
                <span className={`mt-2 block text-xs ${isWithinDuelRange ? "text-emerald-700" : "text-slate-500"}`}>
                  {isWithinDuelRange ? "Inside 500m duel range" : "Too far for this duel"}
                </span>
              ) : null}
            </button>
          ))}
          {!listedPois.length && !isSearching ? (
            <p className="px-4 py-6 text-sm text-slate-500">
              {duelMode && !categoryCenter
                ? "Search an area or tap current location, then choose a category."
                : duelMode && !activeCategory
                  ? "Choose Food, Gyms, Sports, Malls, or another category."
                  : activeCategory && categoryCenter
                    ? `No ${activeCategory.toLowerCase()} places found within ${DISCOVERY_RADIUS_KM} km.`
                  : "No places returned."}
            </p>
          ) : null}
        </div>
      </div>
      ) : null}

      {mapError ? (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-slate-950/70">
          <div className="max-w-md rounded-lg bg-white p-5 text-slate-900 shadow-panel">
            <p className="font-semibold">Map failed</p>
            <p className="mt-2 text-sm leading-6 text-slate-600">{mapError}</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function drawRoute(map: MapLibreMap, activeRoute: RouteData) {
  const coordinates = sanitizeRouteCoordinates(activeRoute.geometry?.coordinates);
  if (coordinates.length < 2) {
    clearRoute(map);
    return;
  }

  const routeGeoJson = {
    type: "Feature",
    properties: {},
    geometry: {
      type: "LineString" as const,
      coordinates,
    },
  };

  if (map.getSource(ROUTE_SOURCE_ID)) {
    const source = map.getSource(ROUTE_SOURCE_ID) as maplibregl.GeoJSONSource;
    source.setData(routeGeoJson as GeoJSON.Feature<GeoJSON.LineString>);
  } else {
    map.addSource(ROUTE_SOURCE_ID, {
      type: "geojson",
      data: routeGeoJson as GeoJSON.Feature<GeoJSON.LineString>,
    });
    map.addLayer({
      id: ROUTE_CASING_LAYER_ID,
      type: "line",
      source: ROUTE_SOURCE_ID,
      layout: {
        "line-cap": "round",
        "line-join": "round",
      },
      paint: {
        "line-color": "#ffffff",
        "line-width": 12,
        "line-opacity": 0.95,
      },
    });
    map.addLayer({
      id: ROUTE_LAYER_ID,
      type: "line",
      source: ROUTE_SOURCE_ID,
      layout: {
        "line-cap": "round",
        "line-join": "round",
      },
      paint: {
        "line-color": "#00a6a6",
        "line-width": 7,
        "line-opacity": 1,
      },
    });
  }

  const bounds = getCoordinateBounds(coordinates);
  if (bounds) {
    map.fitBounds(bounds, {
      padding: 80,
      duration: 800,
      pitch: MAP_3D_PITCH,
      bearing: MAP_3D_BEARING,
    });
  }
}

function drawDiscoveryRadius(map: MapLibreMap, center: LocationPoint) {
  const radiusFeature = circleFeature(center, DISCOVERY_RADIUS_METERS);

  const draw = () => {
    const existingSource = map.getSource(DISCOVERY_RADIUS_SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
    if (existingSource) {
      existingSource.setData(radiusFeature);
    } else {
      map.addSource(DISCOVERY_RADIUS_SOURCE_ID, {
        type: "geojson",
        data: radiusFeature,
      });
    }

    if (!map.getLayer(DISCOVERY_RADIUS_FILL_LAYER_ID)) {
      const firstSymbolLayerId = map.getStyle().layers?.find((layer) => layer.type === "symbol")?.id;
      map.addLayer(
        {
          id: DISCOVERY_RADIUS_FILL_LAYER_ID,
          type: "fill",
          source: DISCOVERY_RADIUS_SOURCE_ID,
          paint: {
            "fill-color": "#0d9488",
            "fill-opacity": 0.12,
          },
        },
        firstSymbolLayerId,
      );
    }

    if (!map.getLayer(DISCOVERY_RADIUS_LINE_LAYER_ID)) {
      const firstSymbolLayerId = map.getStyle().layers?.find((layer) => layer.type === "symbol")?.id;
      map.addLayer(
        {
          id: DISCOVERY_RADIUS_LINE_LAYER_ID,
          type: "line",
          source: DISCOVERY_RADIUS_SOURCE_ID,
          paint: {
            "line-color": "#0f766e",
            "line-dasharray": [2, 2],
            "line-opacity": 0.8,
            "line-width": 2,
          },
        },
        firstSymbolLayerId,
      );
    }
  };

  if (map.isStyleLoaded()) {
    draw();
  } else {
    map.once("load", draw);
  }
}

function clearDiscoveryRadius(map: MapLibreMap) {
  if (map.getLayer(DISCOVERY_RADIUS_LINE_LAYER_ID)) map.removeLayer(DISCOVERY_RADIUS_LINE_LAYER_ID);
  if (map.getLayer(DISCOVERY_RADIUS_FILL_LAYER_ID)) map.removeLayer(DISCOVERY_RADIUS_FILL_LAYER_ID);
  if (map.getSource(DISCOVERY_RADIUS_SOURCE_ID)) map.removeSource(DISCOVERY_RADIUS_SOURCE_ID);
}

function enable3DMap(map: MapLibreMap) {
  map.setPitch(MAP_3D_PITCH);
  map.setBearing(MAP_3D_BEARING);

  const addBuildings = () => add3DBuildings(map);
  if (map.isStyleLoaded()) {
    addBuildings();
  } else {
    map.once("load", addBuildings);
  }
}

function add3DBuildings(map: MapLibreMap) {
  if (map.getLayer(BUILDING_3D_LAYER_ID) || !map.getSource("grabmaptiles")) return;

  const firstSymbolLayerId = map.getStyle().layers?.find((layer) => layer.type === "symbol")?.id;
  map.addLayer(
    {
      id: BUILDING_3D_LAYER_ID,
      type: "fill-extrusion",
      source: "grabmaptiles",
      "source-layer": "building",
      minzoom: 13,
      paint: {
        "fill-extrusion-color": "#d7dce0",
        "fill-extrusion-height": [
          "interpolate",
          ["linear"],
          ["zoom"],
          13,
          0,
          15,
          ["to-number", ["get", "render_height"], ["get", "height"], 28],
        ],
        "fill-extrusion-base": ["to-number", ["get", "render_min_height"], ["get", "min_height"], 0],
        "fill-extrusion-opacity": 0.72,
      },
    },
    firstSymbolLayerId,
  );
}

function clearRoute(map: MapLibreMap) {
  if (map.getLayer(ROUTE_LAYER_ID)) map.removeLayer(ROUTE_LAYER_ID);
  if (map.getLayer(ROUTE_CASING_LAYER_ID)) map.removeLayer(ROUTE_CASING_LAYER_ID);
  if (map.getSource(ROUTE_SOURCE_ID)) map.removeSource(ROUTE_SOURCE_ID);
}

function sanitizeRouteCoordinates(coordinates: NonNullable<RouteData["geometry"]>["coordinates"] | undefined) {
  if (!Array.isArray(coordinates)) return [];
  return coordinates.map(toLngLat).filter((coordinate): coordinate is [number, number] => Boolean(coordinate));
}

function isValidPoiLocation(poi: Poi) {
  return isValidLocation({ lat: poi.lat, lng: poi.lng });
}

function toAnchor(poi: Poi): DiscoveryAnchor {
  return {
    name: poi.name,
    lat: poi.lat,
    lng: poi.lng,
  };
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

function getRadiusBounds(center: LocationPoint, radiusMeters: number): [[number, number], [number, number]] {
  const latDelta = radiusMeters / 111_320;
  const lngDelta = radiusMeters / (111_320 * Math.cos(toRadians(center.lat)));
  return [
    [center.lng - lngDelta, center.lat - latDelta],
    [center.lng + lngDelta, center.lat + latDelta],
  ];
}

function circleFeature(center: LocationPoint, radiusMeters: number): GeoJSON.Feature<GeoJSON.Polygon> {
  const coordinates: [number, number][] = [];
  const steps = 72;
  const angularDistance = radiusMeters / 6371008.8;
  const lat1 = toRadians(center.lat);
  const lng1 = toRadians(center.lng);

  for (let step = 0; step <= steps; step += 1) {
    const bearing = (2 * Math.PI * step) / steps;
    const lat2 = Math.asin(
      Math.sin(lat1) * Math.cos(angularDistance) +
        Math.cos(lat1) * Math.sin(angularDistance) * Math.cos(bearing),
    );
    const lng2 =
      lng1 +
      Math.atan2(
        Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(lat1),
        Math.cos(angularDistance) - Math.sin(lat1) * Math.sin(lat2),
      );

    coordinates.push([toDegrees(lng2), toDegrees(lat2)]);
  }

  return {
    type: "Feature",
    properties: {},
    geometry: {
      type: "Polygon",
      coordinates: [coordinates],
    },
  };
}

function toDegrees(radians: number) {
  return (radians * 180) / Math.PI;
}

function toLngLat(coordinate: unknown): [number, number] | null {
  let lng: number;
  let lat: number;

  if (Array.isArray(coordinate)) {
    lng = Number(coordinate[0]);
    lat = Number(coordinate[1]);
  } else if (typeof coordinate === "object" && coordinate !== null) {
    const point = coordinate as Record<string, unknown>;
    lng = Number(point.lng ?? point.lon ?? point.longitude);
    lat = Number(point.lat ?? point.latitude);
  } else {
    return null;
  }

  if (!Number.isFinite(lng) || !Number.isFinite(lat) || Math.abs(lng) > 180 || Math.abs(lat) > 90) {
    return null;
  }

  return [lng, lat];
}

function getCoordinateBounds(rawCoordinates: unknown[]): [[number, number], [number, number]] | null {
  const coordinates = rawCoordinates.map(toLngLat).filter((coordinate): coordinate is [number, number] => Boolean(coordinate));
  if (!coordinates.length) return null;

  let west = coordinates[0][0];
  let east = coordinates[0][0];
  let south = coordinates[0][1];
  let north = coordinates[0][1];

  for (const [lng, lat] of coordinates) {
    west = Math.min(west, lng);
    east = Math.max(east, lng);
    south = Math.min(south, lat);
    north = Math.max(north, lat);
  }

  if (west === east) {
    west -= 0.0005;
    east += 0.0005;
  }

  if (south === north) {
    south -= 0.0005;
    north += 0.0005;
  }

  if (![west, east, south, north].every(Number.isFinite)) return null;
  return [
    [west, south],
    [east, north],
  ];
}
