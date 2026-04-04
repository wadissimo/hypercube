import {
  buildMagicCube4DFrame,
  buildRotationForAxis,
  createSolvedMagicCube4DState,
  mulRowMat4,
} from '../app/utils/magiccube4d';
import { MAGICCUBE4D_HYPERCUBE_DATA as DATA } from '../app/utils/magiccube4dData';
import { DEFAULT_MAGICCUBE4D_SETTINGS } from '../app/utils/magiccube4dSettings';
import { mulMat, rotX, rotY } from '../app/utils/math3d';

type Mat4 = [number[], number[], number[], number[]];

const WIDTH = 338;
const HEIGHT = 440;
const CENTER_X = WIDTH / 2;
const CENTER_Y = HEIGHT / 2;
const BASE_VIEW = DATA.niceView as Mat4;
const STATE = createSolvedMagicCube4DState();
const DEG = Math.PI / 180;

// Target ring order from the user's screenshot:
// top green, upper-right white, lower-right red, bottom blue, lower-left yellow, upper-left orange.
const TARGET_ANGLES = new Map<number, number>([
  [2, -Math.PI / 2],
  [6, -Math.PI / 6],
  [4, Math.PI / 6],
  [5, Math.PI / 2],
  [1, (5 * Math.PI) / 6],
  [3, (-5 * Math.PI) / 6],
]);
const FAST_MODE = process.argv.includes('--fast');

function cloneMat4(matrix: Mat4): Mat4 {
  return [
    [...matrix[0]],
    [...matrix[1]],
    [...matrix[2]],
    [...matrix[3]],
  ];
}

function viewMatrix(pitchDeg: number, yawDeg: number) {
  return mulMat(rotX(pitchDeg * DEG), rotY(yawDeg * DEG));
}

function wrapAngle(angle: number) {
  let value = angle;
  while (value <= -Math.PI) value += Math.PI * 2;
  while (value > Math.PI) value -= Math.PI * 2;
  return value;
}

function makeRotation(xwDeg: number, ywDeg: number, zwDeg: number): Mat4 {
  let rotation = cloneMat4(BASE_VIEW);
  rotation = mulRowMat4(rotation, buildRotationForAxis(0, xwDeg * DEG));
  rotation = mulRowMat4(rotation, buildRotationForAxis(1, ywDeg * DEG));
  rotation = mulRowMat4(rotation, buildRotationForAxis(2, zwDeg * DEG));
  return rotation;
}

function faceCentroids(frame: ReturnType<typeof buildMagicCube4DFrame>) {
  const sums = new Map<number, { x: number; y: number; n: number }>();
  for (const polygon of frame.polygons) {
    let x = 0;
    let y = 0;
    for (const [px, py] of polygon.points) {
      x += px;
      y += py;
    }
    const centroidX = x / polygon.points.length;
    const centroidY = y / polygon.points.length;
    const previous = sums.get(polygon.faceIndex) ?? { x: 0, y: 0, n: 0 };
    sums.set(polygon.faceIndex, {
      x: previous.x + centroidX,
      y: previous.y + centroidY,
      n: previous.n + 1,
    });
  }
  return [...sums.entries()].map(([faceIndex, value]) => ({
    faceIndex,
    x: value.x / value.n,
    y: value.y / value.n,
  }));
}

function evaluate(xwDeg: number, ywDeg: number, zwDeg: number, pitchDeg: number, yawDeg: number) {
  const frame = buildMagicCube4DFrame(
    STATE,
    makeRotation(xwDeg, ywDeg, zwDeg),
    viewMatrix(pitchDeg, yawDeg),
    null,
    WIDTH,
    HEIGHT,
    1,
    DEFAULT_MAGICCUBE4D_SETTINGS,
  );
  const centroids = faceCentroids(frame);
  if (centroids.length !== 7) {
    return null;
  }

  const centerFace = centroids.find(face => face.faceIndex === 0);
  if (!centerFace) {
    return null;
  }

  const ringFaces = centroids.filter(face => face.faceIndex !== 0);
  if (ringFaces.length !== 6) {
    return null;
  }

  let angleError = 0;
  const radii: number[] = [];
  for (const [faceIndex, targetAngle] of TARGET_ANGLES) {
    const face = centroids.find(candidate => candidate.faceIndex === faceIndex);
    if (!face) {
      return null;
    }
    const dx = face.x - CENTER_X;
    const dy = face.y - CENTER_Y;
    angleError += Math.abs(wrapAngle(Math.atan2(dy, dx) - targetAngle));
    radii.push(Math.hypot(dx, dy));
  }

  const centerDistance = Math.hypot(centerFace.x - CENTER_X, centerFace.y - CENTER_Y);
  const meanRadius = radii.reduce((sum, value) => sum + value, 0) / radii.length;
  const radiusStd = Math.sqrt(radii.reduce((sum, value) => sum + (value - meanRadius) ** 2, 0) / radii.length);

  let minFaceDistance = Infinity;
  for (let i = 0; i < centroids.length; i++) {
    for (let j = i + 1; j < centroids.length; j++) {
      minFaceDistance = Math.min(
        minFaceDistance,
        Math.hypot(centroids[i].x - centroids[j].x, centroids[i].y - centroids[j].y),
      );
    }
  }

  const top = centroids.find(face => face.faceIndex === 2);
  const bottom = centroids.find(face => face.faceIndex === 5);
  if (!top || !bottom) {
    return null;
  }
  const topBias = Math.abs((CENTER_Y - top.y) - (bottom.y - CENTER_Y));

  const score =
    minFaceDistance * 120 +
    meanRadius * 35 -
    centerDistance * 300 -
    radiusStd * 160 -
    angleError * 240 -
    topBias * 6;

  return {
    xwDeg,
    ywDeg,
    zwDeg,
    pitchDeg,
    yawDeg,
    score,
    centerDistance,
    meanRadius,
    radiusStd,
    angleError,
    minFaceDistance,
    topBias,
  };
}

let best = evaluate(0, 0, 0, 33, -36);
if (!best) {
  throw new Error('Baseline view is unexpectedly invalid.');
}

const coarse4dStep = FAST_MODE ? 0 : 12;
const coarsePitchStep = FAST_MODE ? 0 : 4;
const coarseYawStep = FAST_MODE ? 0 : 4;
const refineSteps = FAST_MODE ? [8, 4, 2, 1] : [6, 3, 1];
const coarse4dValues = FAST_MODE ? [-48, -24, 0, 24, 48] : Array.from({ length: 13 }, (_, i) => -72 + i * coarse4dStep);
const coarsePitchValues = FAST_MODE ? [24, 32, 40, 48, 56] : Array.from({ length: 11 }, (_, i) => 20 + i * coarsePitchStep);
const coarseYawValues = FAST_MODE ? [-64, -56, -48, -40, -32, -24] : Array.from({ length: 21 }, (_, i) => -80 + i * coarseYawStep);

for (const xwDeg of coarse4dValues) {
  for (const ywDeg of coarse4dValues) {
    for (const zwDeg of coarse4dValues) {
      for (const pitchDeg of coarsePitchValues) {
        for (const yawDeg of coarseYawValues) {
          const candidate = evaluate(xwDeg, ywDeg, zwDeg, pitchDeg, yawDeg);
          if (candidate && candidate.score > best.score) {
            best = candidate;
          }
        }
      }
    }
  }
}

for (const step of refineSteps) {
  let improved = true;
  while (improved) {
    improved = false;
    const deltas: Array<[number, number, number, number, number]> = [
      [step, 0, 0, 0, 0],
      [-step, 0, 0, 0, 0],
      [0, step, 0, 0, 0],
      [0, -step, 0, 0, 0],
      [0, 0, step, 0, 0],
      [0, 0, -step, 0, 0],
      [0, 0, 0, step, 0],
      [0, 0, 0, -step, 0],
      [0, 0, 0, 0, step],
      [0, 0, 0, 0, -step],
    ];
    for (const [dxw, dyw, dzw, dpitch, dyaw] of deltas) {
      const candidate = evaluate(
        best.xwDeg + dxw,
        best.ywDeg + dyw,
        best.zwDeg + dzw,
        best.pitchDeg + dpitch,
        best.yawDeg + dyaw,
      );
      if (candidate && candidate.score > best.score) {
        best = candidate;
        improved = true;
      }
    }
  }
}

console.log(JSON.stringify({
  best,
  rotation4d: makeRotation(best.xwDeg, best.ywDeg, best.zwDeg),
}, null, 2));
