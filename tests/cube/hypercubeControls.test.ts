import assert from 'node:assert/strict';
import test from 'node:test';
import { resolve4DScreenRelativeFaceMapping } from '../../app/utils/hypercubeControls';
import { MAGICCUBE4D_INITIAL_VIEW } from '../../app/utils/magiccube4d';
import { mulMat, rotX, rotY, rotZ, type Mat3 } from '../../app/utils/math3d';

test('default 4D screen-relative slots match the base face layout', () => {
  assert.deepEqual(
    resolve4DScreenRelativeFaceMapping(
      MAGICCUBE4D_INITIAL_VIEW,
      createDefaultHypercubeViewMatrix(),
      createDefaultHypercubeViewMatrix(),
    ),
    [0, 1, 2, 3, 4, 5, 6, 7],
  );
});

test('4D axis-relative slots keep inner and outer on their default axes across view drags', () => {
  const baseViewMatrix = createDefaultHypercubeViewMatrix();

  const cases: { label: string; viewMatrix: Mat3 }[] = [
    { label: 'roll +90', viewMatrix: mulMat(rotZ(Math.PI / 2), baseViewMatrix) },
    { label: 'roll 180', viewMatrix: mulMat(rotZ(Math.PI), baseViewMatrix) },
    { label: 'roll -90', viewMatrix: mulMat(rotZ(-Math.PI / 2), baseViewMatrix) },
    { label: 'yaw +90', viewMatrix: mulMat(rotY(Math.PI / 2), baseViewMatrix) },
    { label: 'pitch +90', viewMatrix: mulMat(rotX(Math.PI / 2), baseViewMatrix) },
  ];

  cases.forEach(({ label, viewMatrix }) => {
    const mapping = resolve4DScreenRelativeFaceMapping(MAGICCUBE4D_INITIAL_VIEW, viewMatrix, baseViewMatrix);
    assert.equal(
      mapping[0],
      0,
      `${label} should keep the inner face on the inner control slot`,
    );
    assert.equal(
      mapping[7],
      7,
      `${label} should keep the outer face on the outer control slot`,
    );
  });
});

function createDefaultHypercubeViewMatrix(): Mat3 {
  return mulMat(
    rotZ((60 * Math.PI) / 180),
    mulMat(rotX((51 * Math.PI) / 180), rotY((2 * Math.PI) / 180)),
  );
}
