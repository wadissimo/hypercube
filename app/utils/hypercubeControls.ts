import type { Mat3 } from './math3d';
import { mulVec } from './math3d';
import type { Mat4 } from './magiccube4d';
import { getFaceCenter, mulRowVec4 } from './magiccube4d';
import { MAGICCUBE4D_HYPERCUBE_DATA } from './magiccube4dData';

const SCALE_4D = 1 / MAGICCUBE4D_HYPERCUBE_DATA.circumRadius;
const EYE_W = MAGICCUBE4D_HYPERCUBE_DATA.eyeW;
const FACE_COUNT = 8;
const PROJECTION_EPSILON = 0.15;
const SLOT_DEFAULT_WEIGHT = 1e-4;
const HYPERCUBE_SCREEN_SLOT_FACES = [6, 4, 5, 7, 0, 2, 3, 1] as const;

export const HYPERCUBE_SCREEN_SLOT_GRID_ROWS = [
  [6, 4, 5],
  [7, null, 0],
  [2, 3, 1],
] as const;

export const HYPERCUBE_SCREEN_SLOT_LABELS: Record<number, string> = {
  0: 'I',
  1: 'R',
  2: 'F',
  3: 'D',
  4: 'U',
  5: 'B',
  6: 'L',
  7: 'O',
};

export function resolve4DScreenRelativeFaceMapping(
  rotation4d: Mat4,
  viewMatrix: Mat3,
  defaultViewMatrix: Mat3,
): number[] {
  const facePoints = Array.from({ length: FACE_COUNT }, (_, faceIndex) => (
    projectFaceCenterToView(getFaceCenter(faceIndex), rotation4d, viewMatrix)
  ));
  const slotAnchors = Array.from({ length: FACE_COUNT }, (_, faceIndex) => (
    projectFaceCenterToView(getFaceCenter(faceIndex), rotation4d, defaultViewMatrix)
  ));

  let bestScore = -Infinity;
  let bestMapping = Array.from({ length: FACE_COUNT }, (_, faceIndex) => faceIndex);
  const working: number[] = [];

  const search = (slotIndex: number, score: number, remainingFaces: number[]) => {
    if (slotIndex === FACE_COUNT) {
      if (score > bestScore) {
        bestScore = score;
        bestMapping = [...working];
      }
      return;
    }

    const slotFace = HYPERCUBE_SCREEN_SLOT_FACES[slotIndex];
    remainingFaces.forEach((physicalFace, remainingIndex) => {
      const nextScore = score + scoreFaceForSlot(slotFace, physicalFace, facePoints[physicalFace], slotAnchors[slotFace]);
      working[slotFace] = physicalFace;
      search(
        slotIndex + 1,
        nextScore,
        [...remainingFaces.slice(0, remainingIndex), ...remainingFaces.slice(remainingIndex + 1)],
      );
    });
  };

  search(0, 0, Array.from({ length: FACE_COUNT }, (_, faceIndex) => faceIndex));
  return bestMapping;
}

export function invert4DScreenRelativeFaceMapping(mapping: readonly number[]): number[] {
  const result = new Array<number>(mapping.length).fill(-1);
  mapping.forEach((physicalFace, slotFace) => {
    result[physicalFace] = slotFace;
  });
  return result;
}

function scoreFaceForSlot(
  slotFace: number,
  physicalFace: number,
  point: readonly [number, number, number],
  anchor: readonly [number, number, number],
): number {
  const deltaX = point[0] - anchor[0];
  const deltaY = point[1] - anchor[1];
  const deltaZ = point[2] - anchor[2];
  const distanceScore = -(deltaX * deltaX + deltaY * deltaY + deltaZ * deltaZ);
  const defaultScore = slotFace === physicalFace ? 1 : 0;

  return distanceScore + (defaultScore * SLOT_DEFAULT_WEIGHT);
}

function projectFaceCenterToView(
  point: readonly number[],
  rotation4d: Mat4,
  viewMatrix: Mat3,
): [number, number, number] {
  const rotated = mulRowVec4(point as [number, number, number, number], rotation4d);
  const scaled = rotated.map(value => value * SCALE_4D) as [number, number, number, number];
  const denom = Math.max(EYE_W - scaled[3], PROJECTION_EPSILON);
  const factor = EYE_W / denom;
  const projected = [scaled[0] * factor, scaled[1] * factor, scaled[2] * factor] as const;
  const rotated3d = mulVec(viewMatrix, [projected[0], projected[1], -projected[2]]);
  return [rotated3d[0], rotated3d[1], -rotated3d[2]];
}
