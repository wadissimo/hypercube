import type { Vec2 } from './math3d';
import type { Vec4 } from './math4d';

export type HyperAxis = 'x' | 'y' | 'z' | 'w';
export type HyperSign = -1 | 1;

export interface HyperCell {
  id: string;
  fixedAxis: HyperAxis;
  fixedSign: HyperSign;
  color: string;
}

export interface HyperCubieFaceDef {
  vertexIndices: [number, number, number, number];
  isShellFace: boolean;
  localAxis: HyperAxis;
  localSign: HyperSign;
}

export interface HyperCubieDef {
  id: number;
  cellId: string;
  color: string;
  localCoords: [number, number, number];
  localAxes: [HyperAxis, HyperAxis, HyperAxis];
  vertices4D: [Vec4, Vec4, Vec4, Vec4, Vec4, Vec4, Vec4, Vec4];
  faces: HyperCubieFaceDef[];
}

export interface HyperPreviewHitFace {
  cubieId: number;
  faceIndex: number;
  isShellFace: boolean;
  quad: [Vec2, Vec2, Vec2, Vec2];
  regions: Vec2[][][];
  z: number;
}

export const HYPER_AXES: HyperAxis[] = ['x', 'y', 'z', 'w'];

const GRID_COORDS = [-1, 0, 1] as const;
export const FIXED_COORD = 1.5;
const BASE_CUBIE_HALF = 0.31;

export const HYPERCUBE_CELLS: HyperCell[] = [
  { id: 'w+', fixedAxis: 'w', fixedSign: 1, color: '#FF4FBF' },
  { id: 'w-', fixedAxis: 'w', fixedSign: -1, color: '#8B5CF6' },
  { id: 'y-', fixedAxis: 'y', fixedSign: -1, color: '#FFFFFF' },
  { id: 'y+', fixedAxis: 'y', fixedSign: 1, color: '#FFD500' },
  { id: 'z+', fixedAxis: 'z', fixedSign: 1, color: '#00A651' },
  { id: 'z-', fixedAxis: 'z', fixedSign: -1, color: '#1E5EFF' },
  { id: 'x+', fixedAxis: 'x', fixedSign: 1, color: '#FF8A1C' },
  { id: 'x-', fixedAxis: 'x', fixedSign: -1, color: '#D7263D' },
];

export const HYPERCUBE_CELL_BY_ID: Record<string, HyperCell> = Object.fromEntries(
  HYPERCUBE_CELLS.map(cell => [cell.id, cell]),
);

const LOCAL_FACE_DEFS: { coordIndex: 0 | 1 | 2; sign: HyperSign; vertexIndices: [number, number, number, number] }[] = [
  { coordIndex: 2, sign: -1, vertexIndices: [0, 3, 2, 1] },
  { coordIndex: 2, sign: 1, vertexIndices: [4, 5, 6, 7] },
  { coordIndex: 0, sign: -1, vertexIndices: [0, 4, 7, 3] },
  { coordIndex: 0, sign: 1, vertexIndices: [1, 2, 6, 5] },
  { coordIndex: 1, sign: -1, vertexIndices: [0, 1, 5, 4] },
  { coordIndex: 1, sign: 1, vertexIndices: [3, 7, 6, 2] },
];

export const HYPERCUBE_PREVIEW_CUBIES: HyperCubieDef[] = createHypercubePreviewCubies();

export function cloneHypercubeCubies(): HyperCubieDef[] {
  return HYPERCUBE_PREVIEW_CUBIES.map(cubie => ({
    ...cubie,
    localCoords: [...cubie.localCoords] as [number, number, number],
    localAxes: [...cubie.localAxes] as [HyperAxis, HyperAxis, HyperAxis],
    vertices4D: cubie.vertices4D.map(vertex => [...vertex] as Vec4) as HyperCubieDef['vertices4D'],
    faces: cubie.faces.map(face => ({ ...face })),
  }));
}

export function hyperCellCenter4D(cell: HyperCell): Vec4 {
  return point4({ [cell.fixedAxis]: cell.fixedSign * FIXED_COORD });
}

export function hyperCellCenterById(cellId: string): Vec4 {
  return hyperCellCenter4D(hyperCellById(cellId));
}

export function hyperCellById(cellId: string): HyperCell {
  const cell = HYPERCUBE_CELL_BY_ID[cellId];
  if (!cell) {
    throw new Error(`Unknown hypercube cell: ${cellId}`);
  }

  return cell;
}

export function hyperCellIdFromCenter(center: Vec4): string {
  let bestAxis: HyperAxis = 'w';
  let bestValue = -Infinity;

  for (const axis of HYPER_AXES) {
    const value = Math.abs(center[axisIndex(axis)]);
    if (value > bestValue) {
      bestValue = value;
      bestAxis = axis;
    }
  }

  const sign: HyperSign = center[axisIndex(bestAxis)] < 0 ? -1 : 1;
  return `${bestAxis}${sign > 0 ? '+' : '-'}`;
}

function createHypercubePreviewCubies(): HyperCubieDef[] {
  const cubies: HyperCubieDef[] = [];
  let id = 0;

  for (const cell of HYPERCUBE_CELLS) {
    const cellAxes = HYPER_AXES.filter(axis => axis !== cell.fixedAxis) as [HyperAxis, HyperAxis, HyperAxis];

    for (const a of GRID_COORDS) {
      for (const b of GRID_COORDS) {
        for (const c of GRID_COORDS) {
          const localCoords: [number, number, number] = [a, b, c];
          cubies.push({
            id: id++,
            cellId: cell.id,
            color: cell.color,
            localCoords,
            localAxes: cellAxes,
            vertices4D: buildCubieVertices4D(
              point4({
                [cell.fixedAxis]: cell.fixedSign * FIXED_COORD,
                [cellAxes[0]]: a,
                [cellAxes[1]]: b,
                [cellAxes[2]]: c,
              }),
              cellAxes,
              BASE_CUBIE_HALF,
            ),
            faces: LOCAL_FACE_DEFS.map(face => ({
              vertexIndices: face.vertexIndices,
              isShellFace: localCoords[face.coordIndex] === face.sign,
              localAxis: cellAxes[face.coordIndex],
              localSign: face.sign,
            })),
          });
        }
      }
    }
  }

  return cubies;
}

function buildCubieVertices4D(
  center: Vec4,
  axes: [HyperAxis, HyperAxis, HyperAxis],
  cubieHalf: number,
): [Vec4, Vec4, Vec4, Vec4, Vec4, Vec4, Vec4, Vec4] {
  const axis0 = axisVector(axes[0], cubieHalf);
  const axis1 = axisVector(axes[1], cubieHalf);
  const axis2 = axisVector(axes[2], cubieHalf);

  return [
    add4(center, negate4(add4(add4(axis0, axis1), axis2))),
    add4(center, add4(axis0, negate4(add4(axis1, axis2)))),
    add4(center, add4(add4(axis0, axis1), negate4(axis2))),
    add4(center, add4(negate4(axis0), add4(axis1, negate4(axis2)))),
    add4(center, add4(add4(negate4(axis0), negate4(axis1)), axis2)),
    add4(center, add4(add4(axis0, negate4(axis1)), axis2)),
    add4(center, add4(add4(axis0, axis1), axis2)),
    add4(center, add4(add4(negate4(axis0), axis1), axis2)),
  ];
}

function axisVector(axis: HyperAxis, magnitude: number): Vec4 {
  switch (axis) {
    case 'x':
      return [magnitude, 0, 0, 0];
    case 'y':
      return [0, magnitude, 0, 0];
    case 'z':
      return [0, 0, magnitude, 0];
    case 'w':
      return [0, 0, 0, magnitude];
  }
}

function point4(values: Partial<Record<HyperAxis, number>>): Vec4 {
  return [values.x ?? 0, values.y ?? 0, values.z ?? 0, values.w ?? 0];
}

function add4(a: Vec4, b: Vec4): Vec4 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2], a[3] + b[3]];
}

function negate4(v: Vec4): Vec4 {
  return [-v[0], -v[1], -v[2], -v[3]];
}

export function axisIndex(axis: HyperAxis): 0 | 1 | 2 | 3 {
  switch (axis) {
    case 'x':
      return 0;
    case 'y':
      return 1;
    case 'z':
      return 2;
    case 'w':
      return 3;
  }
}
