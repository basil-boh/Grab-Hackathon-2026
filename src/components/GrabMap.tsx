import { FormEvent, useEffect, useRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import maplibregl, { type Map as MapLibreMap, type Marker } from "maplibre-gl";
import { LocateFixed, MapPin, Search } from "lucide-react";
import { Poi3DMarker } from "./Poi3DMarker";
import { DEFAULT_ZOOM, SG_CENTER } from "../lib/config";
import { assignPoiModels, nearbyPois, searchPois, type Poi } from "../services/poi";
import type { LocationPoint, RouteData } from "../services/route";

type Props = {
  selectedPoi: Poi | null;
  activeRoute: RouteData | null;
  userLocation: LocationPoint | null;
  onPoiTap: (poi: Poi) => void | Promise<void>;
  onLocateMe: () => void | Promise<void>;
  isLocating: boolean;
};

type GrabMapsConstructor = new (options: Record<string, unknown>) => {
  getMap?: () => MapLibreMap;
  onReady?: (callback: () => void) => void;
  destroy?: () => void;
};

const ROUTE_SOURCE_ID = "selected-route-source";
const ROUTE_CASING_LAYER_ID = "selected-route-casing-layer";
const ROUTE_LAYER_ID = "selected-route-layer";
const BUILDING_3D_LAYER_ID = "grab-3d-buildings";
const MAP_3D_PITCH = 58;
const MAP_3D_BEARING = -24;

type PoiMarker = {
  marker: Marker;
  root: Root;
  render: (zoom: number) => void;
};

export function GrabMap({ selectedPoi, activeRoute, userLocation, onPoiTap, onLocateMe, isLocating }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const grabRef = useRef<{ destroy?: () => void } | null>(null);
  const markersRef = useRef<PoiMarker[]>([]);
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
      removePoiMarkers(markersRef.current);
      markersRef.current = [];
      userLocationMarkerRef.current?.remove();
      userLocationMarkerRef.current = null;
      grabRef.current?.destroy?.();
      setMapReady(false);
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setIsSearching(true);

    nearbyPois()
      .then((items) => {
        if (!cancelled) setPois(items);
      })
      .catch((err) => {
        if (!cancelled) setSearchError(err instanceof Error ? err.message : "Nearby search failed");
      })
      .finally(() => {
        if (!cancelled) setIsSearching(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    removePoiMarkers(markersRef.current);
    markersRef.current = pois.filter(isValidPoiLocation).map((poi) => {
      const markerEl = document.createElement("div");
      markerEl.className = "poi-3d-marker-shell";
      const root = createRoot(markerEl);
      const render = (zoom: number) => {
        root.render(
          <Poi3DMarker
            poi={poi}
            isSelected={selectedPoi?.id === poi.id}
            zoom={zoom}
            onSelect={(selected) => void onPoiTap(selected)}
          />,
        );
      };
      render(map.getZoom());

      const marker = new maplibregl.Marker({ element: markerEl, anchor: "bottom", offset: [0, 0] })
        .setLngLat([poi.lng, poi.lat])
        .addTo(map);

      return { marker, root, render };
    });
  }, [mapReady, onPoiTap, pois, selectedPoi?.id]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    const updateMarkerScale = () => {
      markersRef.current.forEach((poiMarker) => poiMarker.render(map.getZoom()));
    };

    map.on("zoomend", updateMarkerScale);
    return () => {
      map.off("zoomend", updateMarkerScale);
    };
  }, [mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !selectedPoi) return;
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
  }, [mapReady, selectedPoi]);

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

      searchPois(keyword, controller.signal, { includeModels: false })
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

    setIsSearching(true);
    setSearchError(null);

    try {
      const items = await searchPois(keyword);
      setPois(items);
      setSuggestions(items);
      setIsAutocompleteOpen(false);
      if (items[0]) {
        const validItems = items.filter(isValidPoiLocation);
        if (!validItems.length) return;

        const bounds = getCoordinateBounds(validItems.map((poi) => [poi.lng, poi.lat]));
        if (bounds) mapRef.current?.fitBounds(bounds, { padding: 88, duration: 700, maxZoom: 15 });
      }
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setIsSearching(false);
    }
  }

  async function choosePoi(poi: Poi) {
    try {
      setSearchError(null);
      const [modelledPoi] = poi.modelPath ? [poi] : await assignPoiModels([poi]);
      if (!modelledPoi) throw new Error("Model classification returned no POI");

      suppressAutocompleteRef.current = true;
      setQuery(modelledPoi.name);
      setPois((current) => {
        if (current.some((item) => item.id === modelledPoi.id)) {
          return current.map((item) => (item.id === modelledPoi.id ? { ...item, ...modelledPoi } : item));
        }
        return [modelledPoi, ...current];
      });
      setSuggestions([]);
      setIsAutocompleteOpen(false);
      void onPoiTap(modelledPoi);
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : "Model classification failed");
    }
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
              onChange={(event) => setQuery(event.target.value)}
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
        </form>

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
                    onClick={() => void choosePoi(poi)}
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

      <div className="absolute bottom-6 left-6 z-10 w-[360px] overflow-hidden rounded-lg border border-slate-200 bg-white shadow-panel">
        <div className="border-b border-slate-200 px-4 py-3">
          <p className="text-sm font-semibold text-slate-900">{isSearching ? "Searching..." : "Places"}</p>
          {searchError ? <p className="mt-1 text-xs text-red-700">{searchError}</p> : null}
        </div>
        <div className="max-h-[260px] overflow-y-auto">
          {pois.map((poi) => (
            <button
              type="button"
              key={poi.id}
              onClick={() => void choosePoi(poi)}
              className={`block w-full border-b border-slate-100 px-4 py-3 text-left transition last:border-b-0 hover:bg-slate-50 ${
                selectedPoi?.id === poi.id ? "bg-teal-50" : "bg-white"
              }`}
            >
              <span className="block truncate text-sm font-semibold text-slate-900">{poi.name}</span>
              <span className="mt-1 block truncate text-xs text-slate-500">{poi.address || poi.category || "Singapore"}</span>
            </button>
          ))}
          {!pois.length && !isSearching ? <p className="px-4 py-6 text-sm text-slate-500">No places returned.</p> : null}
        </div>
      </div>

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

function removePoiMarkers(markers: PoiMarker[]) {
  markers.forEach(({ marker, root }) => {
    marker.remove();
    window.setTimeout(() => root.unmount(), 0);
  });
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

function isValidLocation(location: LocationPoint) {
  return (
    Number.isFinite(location.lat) &&
    Number.isFinite(location.lng) &&
    Math.abs(location.lat) <= 90 &&
    Math.abs(location.lng) <= 180
  );
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
