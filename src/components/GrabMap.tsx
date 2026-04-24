import { FormEvent, useEffect, useRef, useState } from "react";
import maplibregl, { type Map as MapLibreMap, type Marker } from "maplibre-gl";
import { LocateFixed, Search } from "lucide-react";
import { DEFAULT_ZOOM, SG_CENTER } from "../lib/config";
import { nearbyPois, searchPois, type Poi } from "../services/poi";
import type { RouteData } from "../services/route";

type Props = {
  selectedPoi: Poi | null;
  activeRoute: RouteData | null;
  onPoiTap: (poi: Poi) => void;
};

type GrabMapsConstructor = new (options: Record<string, unknown>) => {
  getMap?: () => MapLibreMap;
  onReady?: (callback: () => void) => void;
  destroy?: () => void;
};

const ROUTE_SOURCE_ID = "selected-route-source";
const ROUTE_LAYER_ID = "selected-route-layer";

export function GrabMap({ selectedPoi, activeRoute, onPoiTap }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const grabRef = useRef<{ destroy?: () => void } | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const [mapReady, setMapReady] = useState(false);
  const [query, setQuery] = useState("");
  const [pois, setPois] = useState<Poi[]>([]);
  const [isSearching, setIsSearching] = useState(false);
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
          navigation: true,
          attribution: true,
          showSearchBar: false,
          showLayersMenu: false,
          showWaypointsModal: false,
        });

        grabRef.current = grab;

        const setMap = () => {
          const map = grab.getMap?.();
          if (map) {
            mapRef.current = map;
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

    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = pois.map((poi) => {
      const markerEl = document.createElement("button");
      markerEl.type = "button";
      markerEl.className = `poi-marker ${selectedPoi?.id === poi.id ? "is-selected" : ""}`;
      markerEl.title = poi.name;
      markerEl.addEventListener("click", () => onPoiTap(poi));

      return new maplibregl.Marker({ element: markerEl, anchor: "center" })
        .setLngLat([poi.lng, poi.lat])
        .addTo(map);
    });
  }, [mapReady, onPoiTap, pois, selectedPoi?.id]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !selectedPoi) return;

    map.flyTo({
      center: [selectedPoi.lng, selectedPoi.lat],
      zoom: Math.max(map.getZoom(), 14),
      essential: true,
    });
  }, [mapReady, selectedPoi]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    if (!map.isStyleLoaded()) {
      map.once("load", () => {
        if (activeRoute?.geometry?.coordinates?.length) {
          drawRoute(map, activeRoute);
        }
      });
      return;
    }

    if (!activeRoute?.geometry?.coordinates?.length) {
      if (map.getLayer(ROUTE_LAYER_ID)) map.removeLayer(ROUTE_LAYER_ID);
      if (map.getSource(ROUTE_SOURCE_ID)) map.removeSource(ROUTE_SOURCE_ID);
      return;
    }

    drawRoute(map, activeRoute);
  }, [activeRoute, mapReady]);

  async function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const keyword = query.trim();
    if (!keyword) return;

    setIsSearching(true);
    setSearchError(null);

    try {
      const items = await searchPois(keyword);
      setPois(items);
      if (items[0]) {
        const bounds = items.reduce(
          (nextBounds, poi) => nextBounds.extend([poi.lng, poi.lat]),
          new maplibregl.LngLatBounds([items[0].lng, items[0].lat], [items[0].lng, items[0].lat]),
        );
        mapRef.current?.fitBounds(bounds, { padding: 88, duration: 700, maxZoom: 15 });
      }
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setIsSearching(false);
    }
  }

  return (
    <div className="relative min-w-0 flex-1 overflow-hidden bg-slate-200">
      <div ref={containerRef} className="h-full w-full" />

      <form onSubmit={handleSearch} className="absolute left-6 top-6 z-10 flex w-[430px] gap-2 rounded-lg bg-white p-2 shadow-panel">
        <div className="flex min-w-0 flex-1 items-center gap-2 rounded-md border border-slate-200 px-3">
          <Search className="h-4 w-4 shrink-0 text-slate-400" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="h-10 min-w-0 flex-1 bg-transparent text-sm text-slate-900 outline-none"
            placeholder="Marina Bay Sands, ramen, school..."
          />
        </div>
        <button
          type="submit"
          disabled={isSearching || !query.trim()}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-teal-700 text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-slate-300"
          aria-label="Search"
          title="Search"
        >
          <LocateFixed className={`h-4 w-4 ${isSearching ? "animate-pulse" : ""}`} />
        </button>
      </form>

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
              onClick={() => onPoiTap(poi)}
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
  if (!activeRoute.geometry?.coordinates?.length) return;

  const routeGeoJson = {
    type: "Feature",
    properties: {},
    geometry: activeRoute.geometry,
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
      id: ROUTE_LAYER_ID,
      type: "line",
      source: ROUTE_SOURCE_ID,
      layout: {
        "line-cap": "round",
        "line-join": "round",
      },
      paint: {
        "line-color": "#007b7a",
        "line-width": 6,
        "line-opacity": 0.9,
      },
    });
  }

  const bounds = activeRoute.geometry.coordinates.reduce(
    (nextBounds, coord) => nextBounds.extend(coord),
    new maplibregl.LngLatBounds(activeRoute.geometry.coordinates[0], activeRoute.geometry.coordinates[0]),
  );
  map.fitBounds(bounds, { padding: 80, duration: 800 });
}
