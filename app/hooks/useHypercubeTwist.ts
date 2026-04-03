import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  HYPER_AXES,
  axisIndex,
  cloneHypercubeCubies,
  hyperCellById,
  hyperCellIdFromCenter,
  type HyperAxis,
  type HyperCubieDef,
  type HyperPreviewHitFace,
} from '../utils/hypercubeModel';
import type { Mat4 } from '../utils/math4d';
import { average4, mulMat4, mulVec4, planeRotation4, transpose4 } from '../utils/math4d';

const DURATION_MS = 220;
const QUARTER_TURN = Math.PI / 2;

interface TwistAnim {
  cubieIds: Set<number>;
  matrix: Mat4;
}

export function useHypercubeTwist() {
  const [cubies, setCubies] = useState<HyperCubieDef[]>(cloneHypercubeCubies);
  const [anim, setAnim] = useState<TwistAnim | null>(null);
  const cubiesRef = useRef(cubies);
  const animRef = useRef<number | null>(null);

  cubiesRef.current = cubies;

  const cubiesById = useMemo(() => {
    const result = new Map<number, HyperCubieDef>();
    for (const cubie of cubies) {
      result.set(cubie.id, cubie);
    }
    return result;
  }, [cubies]);

  useEffect(() => (
    () => {
      if (animRef.current) {
        cancelAnimationFrame(animRef.current);
      }
    }
  ), []);

  const twistFromHit = useCallback((hit: HyperPreviewHitFace | null, rotationMatrix: Mat4, clockwise: boolean) => {
    if (!hit || animRef.current) {
      return;
    }

    const cubie = cubiesRef.current.find(candidate => candidate.id === hit.cubieId);
    if (!cubie) {
      return;
    }

    const activeCell = hyperCellById(cubie.cellId);
    const face = cubie.faces[hit.faceIndex];
    if (!face) {
      return;
    }

    const stickerAxis = face.localAxis;
    const stickerAxisLocalIndex = cubie.localAxes.indexOf(stickerAxis);
    if (stickerAxisLocalIndex < 0) {
      return;
    }

    const targetLayer = cubie.localCoords[stickerAxisLocalIndex] as -1 | 0 | 1;
    const sliceCubieIds = selectSliceCubieIds(
      cubiesRef.current,
      activeCell.fixedAxis,
      activeCell.fixedSign,
      stickerAxis,
      targetLayer,
    );

    const rotationAxes = HYPER_AXES.filter(
      axis => axis !== activeCell.fixedAxis && axis !== stickerAxis,
    ) as [HyperAxis, HyperAxis];
    const worldAngle = clockwise ? QUARTER_TURN : -QUARTER_TURN;
    const inverseRotation = transpose4(rotationMatrix);
    const startTime = Date.now();

    const tick = () => {
      const progress = Math.min((Date.now() - startTime) / DURATION_MS, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const animatedWorldMatrix = planeRotation4(
        axisIndex(rotationAxes[0]),
        axisIndex(rotationAxes[1]),
        worldAngle * eased,
      );

      setAnim({
        cubieIds: sliceCubieIds,
        matrix: mulMat4(inverseRotation, mulMat4(animatedWorldMatrix, rotationMatrix)),
      });

      if (progress < 1) {
        animRef.current = requestAnimationFrame(tick);
      } else {
        const completedMatrix = mulMat4(
          inverseRotation,
          mulMat4(
            planeRotation4(axisIndex(rotationAxes[0]), axisIndex(rotationAxes[1]), worldAngle),
            rotationMatrix,
          ),
        );

        setCubies(prev => prev.map(candidate => (
          sliceCubieIds.has(candidate.id)
            ? rotateCubie(candidate, completedMatrix)
            : candidate
        )));
        setAnim(null);
        animRef.current = null;
      }
    };

    setAnim({
      cubieIds: sliceCubieIds,
      matrix: planeRotation4(axisIndex(rotationAxes[0]), axisIndex(rotationAxes[1]), 0),
    });
    animRef.current = requestAnimationFrame(tick);
  }, []);

  return {
    cubies,
    cubiesById,
    twistAnimation: anim,
    isAnimating: !!anim,
    twistFromHit,
  };
}

function selectSliceCubieIds(
  cubies: HyperCubieDef[],
  fixedAxis: HyperAxis,
  fixedSign: -1 | 1,
  stickerAxis: HyperAxis,
  targetLayer: -1 | 0 | 1,
): Set<number> {
  const ids = new Set<number>();

  for (const candidate of cubies) {
    const center = average4(candidate.vertices4D);
    const fixedValue = center[axisIndex(fixedAxis)];
    const stickerValue = center[axisIndex(stickerAxis)];

    if (!matchesOuterBand(fixedValue, fixedSign)) {
      continue;
    }

    if (!matchesLayer(stickerValue, targetLayer)) {
      continue;
    }

    ids.add(candidate.id);
  }

  return ids;
}

function matchesOuterBand(value: number, sign: -1 | 1): boolean {
  return sign > 0 ? value >= 0.75 : value <= -0.75;
}

function matchesLayer(value: number, targetLayer: -1 | 0 | 1): boolean {
  if (targetLayer === 0) {
    return Math.abs(value) < 0.75;
  }

  return targetLayer > 0 ? value >= 0.75 : value <= -0.75;
}

function rotateCubie(cubie: HyperCubieDef, matrix: Mat4): HyperCubieDef {
  const vertices4D = cubie.vertices4D.map(vertex => mulVec4(matrix, vertex)) as HyperCubieDef['vertices4D'];
  const center = average4(vertices4D);

  return {
    ...cubie,
    cellId: hyperCellIdFromCenter(center),
    vertices4D,
  };
}
