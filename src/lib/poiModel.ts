export {
  POI_MODEL_KEYS,
  POI_MODEL_PATHS,
  getHeuristicPoiModelPath,
  getHeuristicPoiModelKey,
  isPoiModelKey,
  pathForPoiModelKey,
  type PoiModelAssignment,
  type PoiModelInput,
  type PoiModelKey,
  type PoiModelPath,
} from "../../lib/markerModels";

import { getHeuristicPoiModelPath, type PoiModelInput, type PoiModelPath } from "../../lib/markerModels";

export function getPoiModelPath(poi: PoiModelInput & { modelPath?: string }): PoiModelPath | string {
  return poi.modelPath || getHeuristicPoiModelPath(poi);
}
