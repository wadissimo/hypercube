/**
 * CFOP solving guide for 3x3 Rubik's cube.
 *
 * Analyses the current cube state and returns the next suggested moves
 * for each phase: Cross → F2L (4 pairs) → OLL → PLL.
 *
 * All analysis is done with D as the cross face. When crossFace !== 'D',
 * the cube state is reoriented so crossFace maps to D, the solver runs,
 * and the resulting moves are rotated back to the original orientation.
 */

import type { CubeState, Face } from './cubeModel';
import { twistFace, faceLayers, faceVector, vectorToFace } from './cubeModel';
import { mulVec, rotX, rotZ } from './math3d';
import type { Mat3, Vec3 } from './math3d';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type SolvePhase = 'cross' | 'f2l' | 'oll' | 'pll' | 'solved';

export interface SolveStep {
  phase: SolvePhase;
  label: string;
  moves: string;
  progress: string;
}

// ---------------------------------------------------------------------------
// Cube reorientation — rotate state so a given face is on D
// ---------------------------------------------------------------------------

const IDENTITY_MAT: Mat3 = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];

/**
 * Rotation matrices that map each face to D.
 * Verified: M × faceVector(CF) = faceVector('D') = (0,-1,0) for each CF.
 */
const REORIENT_MAT: Record<Face, Mat3> = {
  D: IDENTITY_MAT,
  U: rotX(Math.PI),        // (x,y,z) → (x,-y,-z): U→D, D→U, F→B, B→F
  F: rotX(Math.PI / 2),    // (x,y,z) → (x,-z,y):  F→D, U→F, D→B, B→U
  B: rotX(-Math.PI / 2),   // (x,y,z) → (x,z,-y):  B→D, U→B, D→F, F→U
  R: rotZ(-Math.PI / 2),   // (x,y,z) → (y,-x,z):  R→D, U→R, D→L, L→U
  L: rotZ(Math.PI / 2),    // (x,y,z) → (-y,x,z):  L→D, U→L, D→R, R→U
};

/** Inverse of each REORIENT_MAT (M^T for orthogonal matrices). */
const REORIENT_MAT_INV: Record<Face, Mat3> = {
  D: IDENTITY_MAT,
  U: rotX(Math.PI),       // self-inverse
  F: rotX(-Math.PI / 2),
  B: rotX(Math.PI / 2),
  R: rotZ(Math.PI / 2),
  L: rotZ(-Math.PI / 2),
};

function roundVec3(v: Vec3): Vec3 {
  return [Math.round(v[0]), Math.round(v[1]), Math.round(v[2])];
}

function reorientState(state: CubeState, M: Mat3): CubeState {
  return state.map(cubie => {
    const newPos = roundVec3(mulVec(M, cubie.position as Vec3));
    const newFaces: Partial<Record<Face, Face>> = {};
    for (const [dir, color] of Object.entries(cubie.faces) as [Face, Face][]) {
      // Both the face direction and the color label must be remapped.
      // Colors are named after their home face, so rotating U→D means 'U' color becomes 'D' color.
      const newDir = vectorToFace(roundVec3(mulVec(M, faceVector(dir))));
      const newColor = vectorToFace(roundVec3(mulVec(M, faceVector(color))));
      newFaces[newDir] = newColor;
    }
    return { position: newPos as [number, number, number], faces: newFaces };
  });
}

function reorientMoves(moves: Move[], M_inv: Mat3): Move[] {
  return moves.map(m => ({
    ...m,
    face: vectorToFace(roundVec3(mulVec(M_inv, faceVector(m.face)))),
  }));
}

// ---------------------------------------------------------------------------
// Internal move type
// ---------------------------------------------------------------------------

interface Move {
  face: Face;
  clockwise: boolean;
  count: number; // 1 or 2
}

const FACES: Face[] = ['U', 'D', 'R', 'L', 'F', 'B'];

const FACE_AXIS: Record<Face, number> = { U: 1, D: 1, R: 0, L: 0, F: 2, B: 2 };

const ALL_MOVES: Move[] = FACES.flatMap(f => [
  { face: f, clockwise: true, count: 1 },
  { face: f, clockwise: false, count: 1 },
  { face: f, clockwise: true, count: 2 },
]);

// Precomputed layers for each face on a 3x3
const LAYERS_CACHE: Record<Face, number[]> = {
  U: faceLayers('U', 3),
  D: faceLayers('D', 3),
  R: faceLayers('R', 3),
  L: faceLayers('L', 3),
  F: faceLayers('F', 3),
  B: faceLayers('B', 3),
};

// ---------------------------------------------------------------------------
// Piece definitions
// ---------------------------------------------------------------------------

const CROSS_EDGES: { pos: [number, number, number]; faces: [Face, Face] }[] = [
  { pos: [0, -1, 1], faces: ['D', 'F'] },
  { pos: [1, -1, 0], faces: ['D', 'R'] },
  { pos: [0, -1, -1], faces: ['D', 'B'] },
  { pos: [-1, -1, 0], faces: ['D', 'L'] },
];

const F2L_PAIRS: {
  corner: { pos: [number, number, number]; faces: Record<string, Face> };
  edge: { pos: [number, number, number]; faces: Record<string, Face> };
  label: string;
}[] = [
  {
    corner: { pos: [1, -1, 1], faces: { D: 'D', R: 'R', F: 'F' } },
    edge: { pos: [1, 0, 1], faces: { R: 'R', F: 'F' } },
    label: 'FR',
  },
  {
    corner: { pos: [-1, -1, 1], faces: { D: 'D', L: 'L', F: 'F' } },
    edge: { pos: [-1, 0, 1], faces: { L: 'L', F: 'F' } },
    label: 'FL',
  },
  {
    corner: { pos: [1, -1, -1], faces: { D: 'D', R: 'R', B: 'B' } },
    edge: { pos: [1, 0, -1], faces: { R: 'R', B: 'B' } },
    label: 'BR',
  },
  {
    corner: { pos: [-1, -1, -1], faces: { D: 'D', L: 'L', B: 'B' } },
    edge: { pos: [-1, 0, -1], faces: { L: 'L', B: 'B' } },
    label: 'BL',
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function posEq(a: readonly number[], b: readonly number[]): boolean {
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
}

function findCubie(state: CubeState, pos: readonly number[]) {
  return state.find(c => posEq(c.position, pos));
}

function applyMove(state: CubeState, move: Move): CubeState {
  const layers = LAYERS_CACHE[move.face];
  let s = state;
  const times = move.count === 2 ? 2 : 1;
  for (let i = 0; i < times; i++) {
    s = twistFace(s, move.face, move.clockwise, layers);
  }
  return s;
}

function applyMoveSequence(state: CubeState, moves: Move[]): CubeState {
  let s = state;
  for (const m of moves) {
    s = applyMove(s, m);
  }
  return s;
}

function formatMoves(moves: Move[]): string {
  return moves.map(m => {
    if (m.count === 2) return `${m.face}2`;
    return m.clockwise ? m.face : `${m.face}'`;
  }).join(' ');
}

function parseMoves(notation: string): Move[] {
  const tokens = notation.trim().split(/\s+/);
  return tokens.map(token => {
    const face = token[0] as Face;
    const rest = token.slice(1);
    if (rest === '2' || rest === "2'") return { face, clockwise: true, count: 2 as const };
    if (rest === "'") return { face, clockwise: false, count: 1 as const };
    return { face, clockwise: true, count: 1 as const };
  });
}

// ---------------------------------------------------------------------------
// IDDFS solver — iterative deepening depth-first search with axis pruning
// Time-limited to avoid blocking the UI thread.
// ---------------------------------------------------------------------------

const SEARCH_BUDGET_MS = 500;

function iddfs(
  state: CubeState,
  isGoal: (s: CubeState) => boolean,
  maxDepth: number,
  moves: Move[] = ALL_MOVES,
): Move[] | null {
  if (isGoal(state)) return [];

  const deadline = Date.now() + SEARCH_BUDGET_MS;

  for (let depth = 1; depth <= maxDepth; depth++) {
    const result = dfs(state, isGoal, depth, moves, null, null, deadline);
    if (result) return result;
    if (Date.now() >= deadline) break;
  }
  return null;
}

let dfsCounter = 0;

function dfs(
  state: CubeState,
  isGoal: (s: CubeState) => boolean,
  depth: number,
  moves: Move[],
  lastFace: Face | null,
  lastAxis: number | null,
  deadline: number,
): Move[] | null {
  if (depth === 0) return null;

  // Check time budget every 1024 nodes
  if ((++dfsCounter & 0x3FF) === 0 && Date.now() >= deadline) return null;

  for (const move of moves) {
    if (move.face === lastFace) continue;
    const axis = FACE_AXIS[move.face];
    if (axis === lastAxis && move.face > lastFace!) continue;

    const nextState = applyMove(state, move);
    if (isGoal(nextState)) return [move];

    if (depth > 1) {
      const sub = dfs(nextState, isGoal, depth - 1, moves, move.face, axis, deadline);
      if (sub) return [move, ...sub];
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Cross solving
// ---------------------------------------------------------------------------

function isCrossEdgeSolved(state: CubeState, idx: number): boolean {
  const def = CROSS_EDGES[idx];
  const cubie = findCubie(state, def.pos);
  if (!cubie) return false;
  return def.faces.every(f => cubie.faces[f] === f);
}

function solveNextCrossEdge(state: CubeState): { edgeIndex: number; moves: Move[] } | null {
  const solvedBefore = CROSS_EDGES.map((_, i) => isCrossEdgeSolved(state, i));

  let best: { edgeIndex: number; moves: Move[] } | null = null;
  for (let i = 0; i < 4; i++) {
    if (solvedBefore[i]) continue;
    const moves = iddfs(
      state,
      s => {
        if (!isCrossEdgeSolved(s, i)) return false;
        for (let j = 0; j < 4; j++) {
          if (solvedBefore[j] && !isCrossEdgeSolved(s, j)) return false;
        }
        return true;
      },
      6,
    );
    if (moves && (!best || moves.length < best.moves.length)) {
      best = { edgeIndex: i, moves };
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// F2L solving
// ---------------------------------------------------------------------------

function isF2LPairSolved(state: CubeState, idx: number): boolean {
  const pair = F2L_PAIRS[idx];
  const corner = findCubie(state, pair.corner.pos);
  const edge = findCubie(state, pair.edge.pos);
  if (!corner || !edge) return false;

  for (const [dir, color] of Object.entries(pair.corner.faces)) {
    if (corner.faces[dir as Face] !== color) return false;
  }
  for (const [dir, color] of Object.entries(pair.edge.faces)) {
    if (edge.faces[dir as Face] !== color) return false;
  }
  return true;
}

function solveNextF2LPair(state: CubeState): { pairIndex: number; moves: Move[] } | null {
  const crossSolved = CROSS_EDGES.map((_, i) => isCrossEdgeSolved(state, i));
  const f2lSolved = F2L_PAIRS.map((_, i) => isF2LPairSolved(state, i));

  let best: { pairIndex: number; moves: Move[] } | null = null;
  for (let i = 0; i < 4; i++) {
    if (f2lSolved[i]) continue;
    const moves = iddfs(
      state,
      s => {
        if (!isF2LPairSolved(s, i)) return false;
        for (let j = 0; j < 4; j++) {
          if (crossSolved[j] && !isCrossEdgeSolved(s, j)) return false;
          if (f2lSolved[j] && !isF2LPairSolved(s, j)) return false;
        }
        return true;
      },
      8,
    );
    if (moves) {
      // Return first solvable pair to stay within time budget
      return { pairIndex: i, moves };
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// OLL — Orient Last Layer
// ---------------------------------------------------------------------------

const U_POSITIONS: [number, number, number][] = [
  [-1, 1, -1], [0, 1, -1], [1, 1, -1],
  [-1, 1, 0],  [0, 1, 0],  [1, 1, 0],
  [-1, 1, 1],  [0, 1, 1],  [1, 1, 1],
];

function isOLLSolved(state: CubeState): boolean {
  return U_POSITIONS.every(pos => {
    const c = findCubie(state, pos);
    return c?.faces.U === 'U';
  });
}

function isF2LIntact(state: CubeState): boolean {
  return CROSS_EDGES.every((_, i) => isCrossEdgeSolved(state, i)) &&
    F2L_PAIRS.every((_, i) => isF2LPairSolved(state, i));
}

function solveOLL(state: CubeState): { name: string; moves: Move[] } | null {
  if (isOLLSolved(state)) return { name: 'done', moves: [] };
  if (!isF2LIntact(state)) return null;

  const uSetups: Move[][] = [
    [],
    [{ face: 'U', clockwise: true, count: 1 }],
    [{ face: 'U', clockwise: true, count: 2 }],
    [{ face: 'U', clockwise: false, count: 1 }],
  ];

  for (const entry of OLL_TABLE) {
    const algMoves = parseMoves(entry.alg);
    for (const setup of uSetups) {
      const result = applyMoveSequence(applyMoveSequence(state, setup), algMoves);
      if (isOLLSolved(result) && isF2LIntact(result)) {
        return { name: entry.name, moves: [...setup, ...algMoves] };
      }
    }
  }

  // Fallback: short brute-force
  const solution = iddfs(
    state,
    s => isOLLSolved(s) && isF2LIntact(s),
    8,
  );
  return solution ? { name: 'OLL', moves: solution } : null;
}

// ---------------------------------------------------------------------------
// PLL — Permute Last Layer
// ---------------------------------------------------------------------------

function isPLLSolved(state: CubeState): boolean {
  for (const face of FACES) {
    const stickers: Face[] = [];
    for (const c of state) {
      if (c.faces[face] !== undefined) stickers.push(c.faces[face]!);
    }
    if (stickers.length > 0) {
      const first = stickers[0];
      for (let i = 1; i < stickers.length; i++) {
        if (stickers[i] !== first) return false;
      }
    }
  }
  return true;
}

function solvePLL(state: CubeState): { name: string; moves: Move[] } | null {
  if (isPLLSolved(state)) return { name: 'done', moves: [] };
  if (!isOLLSolved(state)) return null;

  const uSetups: Move[][] = [
    [],
    [{ face: 'U', clockwise: true, count: 1 }],
    [{ face: 'U', clockwise: true, count: 2 }],
    [{ face: 'U', clockwise: false, count: 1 }],
  ];

  for (const entry of PLL_TABLE) {
    const algMoves = parseMoves(entry.alg);
    for (const setup of uSetups) {
      const afterAlg = applyMoveSequence(applyMoveSequence(state, setup), algMoves);
      // Check with AUF (adjust U face)
      for (const auf of uSetups) {
        const final = applyMoveSequence(afterAlg, auf);
        if (isPLLSolved(final) && isF2LIntact(final)) {
          const allMoves = [...setup, ...algMoves, ...auf];
          // Remove empty moves
          const filtered = allMoves.filter(() => true);
          return { name: entry.name, moves: filtered };
        }
      }
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// OLL table (57 algorithms)
// ---------------------------------------------------------------------------

const OLL_TABLE: { name: string; alg: string }[] = [
  // Dot cases (no edges oriented)
  { name: 'OLL 1', alg: "R U2 R2 F R F' U2 R' F R F'" },
  { name: 'OLL 2', alg: "F R U R' U' F' B U L U' L' B'" },
  { name: 'OLL 3', alg: "F U R U' R' F' U F R U R' U' F'" },
  { name: 'OLL 4', alg: "F U R U' R' F' U' F R U R' U' F'" },
  { name: 'OLL 17', alg: "R U R' U R' F R F' U2 R' F R F'" },
  { name: 'OLL 18', alg: "R U2 R2 F R F' U2 R' F R F'" },
  { name: 'OLL 19', alg: "R' U2 F R U R' U' F2 U2 F R" },
  { name: 'OLL 20', alg: "R' F R U R' F' R F U' F'" },
  // Line cases (two opposite edges oriented)
  { name: 'OLL 51', alg: "F U R U' R' U R U' R' F'" },
  { name: 'OLL 52', alg: "R' U' R U' R' U F' U F R" },
  { name: 'OLL 55', alg: "R U2 R2 U' R U' R' U2 F R F'" },
  { name: 'OLL 56', alg: "R' U' R F R' U R U' F' U R'" },
  // L-shape cases (two adjacent edges oriented)
  { name: 'OLL 5', alg: "R' F2 R2 U2 R' F R U2 R2 F2 R" },
  { name: 'OLL 6', alg: "R2 F2 R U2 R F' R' U2 R' F2 R2" },
  { name: 'OLL 7', alg: "R B' R' B R U R' U' R B' R' B" },
  { name: 'OLL 8', alg: "R' B R B' R' U' R U R' B R B'" },
  { name: 'OLL 9', alg: "R U R' U' R' F R2 U R' U' F'" },
  { name: 'OLL 10', alg: "R U R' U R' F R F' R U2 R'" },
  { name: 'OLL 11', alg: "R' U2 R U R' U R2 B' R' B" },
  { name: 'OLL 12', alg: "F R U R' U' F' U F R U R' U' F'" },
  // Cross cases (all edges oriented, corners not)
  { name: 'OLL 21', alg: "R U2 R' U' R U R' U' R U' R'" },
  { name: 'OLL 22', alg: "R U2 R2 U' R2 U' R2 U2 R" },
  { name: 'OLL 23', alg: "R2 D' R U2 R' D R U2 R" },
  { name: 'OLL 24', alg: "R U R' U' R' F R F'" },
  { name: 'OLL 25', alg: "F' R U R' U' R' F R" },
  { name: 'OLL 26', alg: "R U2 R' U' R U' R'" },
  { name: 'OLL 27', alg: "R U R' U R U2 R'" },
  // P shapes
  { name: 'OLL 31', alg: "R' U' F U R U' R' F' R" },
  { name: 'OLL 32', alg: "R U B' U' R' U R B R'" },
  // W shapes
  { name: 'OLL 36', alg: "R' U' R U' R' U R U R B' R' B" },
  { name: 'OLL 38', alg: "R U R' U R U' R' U' R' F R F'" },
  // Fish shapes
  { name: 'OLL 35', alg: "R U2 R2 F R F' R U2 R'" },
  { name: 'OLL 37', alg: "F R U' R' U' R U R' F'" },
  // Lightning bolts
  { name: 'OLL 39', alg: "R B' R' U' R U B U' R'" },
  { name: 'OLL 40', alg: "R' F R U R' U' F' U R" },
  // Knight shapes
  { name: 'OLL 13', alg: "R U R' U' R' F R U R U' R' F'" },
  { name: 'OLL 14', alg: "R' F R U R' F' R F U' F'" },
  { name: 'OLL 15', alg: "R' F' R U R' U' R' F R2 U' R' U2 R" },
  { name: 'OLL 16', alg: "R' F' R U R' U' R' F R U R U' R'" },
  // Awkward shapes
  { name: 'OLL 29', alg: "R U R' U' R U' R' F' U' F R U R'" },
  { name: 'OLL 30', alg: "R2 U R' B' R U' R2 U R B R'" },
  // T shapes
  { name: 'OLL 33', alg: "R U R' U' R' F R F'" },
  { name: 'OLL 45', alg: "F R U R' U' F'" },
  // C shapes
  { name: 'OLL 34', alg: "R U R2 U' R' F R U R U' F'" },
  { name: 'OLL 46', alg: "R' U' R' F R F' U R" },
  // Small L shapes
  { name: 'OLL 41', alg: "R U R' U R U2 R' F R U R' U' F'" },
  { name: 'OLL 42', alg: "R' U' R U' R' U2 R F R U R' U' F'" },
  { name: 'OLL 43', alg: "R U R' U' B' R' F R F' B" },
  { name: 'OLL 44', alg: "F U R U' R' F'" },
  // Big shapes
  { name: 'OLL 47', alg: "R' U' R' F R F' R' F R F' U R" },
  { name: 'OLL 48', alg: "F R U R' U' R U R' U' F'" },
  { name: 'OLL 49', alg: "R B' R2 F R2 B R2 F' R" },
  { name: 'OLL 50', alg: "R' F R2 B' R2 F' R2 B R'" },
  // I shapes
  { name: 'OLL 53', alg: "R' F' R U R U' R2 F2 R2 U' R' F R" },
  { name: 'OLL 54', alg: "R U R' U' R' F R2 B' R' B F'" },
  // All corners oriented (only edges wrong, or skip)
  { name: 'OLL 28', alg: "R U R' U' R' F R F'" },
  { name: 'OLL 57', alg: "R U R' U' R' F R F'" },
];

// ---------------------------------------------------------------------------
// PLL table (21 algorithms)
// ---------------------------------------------------------------------------

const PLL_TABLE: { name: string; alg: string }[] = [
  // Edges only
  { name: 'Ua', alg: "R U' R U R U R U' R' U' R2" },
  { name: 'Ub', alg: "R2 U R U R' U' R' U' R' U R'" },
  { name: 'H', alg: "R2 U2 R U2 R2 U2 R2 U2 R U2 R2" },
  { name: 'Z', alg: "R' U' R U' R U R U' R' U R U R2 U' R'" },
  // Corners only
  { name: 'Aa', alg: "R' F R' B2 R F' R' B2 R2" },
  { name: 'Ab', alg: "R2 B2 R F R' B2 R F' R" },
  { name: 'E', alg: "R B' R' F R B R' F' R B R' F R B' R' F'" },
  // Adjacent corner + edge swaps
  { name: 'T', alg: "R U R' U' R' F R2 U' R' U' R U R' F'" },
  { name: 'F', alg: "R' U' F' R U R' U' R' F R2 U' R' U' R U R' U R" },
  { name: 'Ja', alg: "R' U L' U2 R U' R' U2 R L" },
  { name: 'Jb', alg: "R U R' F' R U R' U' R' F R2 U' R'" },
  { name: 'Ra', alg: "R U' R' U' R U R' F' R U R' U' R' F R2 U' R' U2 R U' R'" },
  { name: 'Rb', alg: "R' U2 R U2 R' F R U R' U' R' F' R2 U'" },
  // Diagonal corner swaps
  { name: 'V', alg: "R' U R' U' B' R' B2 U' B' U B' R B R" },
  { name: 'Y', alg: "F R U' R' U' R U R' F' R U R' U' R' F R F'" },
  { name: 'Na', alg: "R U R' U R U R' F' R U R' U' R' F R2 U' R' U2 R U' R'" },
  { name: 'Nb', alg: "R' U R' F R F' R U' R' F' U F R U R' U' R" },
  // G perms
  { name: 'Ga', alg: "R2 U R' U R' U' R U' R2 U' D R' U R D'" },
  { name: 'Gb', alg: "R' U' R U D' R2 U R' U R U' R U' R2 D" },
  { name: 'Gc', alg: "R2 U' R U' R U R' U R2 U D' R U' R' D" },
  { name: 'Gd', alg: "R U R' U' D R2 U' R U' R' U R' U R2 D'" },
];

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export function analyseCubeState(state: CubeState, crossFace: Face = 'D'): SolveStep | null {
  // Reorient the cube so the chosen cross face maps to D, run D-based analysis,
  // then rotate the resulting moves back to the original frame.
  const needsReorient = crossFace !== 'D';
  const workState = needsReorient ? reorientState(state, REORIENT_MAT[crossFace]) : state;
  const M_inv = needsReorient ? REORIENT_MAT_INV[crossFace] : null;

  const orient = (moves: Move[]): string =>
    formatMoves(M_inv ? reorientMoves(moves, M_inv) : moves);

  // Phase 1: Cross
  const crossSolved = CROSS_EDGES.map((_, i) => isCrossEdgeSolved(workState, i));
  const crossCount = crossSolved.filter(Boolean).length;

  if (crossCount < 4) {
    const next = solveNextCrossEdge(workState);
    if (!next) {
      return { phase: 'cross', label: 'Cross', moves: '...', progress: `${crossCount}/4` };
    }
    const edgeLabel = CROSS_EDGES[next.edgeIndex].faces[1];
    return {
      phase: 'cross',
      label: `Cross ${edgeLabel}`,
      moves: next.moves.length === 0 ? 'done' : orient(next.moves),
      progress: `${crossCount}/4`,
    };
  }

  // Phase 2: F2L
  const f2lSolved = F2L_PAIRS.map((_, i) => isF2LPairSolved(workState, i));
  const f2lCount = f2lSolved.filter(Boolean).length;

  if (f2lCount < 4) {
    const next = solveNextF2LPair(workState);
    if (!next) {
      return { phase: 'f2l', label: 'F2L', moves: '...', progress: `${f2lCount}/4` };
    }
    return {
      phase: 'f2l',
      label: `F2L ${F2L_PAIRS[next.pairIndex].label}`,
      moves: next.moves.length === 0 ? 'done' : orient(next.moves),
      progress: `${f2lCount}/4`,
    };
  }

  // Phase 3: OLL
  if (!isOLLSolved(workState)) {
    const result = solveOLL(workState);
    if (!result) {
      return { phase: 'oll', label: 'OLL', moves: '...', progress: '' };
    }
    return {
      phase: 'oll',
      label: result.name,
      moves: result.moves.length === 0 ? 'done' : orient(result.moves),
      progress: '',
    };
  }

  // Phase 4: PLL
  if (!isPLLSolved(workState)) {
    const result = solvePLL(workState);
    if (!result) {
      return { phase: 'pll', label: 'PLL', moves: '...', progress: '' };
    }
    return {
      phase: 'pll',
      label: result.name,
      moves: result.moves.length === 0 ? 'done' : orient(result.moves),
      progress: '',
    };
  }

  return { phase: 'solved', label: 'Solved!', moves: '', progress: '' };
}
