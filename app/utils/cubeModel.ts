import type { Vec3, Mat3 } from './math3d';
import { mulVec, rotX, rotY, rotZ } from './math3d';
import { CUBE_3D_TOPOLOGY } from './puzzleTopology';

export type Face = 'U' | 'D' | 'R' | 'L' | 'F' | 'B';
export type Axis = 'x' | 'y' | 'z';
export type CubeSize = 2 | 3 | 4 | 5;

export interface Cubie {
  position: Vec3;
  faces: Partial<Record<Face, Face>>;
}

export type CubeState = Cubie[];

export interface TwistAnimState {
  face: Face;
  clockwise: boolean;
  angle: number;
  layers: number[];
}

export const ALL_FACES: Face[] = ['U', 'D', 'L', 'R', 'F', 'B'];
export const SUPPORTED_CUBE_SIZES: CubeSize[] = [2, 3, 4, 5];

export const FACE_COLORS: Record<Face, string> = {
  U: '#FFFFFF',
  D: '#FFD500',
  R: '#B71234',
  L: '#FF5800',
  F: '#0046AD',
  B: '#009B48',
};

const FACE_VECTORS: Record<Face, Vec3> = {
  U: [0, 1, 0],
  D: [0, -1, 0],
  R: [1, 0, 0],
  L: [-1, 0, 0],
  F: [0, 0, 1],
  B: [0, 0, -1],
};

export function outerCoord(size: CubeSize): number {
  return (size - 1) / 2;
}

export function cubeCoords(size: CubeSize): number[] {
  const outer = outerCoord(size);
  return Array.from({ length: size }, (_, index) => index - outer);
}

export function faceSign(face: Face): number {
  return CUBE_3D_TOPOLOGY.faces[face].sign;
}

export function faceAxis(face: Face): Axis {
  return CUBE_3D_TOPOLOGY.faces[face].axis;
}

export function axisIndex(axis: Axis): number {
  switch (axis) {
    case 'x': return 0;
    case 'y': return 1;
    case 'z': return 2;
  }
}

/** Which axis index (0=x, 1=y, 2=z) does this face rotate around? */
export function faceAxisIndex(face: Face): number {
  return axisIndex(faceAxis(face));
}

export function faceVector(face: Face): Vec3 {
  return CUBE_3D_TOPOLOGY.faces[face].normal3D ?? FACE_VECTORS[face];
}

export function vectorToFace(vec: Vec3): Face {
  const [x, y, z] = vec;
  if (x === 1) return 'R';
  if (x === -1) return 'L';
  if (y === 1) return 'U';
  if (y === -1) return 'D';
  if (z === 1) return 'F';
  return 'B';
}

export function axisCoord(position: Vec3, axis: Axis): number {
  return position[axisIndex(axis)];
}

export function faceAxisCoord(face: Face, position: Vec3): number {
  return axisCoord(position, faceAxis(face));
}

/** Compute the layer coordinates for a face move */
export function faceLayers(face: Face, size: CubeSize, wide = false): number[] {
  const outer = outerCoord(size);
  const sign = faceSign(face);
  const outerLayer = sign * outer;
  if (!wide || size < 4) return [outerLayer];
  return [outerLayer, sign * (outer - 1)];
}

export function isOuterLayer(size: CubeSize, layer: number): boolean {
  return Math.abs(Math.abs(layer) - outerCoord(size)) < 0.01;
}

export function isAdjacentInnerLayer(size: CubeSize, layer: number): boolean {
  if (size < 4) return false;
  return Math.abs(Math.abs(layer) - (outerCoord(size) - 1)) < 0.01;
}

export function buildSwipeLayers(size: CubeSize, layer: number, isLongPress: boolean): number[] {
  const layers = [layer];
  if (size < 4) return layers;

  const outer = outerCoord(size);
  const sign = Math.sign(layer);
  if (isAdjacentInnerLayer(size, layer)) {
    layers.push(sign * outer);
  } else if (isOuterLayer(size, layer) && isLongPress) {
    layers.push(sign * (outer - 1));
  }

  return layers;
}

export function createSolvedCube(size: CubeSize = 3): CubeState {
  const coords = cubeCoords(size);
  const outer = outerCoord(size);
  const cubies: CubeState = [];
  for (const x of coords) {
    for (const y of coords) {
      for (const z of coords) {
        if (Math.abs(x) !== outer && Math.abs(y) !== outer && Math.abs(z) !== outer) continue;
        const faces: Partial<Record<Face, Face>> = {};
        if (y === outer) faces.U = 'U';
        if (y === -outer) faces.D = 'D';
        if (x === outer) faces.R = 'R';
        if (x === -outer) faces.L = 'L';
        if (z === outer) faces.F = 'F';
        if (z === -outer) faces.B = 'B';
        cubies.push({ position: [x, y, z], faces });
      }
    }
  }
  return cubies;
}

export function isInLayer(cubie: Cubie, face: Face, layers: number[]): boolean {
  const coord = faceAxisCoord(face, cubie.position);
  return layers.some(l => Math.abs(coord - l) < 0.01);
}

export function twistFace(
  state: CubeState, face: Face, clockwise: boolean, layers: number[],
): CubeState {
  return state.map(cubie => {
    if (!isInLayer(cubie, face, layers)) return cubie;
    return {
      position: rotatePosition(cubie.position, face, clockwise),
      faces: remapFaces(cubie.faces, face, clockwise),
    };
  });
}

export function twistRotationMatrix(face: Face, angle: number): Mat3 {
  switch (face) {
    case 'U': return rotY(-angle);
    case 'D': return rotY(angle);
    case 'R': return rotX(-angle);
    case 'L': return rotX(angle);
    case 'F': return rotZ(-angle);
    case 'B': return rotZ(angle);
  }
}

function rotatePosition(pos: Vec3, face: Face, cw: boolean): Vec3 {
  return rotateVec(pos, face, cw);
}

function remapFaces(
  faces: Partial<Record<Face, Face>>,
  face: Face,
  cw: boolean,
): Partial<Record<Face, Face>> {
  const result: Partial<Record<Face, Face>> = {};
  for (const [dir, color] of Object.entries(faces) as [Face, Face][]) {
    result[rotateFace(dir, face, cw)] = color;
  }
  return result;
}

function rotateFace(dir: Face, face: Face, cw: boolean): Face {
  return vectorToFace(rotateVec(FACE_VECTORS[dir], face, cw));
}

function rotateVec(vec: Vec3, face: Face, cw: boolean): Vec3 {
  const angle = (cw ? 1 : -1) * (Math.PI / 2);
  const rotated = mulVec(twistRotationMatrix(face, angle), vec);
  return [
    Math.round(rotated[0] * 2) / 2,
    Math.round(rotated[1] * 2) / 2,
    Math.round(rotated[2] * 2) / 2,
  ];
}
