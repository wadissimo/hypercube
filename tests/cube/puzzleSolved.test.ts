import assert from 'node:assert/strict';
import test from 'node:test';
import { createSolvedCube, faceLayers, isCubeSolved, twistFace } from '../../app/utils/cubeModel';
import {
  applyCubeRotationToState,
  applyTwistToState,
  createSolvedMagicCube4DState,
  getFaceTwistAxisOptions,
  isMagicCube4DSolved,
} from '../../app/utils/magiccube4d';

test('3D solved check only passes for a solved sticker layout', () => {
  const solved = createSolvedCube(3);
  const scrambled = twistFace(solved, 'R', true, faceLayers('R', 3));

  assert.equal(isCubeSolved(solved), true);
  assert.equal(isCubeSolved(scrambled), false);
  assert.equal(isCubeSolved(twistFace(scrambled, 'R', false, faceLayers('R', 3))), true);
});

test('4D solved check survives whole-cube rotations but fails after twists', () => {
  const solved = createSolvedMagicCube4DState();
  const gripIndex = getFaceTwistAxisOptions(0)[0].gripIndex;
  const rotated = applyCubeRotationToState(solved, 0, 1);
  const twisted = applyTwistToState(solved, gripIndex, 1, 1);

  assert.equal(isMagicCube4DSolved(solved), true);
  assert.equal(isMagicCube4DSolved(rotated), true);
  assert.equal(isMagicCube4DSolved(twisted), false);
});
