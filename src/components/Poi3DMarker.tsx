import { Suspense, memo, useMemo, type CSSProperties } from "react";
import { Billboard, useGLTF } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { Box3, Object3D, Vector3 } from "three";
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js";
import { getPoiModelPath } from "../lib/poiModel";
import type { Poi } from "../services/poi";

type Props = {
  poi: Poi;
  isSelected: boolean;
  zoom: number;
  onSelect: (poi: Poi) => void;
};

const MODEL_GROUND_Y = -1.92;

export const Poi3DMarker = memo(function Poi3DMarker({ poi, isSelected, zoom, onSelect }: Props) {
  const modelPath = getPoiModelPath(poi);
  const zoomScale = getMarkerZoomScale(zoom);

  return (
    <button
      type="button"
      className={`poi-3d-marker ${isSelected ? "is-selected" : ""}`}
      style={{ "--poi-marker-scale": zoomScale } as CSSProperties}
      aria-label={poi.name}
      title={poi.name}
      onClick={() => onSelect(poi)}
    >
      <Canvas
        camera={{ fov: 32, position: [0, 1.25, 6.7] }}
        dpr={[1, 2]}
        frameloop="demand"
        gl={{ alpha: true, antialias: true }}
        style={{ pointerEvents: "none" }}
      >
        <ambientLight intensity={1.25} />
        <hemisphereLight args={[0xffffff, 0x4b5563, 1.7]} />
        <directionalLight position={[3, 4, 5]} intensity={2.3} />
        <directionalLight position={[-3, 2, 2]} intensity={0.65} />
        <Suspense fallback={<MarkerFallback />}>
          <Billboard follow lockX={false} lockY={false} lockZ={false}>
            <PoiModel modelPath={modelPath} zoomScale={zoomScale} isSelected={isSelected} />
          </Billboard>
        </Suspense>
      </Canvas>
    </button>
  );
});

function PoiModel({ modelPath, zoomScale, isSelected }: { modelPath: string; zoomScale: number; isSelected: boolean }) {
  // useGLTF lazy-loads once per URL and caches the loaded GLB for all matching POIs.
  const gltf = useGLTF(modelPath) as { scene: Object3D };
  const model = useMemo(() => clone(gltf.scene) as Object3D, [gltf.scene]);
  const transform = useMemo(() => normalizeModel(model), [model]);
  const scale = transform.scale * zoomScale * (isSelected ? 1.16 : 1);

  return (
    <group position={[0, MODEL_GROUND_Y, 0]} scale={scale}>
      <primitive object={model} position={transform.position} />
    </group>
  );
}

function MarkerFallback() {
  return (
    <mesh position={[0, MODEL_GROUND_Y + 0.18, 0]} scale={0.42}>
      <sphereGeometry args={[1, 24, 24]} />
      <meshStandardMaterial color="#00a6a6" roughness={0.35} metalness={0.05} />
    </mesh>
  );
}

function normalizeModel(model: Object3D) {
  const box = new Box3().setFromObject(model);
  const size = box.getSize(new Vector3());
  const center = box.getCenter(new Vector3());
  const largestAxis = Math.max(size.x, size.y, size.z) || 1;
  const scale = 1.72 / largestAxis;

  return {
    scale,
    position: new Vector3(-center.x, -box.min.y, -center.z),
  };
}

function getMarkerZoomScale(zoom: number) {
  if (!Number.isFinite(zoom)) return 1;
  return Math.min(1.14, Math.max(0.62, 0.68 + (zoom - 11) * 0.052));
}
