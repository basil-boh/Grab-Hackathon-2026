export const POI_MODEL_PATHS = {
  chef: "/models/chef.glb",
  barista: "/models/barista.glb",
  mascot: "/models/mascot.glb",
  angry: "/models/angry.glb",
  angel: "/models/angel.glb",
  japaneseChef: "/models/japanese-chef.glb",
  koreanChef: "/models/korean-chef.glb",
  mallGuard: "/models/mall-guard.glb",
  airportStaff: "/models/airport-staff.glb",
  hotelConcierge: "/models/hotel-concierge.glb",
  sternTeacher: "/models/stern-teacher.glb",
  localNeutral: "/models/local-neutral.glb",
} as const;

export const POI_MODEL_KEYS = Object.keys(POI_MODEL_PATHS) as PoiModelKey[];

export type PoiModelKey = keyof typeof POI_MODEL_PATHS;
export type PoiModelPath = (typeof POI_MODEL_PATHS)[PoiModelKey];

export type PoiModelInput = {
  id: string;
  name: string;
  category?: string;
  rating?: number;
};

export type PoiModelAssignment = {
  id: string;
  modelKey: PoiModelKey;
  modelPath: PoiModelPath;
  reason?: string;
};

export function isPoiModelKey(value: string): value is PoiModelKey {
  return (POI_MODEL_KEYS as string[]).includes(value);
}

export function pathForPoiModelKey(modelKey: PoiModelKey): PoiModelPath {
  return POI_MODEL_PATHS[modelKey];
}

export function getHeuristicPoiModelKey(poi: PoiModelInput): PoiModelKey {
  if (typeof poi.rating === "number" && poi.rating < 3) return "angry";
  if (typeof poi.rating === "number" && poi.rating > 4.5) return "angel";

  const category = normalizeCategory(`${poi.category ?? ""} ${poi.name}`);
  if (category.includes("japanese") || category.includes("sushi") || category.includes("ramen")) return "japaneseChef";
  if (category.includes("korean") || category.includes("bbq") || category.includes("kimchi")) return "koreanChef";
  if (category.includes("italian") || category.includes("pizza") || category.includes("pasta")) return "chef";
  if (category.includes("cafe") || category.includes("coffee") || category.includes("tea")) return "barista";
  if (category.includes("fast_food") || category.includes("burger") || category.includes("fried_chicken")) return "mascot";
  if (category.includes("mall") || category.includes("shopping") || category.includes("plaza")) return "mallGuard";
  if (category.includes("airport") || category.includes("terminal")) return "airportStaff";
  if (category.includes("hotel") || category.includes("resort")) return "hotelConcierge";
  if (category.includes("school") || category.includes("tuition") || category.includes("academy")) return "sternTeacher";
  if (category.includes("restaurant") || category.includes("eat") || category.includes("food")) return "chef";

  return "localNeutral";
}

export function getHeuristicPoiModelPath(poi: PoiModelInput): PoiModelPath {
  return pathForPoiModelKey(getHeuristicPoiModelKey(poi));
}

function normalizeCategory(value: string) {
  return value.toLowerCase().replace(/[-\s/]+/g, "_");
}
