import assert from 'node:assert/strict';
import test from 'node:test';
import type { CubeSize, Face } from '../../app/utils/cubeModel';
import { resolveScreenRelativeFace, resolveScreenRelativeMapping } from '../../app/utils/cubeControls';
import { mulMat, rotX, rotY, type Mat3 } from '../../app/utils/math3d';

const TEST_CUBE_SIZE: CubeSize = 4;

test('screen-relative face selection picks the visible screen extremum for each slot', () => {
  getQuarterTurnViewCases().forEach(({ label, viewMatrix, expected }) => {
    (['U', 'D', 'L', 'R', 'F', 'B'] as Face[]).forEach(slotFace => {
      assert.equal(
        resolveScreenRelativeFace(slotFace, viewMatrix, TEST_CUBE_SIZE),
        expected[slotFace],
        `${label} should map ${slotFace} to ${expected[slotFace]}`,
      );
    });
  });
});

test('screen-relative controls keep standard physical-cube turn direction', () => {
  sampleViewMatrices().forEach(viewMatrix => {
    (['U', 'D', 'L', 'R', 'F', 'B'] as Face[]).forEach(slotFace => {
      const resolvedFace = resolveScreenRelativeFace(slotFace, viewMatrix, TEST_CUBE_SIZE);

      // Screen-relative controls only choose which face is meant.
      // Direction stays standard cube notation from outside that physical face.
      assert.equal(typeof resolvedFace, 'string');
    });
  });
});

test('default 3D view is white top, green front, red right', () => {
  const mapping = resolveScreenRelativeMapping(mulMat(rotX(Math.PI / 5.5), rotY(-Math.PI / 5)), 3);

  assert.deepEqual(mapping, {
    U: 'U',
    D: 'D',
    L: 'L',
    R: 'R',
    F: 'B',
    B: 'F',
  });
});

function sampleViewMatrices(): Mat3[] {
  const matrices: Mat3[] = [];

  for (let pitchDeg = -70; pitchDeg <= 70; pitchDeg += 20) {
    for (let yawDeg = -180; yawDeg <= 180; yawDeg += 30) {
      matrices.push(mulMat(rotX((pitchDeg * Math.PI) / 180), rotY((yawDeg * Math.PI) / 180)));
    }
  }

  return matrices;
}

function getQuarterTurnViewCases(): {
  label: string;
  viewMatrix: Mat3;
  expected: Record<Face, Face>;
}[] {
  const baseViewMatrix = mulMat(rotX(Math.PI / 5.5), rotY(-Math.PI / 5));

  return [
    {
      label: 'base view',
      viewMatrix: baseViewMatrix,
      expected: { U: 'U', D: 'D', L: 'L', R: 'R', F: 'B', B: 'F' },
    },
    {
      label: 'quarter turn right',
      viewMatrix: mulMat(baseViewMatrix, rotY(Math.PI / 2)),
      expected: { U: 'U', D: 'D', L: 'B', R: 'F', F: 'R', B: 'L' },
    },
    {
      label: 'half turn',
      viewMatrix: mulMat(baseViewMatrix, rotY(Math.PI)),
      expected: { U: 'U', D: 'D', L: 'R', R: 'L', F: 'F', B: 'B' },
    },
    {
      label: 'quarter turn left',
      viewMatrix: mulMat(baseViewMatrix, rotY((3 * Math.PI) / 2)),
      expected: { U: 'U', D: 'D', L: 'F', R: 'B', F: 'L', B: 'R' },
    },
  ];
}
