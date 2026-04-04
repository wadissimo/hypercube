import { MAGICCUBE4D_HYPERCUBE_DATA } from './magiccube4dData';
import type { MagicCube4DSettings } from './magiccube4dSettings';
import { mulVec, type Mat3, type Vec3 } from './math3d';

export type Vec4 = [number, number, number, number];
export type Mat4 = [Vec4, Vec4, Vec4, Vec4];
type Axis4 = 0 | 1 | 2 | 3;

export interface MagicCube4DTwistAnimation {
  gripIndex: number;
  dir: MagicCube4DTwistDirection;
  sliceMask: number;
  progress: number;
}

export type MagicCube4DTwistDirection = -1 | 1 | 2;

export interface MagicCube4DFramePolygon {
  stickerIndex: number;
  cubieIndex: number;
  faceIndex: number;
  gripIndex: number;
  color: string;
  points: [number, number][];
  depth: number;
}

export interface MagicCube4DFrame {
  polygons: MagicCube4DFramePolygon[];
}

export interface MagicCube4DPickInfo {
  stickerIndex: number;
  cubieIndex: number;
  faceIndex: number;
  gripIndex: number;
}

export interface MagicCube4DFaceAxisOption {
  axisIndex: number;
  label: string;
  gripIndex: number;
  oppositeGripIndex: number;
}

const DATA = MAGICCUBE4D_HYPERCUBE_DATA;
const SCALE_4D = 1 / DATA.circumRadius;
const EPSILON = 1e-6;
const ROW_ROT_AXIS_A: 2 = 2;
const ROW_ROT_AXIS_B: 3 = 3;
const SCALE_FUDGE_2D = 4.7;
const AXIS_LABELS = ['X', 'Y', 'Z', 'W'] as const;

export const MAGICCUBE4D_DEFAULT_SLICE_MASK = 1;
export const MAGICCUBE4D_SLICE_BITS = [1, 2, 4] as const;
export const MAGICCUBE4D_SLICE_LABELS: Record<number, string> = {
  1: '1',
  2: '2',
  3: '1+2',
  4: '3',
  5: '1+3',
  6: '2+3',
  7: '1+2+3',
};
export const MAGICCUBE4D_FACE_COLORS = DATA.defaultFaceColors;
export const MAGICCUBE4D_INITIAL_VIEW: Mat4 = [
  [0.732, -0.19573138881189647, 0.6515682319408275, -0.044419168826872364],
  [0.681, 0.1867437229991053, -0.7055188782884173, 0.04677493237928689],
  [0.016, 0.9616802419686545, 0.2722676817639113, 0.036199746877780305],
  [0, -0.052335956242943835, 0.052264231633826735, 0.9972609476841365],
];
export const MAGICCUBE4D_FACE_LABELS = ['w-', 'z-', 'y-', 'x-', 'x+', 'y+', 'z+', 'w+'] as const;

const numColorsByCubie = buildNumColorsByCubie();
const vertexToSticker = buildVertexToSticker();
const faceCenterStickerMap = buildFaceCenterStickerMap();
const twistDestinationCache = new Map<string, number[]>();
const cubeRotationDestinationCache = new Map<string, number[]>();
const stickerGripMap = buildStickerGripMap();
const faceTwistStickerMap = buildFaceTwistStickerMap();
const faceTwistAxisMap = buildFaceTwistAxisMap();

export function createSolvedMagicCube4DState(): number[] {
  return [...DATA.sticker2Face];
}

export function getStickerFaceIndex(stickerIndex: number): number {
  return DATA.sticker2Face[stickerIndex];
}

export function getStickerGripIndex(stickerIndex: number): number {
  return stickerGripMap[stickerIndex];
}

export function getStickerCubieIndex(stickerIndex: number): number {
  return DATA.sticker2Cubie[stickerIndex];
}

export function getFaceCenterStickerIndex(faceIndex: number): number {
  return faceCenterStickerMap[faceIndex];
}

export function getFaceTwistStickerIndex(faceIndex: number): number {
  return faceTwistStickerMap[faceIndex];
}

export function getFaceTwistAxisOptions(faceIndex: number): readonly MagicCube4DFaceAxisOption[] {
  return faceTwistAxisMap[faceIndex] ?? [];
}

export function getFaceCenter(faceIndex: number): Vec4 {
  return [...DATA.faceCenters[faceIndex]] as Vec4;
}

export function hasValidTwist(gripIndex: number, sliceMask: number): boolean {
  if (gripIndex < 0 || gripIndex >= DATA.gripSymmetryOrders.length) {
    return false;
  }

  const validSlices = getNumSlicesForGrip(gripIndex);
  const validBits = (1 << validSlices) - 1;
  if ((validBits & normalizeSliceMask(sliceMask)) === 0) {
    return false;
  }

  const order = DATA.gripSymmetryOrders[gripIndex];
  return order > 1;
}

export function buildScrambledMagicCube4DState(length: number): number[] {
  let state = createSolvedMagicCube4DState();
  let lastGrip = -1;

  for (let i = 0; i < length; i++) {
    let grip = 0;
    do {
      grip = Math.floor(Math.random() * DATA.nGrips);
    } while (DATA.gripSymmetryOrders[grip] <= 1 || grip === lastGrip);

    const dir: 1 | -1 = Math.random() < 0.5 ? 1 : -1;
    const sliceMask = 1 << Math.floor(Math.random() * getNumSlicesForGrip(grip));
    state = applyTwistToState(state, grip, dir, sliceMask);
    lastGrip = grip;
  }

  return state;
}

export function applyTwistToState(
  state: number[],
  gripIndex: number,
  dir: MagicCube4DTwistDirection,
  sliceMask: number,
): number[] {
  const normalizedMask = normalizeSliceMask(sliceMask);
  const next = [...state];
  const faceIndex = DATA.grip2Face[gripIndex];
  const faceNormal = DATA.faceInwardNormals[faceIndex] as Vec4;
  const cutOffsets = DATA.faceCutOffsets[faceIndex];
  const destinations = getTwistDestinations(gripIndex, dir);

  for (let stickerIndex = 0; stickerIndex < state.length; stickerIndex++) {
    const center = DATA.stickerCenters[stickerIndex] as Vec4;
    if (!isStickerInSliceMask(center, normalizedMask, faceNormal, cutOffsets)) {
      next[stickerIndex] = state[stickerIndex];
      continue;
    }

    next[destinations[stickerIndex]] = state[stickerIndex];
  }

  return next;
}

export function applyCubeRotationToState(
  state: number[],
  axisIndex: 0 | 1 | 2,
  dir: -1 | 1,
): number[] {
  const destinations = getCubeRotationDestinations(axisIndex, dir);
  const next = [...state];

  for (let stickerIndex = 0; stickerIndex < state.length; stickerIndex++) {
    next[destinations[stickerIndex]] = state[stickerIndex];
  }

  return next;
}

export function buildMagicCube4DFrame(
  state: number[],
  rotation4d: Mat4,
  viewMatrix: Mat3,
  animation: MagicCube4DTwistAnimation | null,
  width: number,
  height: number,
  zoomScale = 1,
  settings?: MagicCube4DSettings,
): MagicCube4DFrame {
  if (width <= 0 || height <= 0) {
    return { polygons: [] };
  }

  const renderSettings = resolveRenderSettings(settings);
  const baseVerts = computeRestVerts(renderSettings.faceShrink, renderSettings.stickerShrink);
  const verts = applyPartialTwistToVerts(baseVerts, animation);
  const stableProjected3d = baseVerts.map(vertex => rotateProjected3d(
    project4dVertexTo3d(vertex, rotation4d, renderSettings.eyeW),
    viewMatrix,
  ));
  const projected3d = verts.map(vertex => rotateProjected3d(
    project4dVertexTo3d(vertex, rotation4d, renderSettings.eyeW),
    viewMatrix,
  ));
  const frontCulledStickers = buildFrontCellStickerSet(projected3d);

  let radius3d = 0;
  for (const vertex of stableProjected3d) {
    radius3d = Math.max(radius3d, Math.hypot(vertex[0], vertex[1], vertex[2]));
  }

  const minpix = Math.min(width, height);
  const polys2pixelsSF = minpix / (1.25 * Math.max(radius3d, 0.001));
  const viewScale = renderSettings.scaleFudge2d * polys2pixelsSF * zoomScale;

  const stableVerts2d = stableProjected3d.map(project3dVertexTo2d);
  const verts2d = projected3d.map(project3dVertexTo2d);
  const sun = normalize3(DATA.sunVec as Vec3) ?? [0, 0, 1];
  let minProjectedX = Infinity;
  let maxProjectedX = -Infinity;
  let minProjectedY = Infinity;
  let maxProjectedY = -Infinity;

  for (const point of stableVerts2d) {
    minProjectedX = Math.min(minProjectedX, point[0]);
    maxProjectedX = Math.max(maxProjectedX, point[0]);
    minProjectedY = Math.min(minProjectedY, point[1]);
    maxProjectedY = Math.max(maxProjectedY, point[1]);
  }

  const projectedCenterX = (minProjectedX + maxProjectedX) / 2;
  const projectedCenterY = (minProjectedY + maxProjectedY) / 2;
  const xOff = width / 2 - projectedCenterX * viewScale;
  const yOff = height / 2 + projectedCenterY * viewScale;

  const polygons: MagicCube4DFramePolygon[] = [];

  for (const stickerIndex of frontCulledStickers) {
    const faceColor = DATA.defaultFaceColors[state[stickerIndex] % DATA.defaultFaceColors.length];
    const faceIndex = DATA.sticker2Face[stickerIndex];

    for (let polygonIndexWithinSticker = 0; polygonIndexWithinSticker < DATA.stickerInds[stickerIndex].length; polygonIndexWithinSticker++) {
      const polygon = DATA.stickerInds[stickerIndex][polygonIndexWithinSticker];
      if (!isFrontFacing2dPolygon(verts2d, polygon)) {
        continue;
      }

      const brightness = computePolygonBrightness(projected3d, polygon, sun);
      const transformedPoints = polygon.map(vertexIndex => {
        const point = verts2d[vertexIndex];
        return [
          point[0] * viewScale + xOff,
          -point[1] * viewScale + yOff,
        ] as [number, number];
      });
      const depth = averageDepth(verts2d, polygon);

      polygons.push({
        stickerIndex,
        cubieIndex: DATA.sticker2Cubie[stickerIndex],
        faceIndex,
        gripIndex: stickerGripMap[stickerIndex],
        color: multiplyColor(faceColor, brightness),
        points: transformedPoints,
        depth,
      });
    }
  }

  polygons.sort((a, b) => b.depth - a.depth);
  return { polygons };
}

export function normalizeSliceMask(sliceMask: number): number {
  const mask = sliceMask & 0b111;
  return mask === 0 ? MAGICCUBE4D_DEFAULT_SLICE_MASK : mask;
}

export function buildRotationForAxis(axisIndex: 0 | 1 | 2, angle: number): Mat4 {
  return planeRotation4Row(axisIndex, 3, angle);
}

export function mulRowMat4(a: Mat4, b: Mat4): Mat4 {
  const result: Mat4 = [
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ];

  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      result[i][j] =
        a[i][0] * b[0][j] +
        a[i][1] * b[1][j] +
        a[i][2] * b[2][j] +
        a[i][3] * b[3][j];
    }
  }

  return result;
}

export function mulRowVec4(vector: Vec4, matrix: Mat4): Vec4 {
  return [
    vector[0] * matrix[0][0] + vector[1] * matrix[1][0] + vector[2] * matrix[2][0] + vector[3] * matrix[3][0],
    vector[0] * matrix[0][1] + vector[1] * matrix[1][1] + vector[2] * matrix[2][1] + vector[3] * matrix[3][1],
    vector[0] * matrix[0][2] + vector[1] * matrix[1][2] + vector[2] * matrix[2][2] + vector[3] * matrix[3][2],
    vector[0] * matrix[0][3] + vector[1] * matrix[1][3] + vector[2] * matrix[2][3] + vector[3] * matrix[3][3],
  ];
}

export function createRotateFaceToCenterMatrix(currentView: Mat4, faceIndex: number, t: number): Mat4 | null {
  const faceCenter = getFaceCenter(faceIndex);
  const faceOnScreen = normalize4(mulRowVec4(faceCenter, currentView));
  const minusW: Vec4 = [0, 0, 0, -1];
  const angle = angleBetweenUnitVectors(faceOnScreen, minusW);
  if (angle <= 1e-6) {
    return null;
  }

  return mulRowMat4(currentView, makeRowRotMatThatSlerps(faceOnScreen, minusW, t));
}

function getClosestGrip(pickCoords: Vec4, faceIndex: number, stickerIndex: number): number {
  const cubie = DATA.sticker2Cubie[stickerIndex];
  const numColors = numColorsByCubie.get(cubie) ?? 1;
  const gripDim = Math.max(4 - numColors, 0);
  let bestGrip = -1;
  let bestDistance = Infinity;

  for (let i = 0; i < DATA.gripCenters.length; i++) {
    if (DATA.grip2Face[i] !== faceIndex || DATA.gripDims[i] !== gripDim) {
      continue;
    }

    const distance = distanceSquared(DATA.gripCenters[i] as Vec4, pickCoords);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestGrip = i;
    }
  }

  if (bestGrip < 0) {
    throw new Error(`No grip found for sticker ${stickerIndex}`);
  }

  return bestGrip;
}

function getClosestTwistGrip(pickCoords: Vec4, faceIndex: number, stickerIndex: number): number {
  const cubie = DATA.sticker2Cubie[stickerIndex];
  const gripDim = 4 - (numColorsByCubie.get(cubie) ?? 1);
  const exact = findClosestGripCandidate(pickCoords, faceIndex, gripDim, true);
  if (exact >= 0) {
    return exact;
  }

  const fallback = findClosestGripCandidate(pickCoords, faceIndex, null, true);
  if (fallback >= 0) {
    return fallback;
  }

  return getClosestGrip(pickCoords, faceIndex, stickerIndex);
}

function findClosestGripCandidate(
  pickCoords: Vec4,
  faceIndex: number,
  gripDim: number | null,
  requireValidTwist: boolean,
): number {
  let bestGrip = -1;
  let bestDistance = Infinity;

  for (let i = 0; i < DATA.gripCenters.length; i++) {
    if (DATA.grip2Face[i] !== faceIndex) {
      continue;
    }
    if (gripDim != null && DATA.gripDims[i] !== gripDim) {
      continue;
    }
    if (requireValidTwist && !hasValidTwist(i, MAGICCUBE4D_DEFAULT_SLICE_MASK)) {
      continue;
    }

    const distance = distanceSquared(DATA.gripCenters[i] as Vec4, pickCoords);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestGrip = i;
    }
  }

  return bestGrip;
}

function buildNumColorsByCubie(): Map<number, number> {
  const result = new Map<number, number>();
  for (const cubie of DATA.sticker2Cubie) {
    result.set(cubie, (result.get(cubie) ?? 0) + 1);
  }
  return result;
}

function buildVertexToSticker(): number[] {
  const mapping = Array.from({ length: DATA.standardStickerVertsAtRest.length }, () => -1);
  for (let stickerIndex = 0; stickerIndex < DATA.stickerInds.length; stickerIndex++) {
    for (const polygon of DATA.stickerInds[stickerIndex]) {
      for (const vertexIndex of polygon) {
        mapping[vertexIndex] = stickerIndex;
      }
    }
  }
  return mapping;
}

function buildFaceCenterStickerMap(): number[] {
  return DATA.faceCenters.map((faceCenter, faceIndex) => {
    let bestSticker = -1;
    let bestDistance = Infinity;

    for (let stickerIndex = 0; stickerIndex < DATA.stickerCenters.length; stickerIndex++) {
      if (DATA.sticker2Face[stickerIndex] !== faceIndex) {
        continue;
      }

      const distance = distanceSquared(DATA.stickerCenters[stickerIndex] as Vec4, faceCenter as Vec4);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestSticker = stickerIndex;
      }
    }

    if (bestSticker < 0) {
      throw new Error(`Missing center sticker for face ${faceIndex}`);
    }

    return bestSticker;
  });
}

function buildStickerGripMap(): number[] {
  return DATA.stickerInds.map((_, stickerIndex) => {
    const stickerCenter = DATA.stickerCenters[stickerIndex] as Vec4;
    return getClosestTwistGrip(
      stickerCenter,
      DATA.sticker2Face[stickerIndex],
      stickerIndex,
    );
  });
}

function buildFaceTwistStickerMap(): number[] {
  return DATA.faceCenters.map((faceCenter, faceIndex) => {
    let bestSticker = -1;
    let bestDistance = Infinity;

    for (let stickerIndex = 0; stickerIndex < DATA.stickerCenters.length; stickerIndex++) {
      if (DATA.sticker2Face[stickerIndex] !== faceIndex) {
        continue;
      }

      const gripIndex = stickerGripMap[stickerIndex];
      if (!hasValidTwist(gripIndex, MAGICCUBE4D_DEFAULT_SLICE_MASK)) {
        continue;
      }

      const distance = distanceSquared(DATA.stickerCenters[stickerIndex] as Vec4, faceCenter as Vec4);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestSticker = stickerIndex;
      }
    }

    if (bestSticker < 0) {
      throw new Error(`Missing twist sticker for face ${faceIndex}`);
    }

    return bestSticker;
  });
}

function buildFaceTwistAxisMap(): MagicCube4DFaceAxisOption[][] {
  return DATA.faceCenters.map((_, faceIndex) => {
    const fixedAxis = getFaceFixedAxis(faceIndex);
    const optionsByAxis = new Map<number, { positive: number | null; negative: number | null }>();

    for (let gripIndex = 0; gripIndex < DATA.gripCenters.length; gripIndex++) {
      if (DATA.grip2Face[gripIndex] !== faceIndex || DATA.gripSymmetryOrders[gripIndex] !== 4) {
        continue;
      }

      const gripCenter = DATA.gripCenters[gripIndex];
      const axisIndex = getGripAxisIndex(gripCenter, fixedAxis);
      const entry = optionsByAxis.get(axisIndex) ?? { positive: null, negative: null };

      if (gripCenter[axisIndex] > 0) {
        entry.positive = gripIndex;
      } else {
        entry.negative = gripIndex;
      }

      optionsByAxis.set(axisIndex, entry);
    }

    return [...optionsByAxis.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([axisIndex, entry]) => {
        if (entry.positive == null || entry.negative == null) {
          throw new Error(`Incomplete twist axis ${axisIndex} for face ${faceIndex}`);
        }

        return {
          axisIndex,
          label: AXIS_LABELS[axisIndex],
          gripIndex: entry.positive,
          oppositeGripIndex: entry.negative,
        };
      });
  });
}

function getFaceFixedAxis(faceIndex: number): number {
  const faceCenter = DATA.faceCenters[faceIndex];
  let bestAxis = 0;
  let bestValue = 0;

  for (let axisIndex = 0; axisIndex < faceCenter.length; axisIndex++) {
    const value = Math.abs(faceCenter[axisIndex]);
    if (value > bestValue) {
      bestAxis = axisIndex;
      bestValue = value;
    }
  }

  return bestAxis;
}

function getGripAxisIndex(gripCenter: readonly number[], fixedAxis: number): number {
  for (let axisIndex = 0; axisIndex < gripCenter.length; axisIndex++) {
    if (axisIndex === fixedAxis) {
      continue;
    }
    if (Math.abs(gripCenter[axisIndex]) > 0.5) {
      return axisIndex;
    }
  }

  throw new Error(`Unable to resolve twist axis for fixed axis ${fixedAxis}`);
}

function getTwistMatrix(gripIndex: number, dir: MagicCube4DTwistDirection, fraction: number): Mat4 {
  const order = DATA.gripSymmetryOrders[gripIndex];
  const angle = dir * ((2 * Math.PI) / order) * fraction;
  const useful = DATA.gripUsefulMats[gripIndex] as Mat4;
  return mulRowMat4(
    transpose4(useful),
    mulRowMat4(planeRotation4Row(ROW_ROT_AXIS_A, ROW_ROT_AXIS_B, angle), useful),
  );
}

function getNumSlicesForGrip(gripIndex: number): number {
  const faceIndex = DATA.grip2Face[gripIndex];
  return DATA.faceCutOffsets[faceIndex].length + 1;
}

function getTwistDestinations(gripIndex: number, dir: MagicCube4DTwistDirection): number[] {
  const key = `${gripIndex}:${dir}`;
  const cached = twistDestinationCache.get(key);
  if (cached) {
    return cached;
  }

  const twistMat = getTwistMatrix(gripIndex, dir, 1);
  const destinations = DATA.stickerCenters.map((center, stickerIndex) => (
    findClosestStickerIndex(mulRowVec4(center as Vec4, twistMat), stickerIndex, gripIndex, dir)
  ));

  const seen = new Set<number>();
  for (let stickerIndex = 0; stickerIndex < destinations.length; stickerIndex++) {
    const destination = destinations[stickerIndex];
    if (seen.has(destination)) {
      throw new Error(`Duplicate destination ${destination} for grip ${gripIndex} dir ${dir}`);
    }
    seen.add(destination);
  }

  twistDestinationCache.set(key, destinations);
  return destinations;
}

function getCubeRotationDestinations(axisIndex: 0 | 1 | 2, dir: -1 | 1): number[] {
  const key = `${axisIndex}:${dir}`;
  const cached = cubeRotationDestinationCache.get(key);
  if (cached) {
    return cached;
  }

  const rotation = buildRotationForAxis(axisIndex, dir * (Math.PI / 2));
  const destinations = DATA.stickerCenters.map((center, stickerIndex) => (
    findClosestStickerIndex(
      mulRowVec4(center as Vec4, rotation),
      stickerIndex,
      axisIndex,
      dir,
    )
  ));

  const seen = new Set<number>();
  for (let stickerIndex = 0; stickerIndex < destinations.length; stickerIndex++) {
    const destination = destinations[stickerIndex];
    if (seen.has(destination)) {
      throw new Error(`Duplicate destination ${destination} for axis ${axisIndex} dir ${dir}`);
    }
    seen.add(destination);
  }

  cubeRotationDestinationCache.set(key, destinations);
  return destinations;
}

function findClosestStickerIndex(target: Vec4, stickerIndex: number, gripIndex: number, dir: MagicCube4DTwistDirection): number {
  let bestIndex = -1;
  let bestDistance = Infinity;

  for (let candidateIndex = 0; candidateIndex < DATA.stickerCenters.length; candidateIndex++) {
    const distance = distanceSquared(target, DATA.stickerCenters[candidateIndex] as Vec4);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = candidateIndex;
    }
  }

  if (bestIndex < 0 || bestDistance > 1e-4) {
    throw new Error(
      `Missing destination for sticker ${stickerIndex} grip ${gripIndex} dir ${dir}; nearest distance ${bestDistance}`,
    );
  }

  return bestIndex;
}

function makeRowRotMatThatSlerps(fromInput: Vec4, toInput: Vec4, t: number): Mat4 {
  let from = normalize4(fromInput);
  let to = normalize4(toInput);

  if (1 + distanceSquared(from, to) === 1) {
    return identity4();
  }

  if (1 + distanceSquared(from, scale4(to, -1)) === 1) {
    let axis: Axis4 = 0;
    for (const candidate of [1, 2, 3] as const) {
      if (from[candidate] * from[candidate] < from[axis] * from[axis]) {
        axis = candidate;
      }
    }

    const waypoint: Vec4 = [0, 0, 0, 0];
    waypoint[axis] = 1;
    const basis = gramSchmidtRows([from, waypoint, randomVec4(1), randomVec4(2)]);
    to = basis[1];
    t *= 2;
  }

  const basis = gramSchmidtRows([from, to, randomVec4(3), randomVec4(4)]);
  basis[3] = normalize4(cross4(basis[0], basis[1], basis[2]));

  const angle = t * angleBetweenUnitVectors(from, to);
  const xyRot = planeRotation4Row(0, 1, angle);

  return mulRowMat4(
    transpose4(basis as Mat4),
    mulRowMat4(xyRot, basis as Mat4),
  );
}

function isStickerInSliceMask(point: Vec4, sliceMask: number, cutNormal: Vec4, cutOffsets: readonly number[]): boolean {
  const normalizedMask = normalizeSliceMask(sliceMask);
  const pointHeight = dot4(point, cutNormal);
  let sliceIndex = 0;
  while (sliceIndex < cutOffsets.length && pointHeight > cutOffsets[sliceIndex]) {
    sliceIndex++;
  }
  return (normalizedMask & (1 << sliceIndex)) !== 0;
}

function planeRotation4Row(axisA: 0 | 1 | 2 | 3, axisB: 0 | 1 | 2 | 3, angle: number): Mat4 {
  const c = snapUnit(Math.cos(angle));
  const s = snapUnit(Math.sin(angle));
  const matrix: Mat4 = [
    [1, 0, 0, 0],
    [0, 1, 0, 0],
    [0, 0, 1, 0],
    [0, 0, 0, 1],
  ];
  matrix[axisA][axisA] = c;
  matrix[axisA][axisB] = s;
  matrix[axisB][axisA] = -s;
  matrix[axisB][axisB] = c;
  return matrix;
}

function transpose4(matrix: Mat4): Mat4 {
  return [
    [matrix[0][0], matrix[1][0], matrix[2][0], matrix[3][0]],
    [matrix[0][1], matrix[1][1], matrix[2][1], matrix[3][1]],
    [matrix[0][2], matrix[1][2], matrix[2][2], matrix[3][2]],
    [matrix[0][3], matrix[1][3], matrix[2][3], matrix[3][3]],
  ];
}

function identity4(): Mat4 {
  return [
    [1, 0, 0, 0],
    [0, 1, 0, 0],
    [0, 0, 1, 0],
    [0, 0, 0, 1],
  ];
}

function snapUnit(value: number): number {
  if (Math.abs(value) < EPSILON) {
    return 0;
  }
  if (Math.abs(value - 1) < EPSILON) {
    return 1;
  }
  if (Math.abs(value + 1) < EPSILON) {
    return -1;
  }
  return value;
}

function distanceSquared(a: Vec4, b: Vec4): number {
  return (
    (a[0] - b[0]) ** 2 +
    (a[1] - b[1]) ** 2 +
    (a[2] - b[2]) ** 2 +
    (a[3] - b[3]) ** 2
  );
}

function normalize4(v: Vec4): Vec4 {
  const length = Math.hypot(v[0], v[1], v[2], v[3]) || 1;
  return [v[0] / length, v[1] / length, v[2] / length, v[3] / length];
}

function angleBetweenUnitVectors(a: Vec4, b: Vec4): number {
  const d = Math.max(-1, Math.min(1, dot4(a, b)));
  return Math.acos(d);
}

function gramSchmidtRows(rows: Vec4[]): Vec4[] {
  const out: Vec4[] = [];
  for (const row of rows) {
    let next = [...row] as Vec4;
    for (const existing of out) {
      next = sub4(next, scale4(existing, dot4(next, existing)));
    }
    const normalized = normalize4(next);
    if (Math.hypot(normalized[0], normalized[1], normalized[2], normalized[3]) > 1e-6) {
      out.push(normalized);
    }
  }
  while (out.length < 4) {
    const fallback: Vec4 = [0, 0, 0, 0];
    fallback[out.length as Axis4] = 1;
    let next = fallback;
    for (const existing of out) {
      next = sub4(next, scale4(existing, dot4(next, existing)));
    }
    out.push(normalize4(next));
  }
  return out.slice(0, 4);
}

function cross4(a: Vec4, b: Vec4, c: Vec4): Vec4 {
  return [
    det3([a[1], a[2], a[3]], [b[1], b[2], b[3]], [c[1], c[2], c[3]]),
    -det3([a[0], a[2], a[3]], [b[0], b[2], b[3]], [c[0], c[2], c[3]]),
    det3([a[0], a[1], a[3]], [b[0], b[1], b[3]], [c[0], c[1], c[3]]),
    -det3([a[0], a[1], a[2]], [b[0], b[1], b[2]], [c[0], c[1], c[2]]),
  ];
}

function det3(a: [number, number, number], b: [number, number, number], c: [number, number, number]): number {
  return (
    a[0] * (b[1] * c[2] - b[2] * c[1]) -
    a[1] * (b[0] * c[2] - b[2] * c[0]) +
    a[2] * (b[0] * c[1] - b[1] * c[0])
  );
}

function randomVec4(seed: number): Vec4 {
  return normalize4([
    Math.sin(seed * 12.9898),
    Math.sin(seed * 78.233 + 1),
    Math.sin(seed * 45.164 + 2),
    Math.sin(seed * 94.673 + 3),
  ]);
}

function dot4(a: Vec4, b: Vec4): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
}

function subtract3(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function cross3(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function dot3(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function normalize3(v: Vec3): Vec3 | null {
  const length = Math.hypot(v[0], v[1], v[2]);
  if (length < 1e-5) {
    return null;
  }
  return [v[0] / length, v[1] / length, v[2] / length];
}

function computeRestVerts(faceShrink: number, stickerShrink: number): Vec4[] {
  const verts = new Array<Vec4>(DATA.standardStickerVertsAtRest.length);
  for (let vertexIndex = 0; vertexIndex < DATA.standardStickerVertsAtRest.length; vertexIndex++) {
    const stickerIndex = vertexToSticker[vertexIndex];
    const vertex = DATA.standardStickerVertsAtRest[vertexIndex] as Vec4;
    if (stickerIndex < 0) {
      verts[vertexIndex] = [...vertex] as Vec4;
      continue;
    }

    const stickerCenter = DATA.stickerCenters[stickerIndex] as Vec4;
    const faceCenter = DATA.faceCenters[DATA.sticker2Face[stickerIndex]] as Vec4;
    const vertMinusStickerCenter = sub4(vertex, stickerCenter);
    const stickerCenterMinusFaceCenter = sub4(stickerCenter, faceCenter);
    verts[vertexIndex] = add4(
      scale4(add4(scale4(vertMinusStickerCenter, stickerShrink), stickerCenterMinusFaceCenter), faceShrink),
      faceCenter,
    );
  }
  return verts;
}

function applyPartialTwistToVerts(
  restVerts: Vec4[],
  animation: MagicCube4DTwistAnimation | null,
): Vec4[] {
  if (!animation) {
    return restVerts;
  }

  const twistMat = getTwistMatrix(animation.gripIndex, animation.dir, animation.progress);
  const moved = new Set<number>();
  const faceIndex = DATA.grip2Face[animation.gripIndex];
  const faceNormal = DATA.faceInwardNormals[faceIndex] as Vec4;
  const cutOffsets = DATA.faceCutOffsets[faceIndex];

  for (let stickerIndex = 0; stickerIndex < DATA.stickerCenters.length; stickerIndex++) {
    if (!isStickerInSliceMask(DATA.stickerCenters[stickerIndex] as Vec4, animation.sliceMask, faceNormal, cutOffsets)) {
      continue;
    }
    for (const polygon of DATA.stickerInds[stickerIndex]) {
      for (const vertexIndex of polygon) {
        moved.add(vertexIndex);
      }
    }
  }

  return restVerts.map((vertex, index) => (
    moved.has(index) ? mulRowVec4(vertex, twistMat) : vertex
  ));
}

function project4dVertexTo3d(vertex: Vec4, rotation4d: Mat4, eyeW: number): Vec4 {
  const rotated = mulRowVec4(vertex, rotation4d);
  const scaled = scale4(rotated, SCALE_4D);
  const w = eyeW - scaled[3];
  return [
    scaled[0] * eyeW / w,
    scaled[1] * eyeW / w,
    scaled[2] * eyeW / w,
    w,
  ];
}

function buildFrontCellStickerSet(verts: Vec4[]): number[] {
  const visible: number[] = [];

  for (let stickerIndex = 0; stickerIndex < DATA.stickerInds.length; stickerIndex++) {
    const sticker = DATA.stickerInds[stickerIndex];
    const v0 = verts[sticker[0][0]];
    const v1 = verts[sticker[0][1]];
    const v2 = verts[sticker[0][2]];
    const v3 = verts[sticker[1][0]];
    const a = subtract3(toVec3(v1), toVec3(v0));
    const b = subtract3(toVec3(v2), toVec3(v0));
    const c = subtract3(toVec3(v3), toVec3(v0));
    const volume = dot3(cross3(a, b), c);

    if (volume < 0) {
      visible.push(stickerIndex);
    }
  }

  return visible;
}

function resolveRenderSettings(settings?: MagicCube4DSettings): {
  faceShrink: number;
  stickerShrink: number;
  eyeW: number;
  scaleFudge2d: number;
} {
  return {
    faceShrink: DATA.faceShrink * (settings?.faceSpacing ?? 1),
    stickerShrink: DATA.stickerShrink / (settings?.stickerSpacing ?? 1),
    eyeW: DATA.eyeW * (settings?.projection4d ?? 1),
    scaleFudge2d: SCALE_FUDGE_2D * (settings?.projectionScale ?? 1),
  };
}

function project3dVertexTo2d(vertex: Vec4): Vec4 {
  const z = DATA.eyeZ - vertex[2];
  return [
    vertex[0] / z,
    vertex[1] / z,
    z,
    vertex[3],
  ];
}

function rotateProjected3d(vertex: Vec4, viewMatrix: Mat3): Vec4 {
  const rotated = mulVec(viewMatrix, [vertex[0], vertex[1], -vertex[2]]);
  return [rotated[0], rotated[1], -rotated[2], vertex[3]];
}

function isFrontFacing2dPolygon(verts: Vec4[], polygon: number[]): boolean {
  const v0 = verts[polygon[0]];
  const v1 = verts[polygon[1]];
  const v2 = verts[polygon[2]];
  const area = (v1[0] - v0[0]) * (v2[1] - v0[1]) - (v1[1] - v0[1]) * (v2[0] - v0[0]);
  return area > 0;
}

function computePolygonBrightness(verts: Vec4[], polygon: number[], sun: Vec3): number {
  const v0 = toVec3(verts[polygon[0]]);
  const v1 = toVec3(verts[polygon[1]]);
  const v2 = toVec3(verts[polygon[2]]);
  const normal = normalize3(cross3(subtract3(v1, v0), subtract3(v2, v0))) ?? [0, 0, 1];
  return Math.max(dot3(normal, sun), 0);
}

function averageDepth(verts: Vec4[], polygon: number[]): number {
  let sum = 0;
  for (const index of polygon) {
    sum += verts[index][2];
  }
  return sum / polygon.length;
}

function multiplyColor(hex: string, brightness: number): string {
  const normalized = hex.replace('#', '');
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  return `rgb(${Math.round(r * brightness)}, ${Math.round(g * brightness)}, ${Math.round(b * brightness)})`;
}

function toVec3(v: Vec4): Vec3 {
  return [v[0], v[1], v[2]];
}

function add4(a: Vec4, b: Vec4): Vec4 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2], a[3] + b[3]];
}

function sub4(a: Vec4, b: Vec4): Vec4 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2], a[3] - b[3]];
}

function scale4(v: Vec4, scalar: number): Vec4 {
  return [v[0] * scalar, v[1] * scalar, v[2] * scalar, v[3] * scalar];
}
