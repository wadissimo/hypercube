import assert from 'node:assert/strict';
import test from 'node:test';
import type { CubeSize, Face } from '../../app/utils/cubeModel';
import {
  ALL_FACES,
  createSolvedCube,
  faceLayers,
  isCubeSolved,
  twistFace,
} from '../../app/utils/cubeModel';
import {
  applyCubeRotationToState,
  applyTwistToState,
  getFaceTwistAxisOptions,
  hasValidTwist,
  createSolvedMagicCube4DState,
  isMagicCube4DSolved,
} from '../../app/utils/magiccube4d';
import { resolveSolveCheckTransition } from '../../app/utils/puzzleSolved';

const CUBE_SIZES: CubeSize[] = [2, 3, 4, 5];
const ITERATIONS_PER_3D_SIZE = 24;
const ITERATIONS_4D = 24;

test('solve gating stays inactive until scramble, then fires exactly once for every 3D size across repeated scrambles', () => {
  const rng = createRng(0x3dc0de);

  CUBE_SIZES.forEach(size => {
    for (let iteration = 0; iteration < ITERATIONS_PER_3D_SIZE; iteration++) {
      const solved = createSolvedCube(size);

      assert.deepEqual(
        resolveSolveCheckTransition(false, isCubeSolved(solved)),
        { didSolve: false, nextArmed: false },
        `size ${size} should not trigger before scramble on iteration ${iteration + 1}`,
      );

      const scramble = build3DScramble(size, rng);
      assert.equal(isCubeSolved(scramble.state), false, `size ${size} scramble must be unsolved on iteration ${iteration + 1}`);

      assert.deepEqual(
        resolveSolveCheckTransition(true, isCubeSolved(scramble.state)),
        { didSolve: false, nextArmed: true },
        `size ${size} should stay armed while unsolved on iteration ${iteration + 1}`,
      );

      const restored = apply3DMoves(scramble.state, size, scramble.inverseMoves);
      assert.equal(isCubeSolved(restored), true, `size ${size} inverse should restore solved state on iteration ${iteration + 1}`);

      const solvedTransition = resolveSolveCheckTransition(true, isCubeSolved(restored));
      assert.deepEqual(
        solvedTransition,
        { didSolve: true, nextArmed: false },
        `size ${size} should trigger exactly once when solved on iteration ${iteration + 1}`,
      );

      assert.deepEqual(
        resolveSolveCheckTransition(solvedTransition.nextArmed, isCubeSolved(restored)),
        { didSolve: false, nextArmed: false },
        `size ${size} should be disarmed after solve on iteration ${iteration + 1}`,
      );

      assert.deepEqual(
        resolveSolveCheckTransition(false, isCubeSolved(restored)),
        { didSolve: false, nextArmed: false },
        `size ${size} reset should leave solve check inactive on iteration ${iteration + 1}`,
      );
    }
  });
});

test('4D solve gating survives repeated scramble and solve cycles without manual play', () => {
  const rng = createRng(0x4dc0de);

  for (let iteration = 0; iteration < ITERATIONS_4D; iteration++) {
    const solved = createSolvedMagicCube4DState();

    assert.deepEqual(
      resolveSolveCheckTransition(false, isMagicCube4DSolved(solved)),
      { didSolve: false, nextArmed: false },
      `4D should not trigger before scramble on iteration ${iteration + 1}`,
    );

    const scramble = build4DScramble(rng);
    assert.equal(isMagicCube4DSolved(scramble.state), false, `4D scramble must be unsolved on iteration ${iteration + 1}`);

    assert.deepEqual(
      resolveSolveCheckTransition(true, isMagicCube4DSolved(scramble.state)),
      { didSolve: false, nextArmed: true },
      `4D should stay armed while unsolved on iteration ${iteration + 1}`,
    );

    const rotatedScramble = scramble.rotationNoise.reduce(
      (state, move) => applyCubeRotationToState(state, move.axisIndex, move.dir),
      scramble.state,
    );
    assert.equal(
      isMagicCube4DSolved(rotatedScramble),
      false,
      `4D orientation changes must not hide an unsolved state on iteration ${iteration + 1}`,
    );

    const unrotated = [...scramble.rotationNoise]
      .reverse()
      .reduce(
        (state, move) => applyCubeRotationToState(state, move.axisIndex, (move.dir === 1 ? -1 : 1) as -1 | 1),
        rotatedScramble,
      );
    const restored = apply4DTwistMoves(unrotated, scramble.inverseMoves);
    assert.equal(isMagicCube4DSolved(restored), true, `4D inverse should restore solved state on iteration ${iteration + 1}`);

    const solvedTransition = resolveSolveCheckTransition(true, isMagicCube4DSolved(restored));
    assert.deepEqual(
      solvedTransition,
      { didSolve: true, nextArmed: false },
      `4D should trigger exactly once when solved on iteration ${iteration + 1}`,
    );

    assert.deepEqual(
      resolveSolveCheckTransition(solvedTransition.nextArmed, isMagicCube4DSolved(restored)),
      { didSolve: false, nextArmed: false },
      `4D should be disarmed after solve on iteration ${iteration + 1}`,
    );
  }
});

interface CubeQuarterTurn {
  face: Face;
  clockwise: boolean;
  wide: boolean;
}

interface TwistMove4D {
  gripIndex: number;
  dir: -1 | 1;
  sliceMask: number;
}

interface RotationMove4D {
  axisIndex: 0 | 1 | 2;
  dir: -1 | 1;
}

function build3DScramble(size: CubeSize, rng: () => number): {
  state: ReturnType<typeof createSolvedCube>;
  inverseMoves: CubeQuarterTurn[];
} {
  let state = createSolvedCube(size);
  const inverseMoves: CubeQuarterTurn[] = [];

  while (isCubeSolved(state)) {
    state = createSolvedCube(size);
    inverseMoves.length = 0;

    for (let moveCount = 0; moveCount < 16; moveCount++) {
      const move: CubeQuarterTurn = {
        face: ALL_FACES[Math.floor(rng() * ALL_FACES.length)],
        clockwise: rng() >= 0.5,
        wide: size >= 4 && rng() < 0.35,
      };
      state = twistFace(state, move.face, move.clockwise, faceLayers(move.face, size, move.wide));
      inverseMoves.unshift({
        face: move.face,
        clockwise: !move.clockwise,
        wide: move.wide,
      });
    }
  }

  return { state, inverseMoves };
}

function apply3DMoves(
  state: ReturnType<typeof createSolvedCube>,
  size: CubeSize,
  moves: CubeQuarterTurn[],
): ReturnType<typeof createSolvedCube> {
  return moves.reduce(
    (nextState, move) => twistFace(nextState, move.face, move.clockwise, faceLayers(move.face, size, move.wide)),
    state,
  );
}

function build4DScramble(rng: () => number): {
  state: number[];
  inverseMoves: TwistMove4D[];
  rotationNoise: RotationMove4D[];
} {
  const gripIndices = getUniqueTwistGripIndices();
  let state = createSolvedMagicCube4DState();
  const inverseMoves: TwistMove4D[] = [];

  while (isMagicCube4DSolved(state)) {
    state = createSolvedMagicCube4DState();
    inverseMoves.length = 0;

    for (let moveCount = 0; moveCount < 18; moveCount++) {
      const gripIndex = gripIndices[Math.floor(rng() * gripIndices.length)];
      const sliceOptions = [1, 2, 4].filter(mask => hasValidTwist(gripIndex, mask));
      const dir = rng() >= 0.5 ? 1 : -1;
      const sliceMask = sliceOptions[Math.floor(rng() * sliceOptions.length)];

      state = applyTwistToState(state, gripIndex, dir, sliceMask);
      inverseMoves.unshift({
        gripIndex,
        dir: (dir === 1 ? -1 : 1) as -1 | 1,
        sliceMask,
      });
    }
  }

  const rotationNoise: RotationMove4D[] = Array.from({ length: 6 }, () => ({
    axisIndex: Math.floor(rng() * 3) as 0 | 1 | 2,
    dir: rng() >= 0.5 ? 1 : -1,
  }));

  return { state, inverseMoves, rotationNoise };
}

function apply4DTwistMoves(state: number[], moves: TwistMove4D[]): number[] {
  return moves.reduce(
    (nextState, move) => applyTwistToState(nextState, move.gripIndex, move.dir, move.sliceMask),
    state,
  );
}

function getUniqueTwistGripIndices(): number[] {
  const gripIndices = new Set<number>();
  for (let faceIndex = 0; faceIndex < 8; faceIndex++) {
    getFaceTwistAxisOptions(faceIndex).forEach(option => {
      gripIndices.add(option.gripIndex);
      gripIndices.add(option.oppositeGripIndex);
    });
  }
  return [...gripIndices];
}

function createRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}
