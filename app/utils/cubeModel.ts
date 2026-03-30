import type { Vec3, Mat3 } from './math3d';
import { mulVec, rotX, rotY, rotZ } from './math3d';

export type Face = 'U' | 'D' | 'R' | 'L' | 'F' | 'B';

export interface Cubie {
  position: Vec3;
  faces: Partial<Record<Face, Face>>;
}

export type CubeState = Cubie[];

export interface TwistAnimState {
  face: Face;
  clockwise: boolean;
  angle: number;
}

export const ALL_FACES: Face[] = ['U', 'D', 'L', 'R', 'F', 'B'];

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

export function createSolvedCube(): CubeState {
  const cubies: CubeState = [];
  for (let x = -1; x <= 1; x++) {
    for (let y = -1; y <= 1; y++) {
      for (let z = -1; z <= 1; z++) {
        if (x === 0 && y === 0 && z === 0) continue;
        const faces: Partial<Record<Face, Face>> = {};
        if (y === 1) faces.U = 'U';
        if (y === -1) faces.D = 'D';
        if (x === 1) faces.R = 'R';
        if (x === -1) faces.L = 'L';
        if (z === 1) faces.F = 'F';
        if (z === -1) faces.B = 'B';
        cubies.push({ position: [x, y, z], faces });
      }
    }
  }
  return cubies;
}

export function isInLayer(cubie: Cubie, face: Face): boolean {
  const [x, y, z] = cubie.position;
  switch (face) {
    case 'U': return y === 1;
    case 'D': return y === -1;
    case 'R': return x === 1;
    case 'L': return x === -1;
    case 'F': return z === 1;
    case 'B': return z === -1;
  }
}

export function twistFace(state: CubeState, face: Face, clockwise: boolean): CubeState {
  return state.map(cubie => {
    if (!isInLayer(cubie, face)) return cubie;
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
    case 'R': return rotX(angle);
    case 'L': return rotX(-angle);
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
    Math.round(rotated[0]),
    Math.round(rotated[1]),
    Math.round(rotated[2]),
  ];
}

function vectorToFace(vec: Vec3): Face {
  const [x, y, z] = vec;
  if (x === 1) return 'R';
  if (x === -1) return 'L';
  if (y === 1) return 'U';
  if (y === -1) return 'D';
  if (z === 1) return 'F';
  return 'B';
}
