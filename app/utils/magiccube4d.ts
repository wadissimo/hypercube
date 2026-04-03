import { MAGICCUBE4D_HYPERCUBE_DATA } from './magiccube4dData';
import { mulVec, type Mat3, type Vec3 } from './math3d';

export type Vec4 = [number, number, number, number];
export type Mat4 = [Vec4, Vec4, Vec4, Vec4];
type Axis4 = 0 | 1 | 2 | 3;

export interface MagicCube4DTwistAnimation {
  gripIndex: number;
  dir: 1 | -1;
  sliceMask: number;
  progress: number;
}

export interface MagicCube4DStickerGeometry {
  stickerIndex: number;
  color: string;
  polygons: Vec3[][];
}

export interface MagicCube4DFramePolygon {
  stickerIndex: number;
  color: string;
  points: [number, number][];
  depth: number;
}

export interface MagicCube4DFrame {
  polygons: MagicCube4DFramePolygon[];
}

interface FaceDisplayState {
  center4d: Vec4;
  center3d: Vec3;
  offset3d: Vec3;
  visible: boolean;
  axisBasis: Partial<Record<Axis4, Vec3>>;
}

const DATA = MAGICCUBE4D_HYPERCUBE_DATA;
const SCALE_4D = 1 / DATA.circumRadius;
const EPSILON = 1e-6;
const MODEL_RADIUS = 2.95;
const ROW_ROT_AXIS_A: 2 = 2;
const ROW_ROT_AXIS_B: 3 = 3;
const DISPLAY_CAMERA_W = 6.8;
const INNER_CELL_SCALE = 0.92;
const SIDE_CELL_SCALE = 0.9;
const SIDE_EXPLODED_DISTANCE = 2.15;
const SCALE_FUDGE_2D = 4.7;

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
export const MAGICCUBE4D_INITIAL_VIEW = DATA.niceView as Mat4;

const numColorsByCubie = buildNumColorsByCubie();
const vertexToSticker = buildVertexToSticker();
const stickerGripMap = DATA.stickerCenters.map((center, stickerIndex) => getClosestGrip(
  center as Vec4,
  DATA.sticker2Face[stickerIndex],
  stickerIndex,
));

export function createSolvedMagicCube4DState(): number[] {
  return [...DATA.sticker2Face];
}

export function getStickerFaceIndex(stickerIndex: number): number {
  return DATA.sticker2Face[stickerIndex];
}

export function getStickerGripIndex(stickerIndex: number): number {
  return stickerGripMap[stickerIndex];
}

export function getGripOrder(gripIndex: number): number {
  return DATA.gripSymmetryOrders[gripIndex];
}

export function getFaceCenter(faceIndex: number): Vec4 {
  return [...DATA.faceCenters[faceIndex]] as Vec4;
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
    const sliceMask = MAGICCUBE4D_SLICE_BITS[Math.floor(Math.random() * MAGICCUBE4D_SLICE_BITS.length)];
    state = applyTwistToState(state, grip, dir, sliceMask);
    lastGrip = grip;
  }

  return state;
}

export function applyTwistToState(
  state: number[],
  gripIndex: number,
  dir: 1 | -1,
  sliceMask: number,
): number[] {
  const normalizedMask = normalizeSliceMask(sliceMask);
  const next = [...state];
  const twistMat = getTwistMatrix(gripIndex, dir, 1);
  const faceIndex = DATA.grip2Face[gripIndex];
  const faceNormal = DATA.faceInwardNormals[faceIndex] as Vec4;
  const cutOffsets = DATA.faceCutOffsets[faceIndex];
  const indexLookup = new Map<string, number>();

  for (let i = 0; i < DATA.stickerCenters.length; i++) {
    indexLookup.set(hashVec4(DATA.stickerCenters[i] as Vec4), i);
  }

  for (let stickerIndex = 0; stickerIndex < state.length; stickerIndex++) {
    const center = DATA.stickerCenters[stickerIndex] as Vec4;
    if (!isStickerInSliceMask(center, normalizedMask, faceNormal, cutOffsets)) {
      next[stickerIndex] = state[stickerIndex];
      continue;
    }

    const destination = indexLookup.get(hashVec4(mulRowVec4(center, twistMat)));
    if (destination == null) {
      throw new Error(`Missing destination for sticker ${stickerIndex}`);
    }
    next[destination] = state[stickerIndex];
  }

  return next;
}

export function buildStickerGeometry(
  state: number[],
  rotation4d: Mat4,
  animation: MagicCube4DTwistAnimation | null,
): MagicCube4DStickerGeometry[] {
  const activeFace = animation ? DATA.grip2Face[animation.gripIndex] : null;
  const activeNormal = activeFace == null ? null : DATA.faceInwardNormals[activeFace] as Vec4;
  const activeOffsets = activeFace == null ? null : DATA.faceCutOffsets[activeFace];
  const twistMat = animation ? getTwistMatrix(animation.gripIndex, animation.dir, animation.progress) : null;
  const stickerPolygons = DATA.stickerInds;
  const stickerVerts = DATA.standardStickerVertsAtRest;
  const displayStates = createFaceDisplayStates(rotation4d);

  const geometries: {
    stickerIndex: number;
    color: string;
    polygons: Vec3[][];
  }[] = [];
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;

  for (let stickerIndex = 0; stickerIndex < stickerPolygons.length; stickerIndex++) {
    const faceIndex = DATA.sticker2Face[stickerIndex];
    const display = displayStates.get(faceIndex);
    if (!display || !display.visible) {
      continue;
    }

    const affected = !!(animation && activeNormal && activeOffsets && isStickerInSliceMask(
      DATA.stickerCenters[stickerIndex] as Vec4,
      animation.sliceMask,
      activeNormal,
      activeOffsets,
    ));

    const projectedPolygons = stickerPolygons[stickerIndex].map(poly => (
      orientPolygon(poly.map(vertexIndex => projectDisplayVertex(
        stickerVerts[vertexIndex] as Vec4,
        display,
        affected ? twistMat : null,
      )), add3(display.center3d, display.offset3d))
    ));

    for (const polygon of projectedPolygons) {
      for (const point of polygon) {
        minX = Math.min(minX, point[0]);
        minY = Math.min(minY, point[1]);
        minZ = Math.min(minZ, point[2]);
        maxX = Math.max(maxX, point[0]);
        maxY = Math.max(maxY, point[1]);
        maxZ = Math.max(maxZ, point[2]);
      }
    }

    geometries.push({
      stickerIndex,
      color: MAGICCUBE4D_FACE_COLORS[state[stickerIndex]],
      polygons: projectedPolygons,
    });
  }

  if (geometries.length === 0) {
    return [];
  }

  const center: Vec3 = [
    (minX + maxX) / 2,
    (minY + maxY) / 2,
    (minZ + maxZ) / 2,
  ];
  const radius = Math.max(maxX - minX, maxY - minY, maxZ - minZ, 0.001);
  const scale = MODEL_RADIUS / radius;

  return geometries.map(geometry => ({
    ...geometry,
    polygons: geometry.polygons.map(polygon => polygon.map(point => [
      (point[0] - center[0]) * scale,
      (point[1] - center[1]) * scale,
      (point[2] - center[2]) * scale,
    ] as Vec3)),
  }));
}

export function buildMagicCube4DFrame(
  state: number[],
  rotation4d: Mat4,
  viewMatrix: Mat3,
  animation: MagicCube4DTwistAnimation | null,
  width: number,
  height: number,
  zoomScale = 1,
): MagicCube4DFrame {
  if (width <= 0 || height <= 0) {
    return { polygons: [] };
  }

  const baseVerts = computeRestVerts(DATA.faceShrink, DATA.stickerShrink);
  const verts = applyPartialTwistToVerts(baseVerts, animation);
  const projected3d = verts.map(vertex => rotateProjected3d(project4dVertexTo3d(vertex, rotation4d), viewMatrix));
  const frontCulledStickers = buildFrontCellStickerSet(projected3d);

  let radius3d = 0;
  for (const stickerIndex of frontCulledStickers) {
    for (const polygon of DATA.stickerInds[stickerIndex]) {
      for (const vertexIndex of polygon) {
        const vertex = projected3d[vertexIndex];
        radius3d = Math.max(radius3d, Math.hypot(vertex[0], vertex[1], vertex[2]));
      }
    }
  }

  const minpix = Math.min(width, height);
  const xOff = (width > height ? (width - height) / 2 : 0) + minpix / 2;
  const yOff = (height > width ? (height - width) / 2 : 0) + minpix / 2;
  const polys2pixelsSF = minpix / (1.25 * Math.max(radius3d, 0.001));
  const viewScale = SCALE_FUDGE_2D * polys2pixelsSF * zoomScale;

  const verts2d = projected3d.map(project3dVertexTo2d);
  const sun = normalize3(DATA.sunVec as Vec3) ?? [0, 0, 1];

  const polygons: MagicCube4DFramePolygon[] = [];

  for (const stickerIndex of frontCulledStickers) {
    const faceColor = DATA.defaultFaceColors[state[stickerIndex] % DATA.defaultFaceColors.length];

    for (const polygon of DATA.stickerInds[stickerIndex]) {
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

export function chooseFaceRotationToCenter(currentView: Mat4, faceIndex: number): { axis: 0 | 1 | 2; angle: number } | null {
  const center = mulRowVec4(getFaceCenter(faceIndex), currentView);
  if (center[3] < -0.9) {
    return null;
  }

  let best: { axis: 0 | 1 | 2; angle: number; score: number } | null = null;
  for (const axis of [0, 1, 2] as const) {
    if (Math.abs(center[axis]) < 0.2) {
      continue;
    }

    for (const angle of [Math.PI / 2, -Math.PI / 2] as const) {
      const rotated = mulRowVec4(center, buildRotationForAxis(axis, angle));
      const score = (-rotated[3] * 10) - (Math.abs(rotated[0]) + Math.abs(rotated[1]) + Math.abs(rotated[2]));
      if (!best || score > best.score) {
        best = { axis, angle, score };
      }
    }
  }

  return best ? { axis: best.axis, angle: best.angle } : null;
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
  const gripDim = 4 - (numColorsByCubie.get(cubie) ?? 1);
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

function getTwistMatrix(gripIndex: number, dir: 1 | -1, fraction: number): Mat4 {
  const order = DATA.gripSymmetryOrders[gripIndex];
  const angle = dir * ((2 * Math.PI) / order) * fraction;
  const useful = DATA.gripUsefulMats[gripIndex] as Mat4;
  return mulRowMat4(
    transpose4(useful),
    mulRowMat4(planeRotation4Row(ROW_ROT_AXIS_A, ROW_ROT_AXIS_B, angle), useful),
  );
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

function projectDisplayVertex(point: Vec4, display: FaceDisplayState, twistMat: Mat4 | null): Vec3 {
  const twisted = twistMat ? mulRowVec4(point, twistMat) : point;
  let projected = add3(display.center3d, display.offset3d);
  const deltas: Vec4 = [
    twisted[0] - display.center4d[0],
    twisted[1] - display.center4d[1],
    twisted[2] - display.center4d[2],
    twisted[3] - display.center4d[3],
  ];

  for (const axis of [0, 1, 2, 3] as const) {
    const basis = display.axisBasis[axis];
    if (!basis) {
      continue;
    }
    projected = add3(projected, scale3(basis, deltas[axis]));
  }

  return projected;
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

function hashVec4(vector: Vec4): string {
  return vector.map(value => Math.round(value * 1e6)).join(':');
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

function add3(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function subtract3(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function scale3(v: Vec3, scalar: number): Vec3 {
  return [v[0] * scalar, v[1] * scalar, v[2] * scalar];
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

function createFaceDisplayStates(rotation4d: Mat4): Map<number, FaceDisplayState> {
  const entries = DATA.faceCenters.map((center, faceIndex) => {
    const center4d = center as Vec4;
    const rotatedCenter4d = mulRowVec4(center4d, rotation4d);
    const projectedCenter3d = project4dTo3d([
      rotatedCenter4d[0] * SCALE_4D,
      rotatedCenter4d[1] * SCALE_4D,
      rotatedCenter4d[2] * SCALE_4D,
      rotatedCenter4d[3] * SCALE_4D,
    ], DISPLAY_CAMERA_W);
    const fixedAxis = faceFixedAxis(faceIndex);
    const localAxes = ([0, 1, 2, 3] as const).filter(axis => axis !== fixedAxis) as Axis4[];
    const rawBasis = localAxes.map(axis => projectAxisBasis(center4d, rotation4d, axis)) as [Vec3, Vec3, Vec3];

    return {
      faceIndex,
      center4d,
      rotatedCenter4d,
      projectedCenter3d,
      localAxes,
      rawBasis,
    };
  }).sort((a, b) => a.rotatedCenter4d[3] - b.rotatedCenter4d[3]);

  const inner = entries[0];
  const outerFace = entries[entries.length - 1]?.faceIndex;
  const innerCenter = inner?.projectedCenter3d ?? [0, 0, 0] as Vec3;
  const innerBasisLength = inner ? averageLength(inner.rawBasis) * INNER_CELL_SCALE : 1;
  const result = new Map<number, FaceDisplayState>();

  for (const entry of entries) {
    const isInner = entry.faceIndex === inner?.faceIndex;
    const targetLength = innerBasisLength * (isInner ? 1 : SIDE_CELL_SCALE / INNER_CELL_SCALE);
    const rigidBasis = buildRigidBasis(entry.rawBasis, targetLength);
    const axisBasis: Partial<Record<Axis4, Vec3>> = {};

    for (let i = 0; i < entry.localAxes.length; i++) {
      axisBasis[entry.localAxes[i]] = rigidBasis[i];
    }

    result.set(entry.faceIndex, {
      center4d: entry.center4d,
      center3d: entry.projectedCenter3d,
      offset3d: explodeOffset(subtract3(entry.projectedCenter3d, innerCenter), isInner ? 0 : SIDE_EXPLODED_DISTANCE),
      visible: entry.faceIndex !== outerFace,
      axisBasis,
    });
  }

  return result;
}

function faceFixedAxis(faceIndex: number): Axis4 {
  const center = DATA.faceCenters[faceIndex];
  let bestAxis: 0 | 1 | 2 | 3 = 0;
  let bestValue = 0;

  for (const axis of [0, 1, 2, 3] as const) {
    const value = Math.abs(center[axis]);
    if (value > bestValue) {
      bestValue = value;
      bestAxis = axis;
    }
  }

  return bestAxis;
}

function projectAxisBasis(center4d: Vec4, rotation4d: Mat4, axis: Axis4): Vec3 {
  const unit = [0, 0, 0, 0] as Vec4;
  unit[axis] = 1;
  const plus = project4dTo3d(scale4(mulRowVec4(add4(center4d, unit), rotation4d), SCALE_4D), DISPLAY_CAMERA_W);
  const minus = project4dTo3d(scale4(mulRowVec4(sub4(center4d, unit), rotation4d), SCALE_4D), DISPLAY_CAMERA_W);
  return scale3(subtract3(plus, minus), 0.5);
}

function buildRigidBasis(rawBasis: [Vec3, Vec3, Vec3], targetLength: number): [Vec3, Vec3, Vec3] {
  const first = normalize3(rawBasis[0]) ?? [1, 0, 0];
  const secondBase = subtract3(rawBasis[1], scale3(first, dot3(rawBasis[1], first)));
  const second = normalize3(secondBase)
    ?? normalize3(perpendicular3(first))
    ?? [0, 1, 0];
  const thirdBase = subtract3(
    subtract3(rawBasis[2], scale3(first, dot3(rawBasis[2], first))),
    scale3(second, dot3(rawBasis[2], second)),
  );
  const third = normalize3(thirdBase)
    ?? normalize3(cross3(first, second))
    ?? [0, 0, 1];

  return [
    scale3(first, targetLength),
    scale3(second, targetLength),
    scale3(third, targetLength),
  ];
}

function orientPolygon(points: Vec3[], referenceCenter: Vec3): Vec3[] {
  if (points.length < 3) {
    return points;
  }

  const polygonCenter = average3(points);
  const normal = cross3(subtract3(points[1], points[0]), subtract3(points[2], points[0]));
  const outward = subtract3(polygonCenter, referenceCenter);
  return dot3(normal, outward) >= 0 ? points : [...points].reverse();
}

function average3(points: Vec3[]): Vec3 {
  const inv = 1 / points.length;
  return [
    points.reduce((sum, point) => sum + point[0], 0) * inv,
    points.reduce((sum, point) => sum + point[1], 0) * inv,
    points.reduce((sum, point) => sum + point[2], 0) * inv,
  ];
}

function averageLength(points: Vec3[]): number {
  return points.reduce((sum, point) => sum + Math.hypot(point[0], point[1], point[2]), 0) / points.length;
}

function normalize3(v: Vec3): Vec3 | null {
  const length = Math.hypot(v[0], v[1], v[2]);
  if (length < 1e-5) {
    return null;
  }
  return [v[0] / length, v[1] / length, v[2] / length];
}

function perpendicular3(v: Vec3): Vec3 {
  return Math.abs(v[0]) < 0.7 ? [0, -v[2], v[1]] : [-v[1], v[0], 0];
}

function explodeOffset(v: Vec3, magnitude: number): Vec3 {
  if (magnitude <= 0) {
    return [0, 0, 0];
  }
  const radial = normalizeScreenRadial(v);
  return radial ? scale3(radial, magnitude) : [0, 0, 0];
}

function normalizeScreenRadial(v: Vec3): Vec3 | null {
  const length = Math.hypot(v[0], v[1]);
  if (length < 1e-5) {
    return null;
  }
  return [v[0] / length, v[1] / length, 0];
}

function project4dTo3d(point: Vec4, cameraW: number): Vec3 {
  const denominator = Math.max(cameraW - point[3], 0.35);
  const scale = cameraW / denominator;
  return [point[0] * scale, point[1] * scale, point[2] * scale];
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

function project4dVertexTo3d(vertex: Vec4, rotation4d: Mat4): Vec4 {
  const rotated = mulRowVec4(vertex, rotation4d);
  const scaled = scale4(rotated, SCALE_4D);
  const w = DATA.eyeW - scaled[3];
  return [
    scaled[0] * DATA.eyeW / w,
    scaled[1] * DATA.eyeW / w,
    scaled[2] * DATA.eyeW / w,
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
