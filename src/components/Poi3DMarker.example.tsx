import { Poi3DMarker } from "./Poi3DMarker";
import type { Poi } from "../services/poi";

const mockPois: Poi[] = [
  {
    id: "mock-italian",
    name: "Mario's Pasta House",
    category: "italian",
    rating: 4.2,
    lat: 1.2834,
    lng: 103.8607,
  },
  {
    id: "mock-cafe",
    name: "Tanjong Coffee Bar",
    category: "cafe",
    rating: 4.7,
    lat: 1.2761,
    lng: 103.8458,
  },
  {
    id: "mock-fast-food",
    name: "Burger Express",
    category: "fast_food",
    rating: 2.6,
    lat: 1.3048,
    lng: 103.8318,
  },
];

export function Poi3DMarkerExample() {
  return (
    <div className="flex gap-4">
      {mockPois.map((poi) => (
        <div key={poi.id} className="h-28 w-24">
          <Poi3DMarker poi={poi} isSelected={false} zoom={14} onSelect={(selectedPoi) => console.log(selectedPoi)} />
        </div>
      ))}
    </div>
  );
}
