import type { CubeSize, Face } from './cubeModel';
import { ALL_FACES, faceVector, outerCoord } from './cubeModel';
import { CAMERA_FOV, viewDist } from './cubeGeometry';
import { mulVec, project, type Mat3 } from './math3d';

export type ScreenRelativeFaceMapping = Record<Face, Face>;

export function resolveScreenRelativeFace(targetFace: Face, viewMatrix: Mat3, cubeSize: CubeSize): Face {
  return resolveScreenRelativeMapping(viewMatrix, cubeSize)[targetFace];
}

export function resolveScreenRelativeMapping(
  viewMatrix: Mat3,
  cubeSize: CubeSize,
): ScreenRelativeFaceMapping {
  const slotScores = buildScreenRelativeFaceScores(viewMatrix, cubeSize);
  let bestScore = -Infinity;
  let bestMapping: Face[] = [...ALL_FACES];
  const working: Face[] = [];

  const search = (index: number, score: number, remaining: Face[]) => {
    if (index === ALL_FACES.length) {
      if (score > bestScore) {
        bestScore = score;
        bestMapping = [...working];
      }
      return;
    }

    const slotFace = ALL_FACES[index];

    remaining.forEach((physicalFace, remainingIndex) => {
      const nextScore = score + slotScores[slotFace][physicalFace];
      working.push(physicalFace);
      search(
        index + 1,
        nextScore,
        [...remaining.slice(0, remainingIndex), ...remaining.slice(remainingIndex + 1)],
      );
      working.pop();
    });
  };

  search(0, 0, [...ALL_FACES]);

  return ALL_FACES.reduce<ScreenRelativeFaceMapping>((result, slotFace, index) => {
    result[slotFace] = bestMapping[index];
    return result;
  }, {} as ScreenRelativeFaceMapping);
}

function buildScreenRelativeFaceScores(
  viewMatrix: Mat3,
  cubeSize: CubeSize,
): Record<Face, Record<Face, number>> {
  const centers = ALL_FACES.reduce<Record<Face, { screenX: number; screenY: number; depth: number }>>((result, face) => {
    const center = scale3(faceVector(face), outerCoord(cubeSize));
    const transformedCenter = mulVec(viewMatrix, center);
    const [screenX, screenY] = project(transformedCenter, CAMERA_FOV, viewDist(cubeSize), 0, 0);
    result[face] = { screenX, screenY, depth: transformedCenter[2] };
    return result;
  }, {} as Record<Face, { screenX: number; screenY: number; depth: number }>);

  return {
    U: rankFaceMetric(centers, center => center.screenY, 'asc'),
    D: rankFaceMetric(centers, center => center.screenY, 'desc'),
    L: rankFaceMetric(centers, center => center.screenX, 'asc'),
    R: rankFaceMetric(centers, center => center.screenX, 'desc'),
    // In this projection, smaller transformed z is closer to the camera.
    F: rankFaceMetric(centers, center => center.depth, 'asc'),
    B: rankFaceMetric(centers, center => center.depth, 'desc'),
  };
}

function rankFaceMetric(
  centers: Record<Face, { screenX: number; screenY: number; depth: number }>,
  selectValue: (center: { screenX: number; screenY: number; depth: number }) => number,
  direction: 'asc' | 'desc',
): Record<Face, number> {
  const sortedFaces = [...ALL_FACES].sort((leftFace, rightFace) => {
    const delta = selectValue(centers[leftFace]) - selectValue(centers[rightFace]);
    if (Math.abs(delta) < 1e-6) {
      return ALL_FACES.indexOf(leftFace) - ALL_FACES.indexOf(rightFace);
    }
    return direction === 'asc' ? delta : -delta;
  });

  return sortedFaces.reduce<Record<Face, number>>((scores, face, index) => {
    scores[face] = ALL_FACES.length - index;
    return scores;
  }, {} as Record<Face, number>);
}

function scale3(vector: Vec3, factor: number): Vec3 {
  return [vector[0] * factor, vector[1] * factor, vector[2] * factor];
}

type Vec3 = [number, number, number];
