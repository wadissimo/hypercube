import assert from 'node:assert/strict';
import test from 'node:test';
import type { Face } from '../../app/utils/cubeModel';
import {
  createSolvedCube,
  faceVector,
  faceLayers,
  twistFace,
  twistRotationMatrix,
} from '../../app/utils/cubeModel';
import { mulVec, type Vec3 } from '../../app/utils/math3d';
import { CUBE_3D_TOPOLOGY } from '../../app/utils/puzzleTopology';

test('clockwise face turns rotate a representative corner clockwise in face-local coordinates', () => {
  const solved = createSolvedCube(3);
  const outer = 1;

  (['U', 'D', 'R', 'L', 'F', 'B'] as Face[]).forEach(face => {
    const [localRight, localUp] = CUBE_3D_TOPOLOGY.faces[face].tangents3D!;
    const startPosition = add3(faceVector(face), add3(localRight, localUp));
    const expectedPosition = add3(faceVector(face), add3(localRight, scaleVec(localUp, -1)));
    const cubieColors = findCubieByPosition(solved, scaleVec(startPosition, outer)).faces;
    const moved = twistFace(solved, face, true, faceLayers(face, 3));
    const cubie = findCubieByColors(moved, Object.values(cubieColors) as Face[]);

    assert.deepEqual(
      cubie.position,
      scaleVec(expectedPosition, outer),
      `${face} should move the local top-right corner to local bottom-right`,
    );
  });
});

test('prime face turns rotate a representative corner counterclockwise in face-local coordinates', () => {
  const solved = createSolvedCube(3);
  const outer = 1;

  (['U', 'D', 'R', 'L', 'F', 'B'] as Face[]).forEach(face => {
    const [localRight, localUp] = CUBE_3D_TOPOLOGY.faces[face].tangents3D!;
    const startPosition = add3(faceVector(face), add3(localRight, localUp));
    const expectedPosition = add3(faceVector(face), add3(scaleVec(localRight, -1), localUp));
    const cubieColors = findCubieByPosition(solved, scaleVec(startPosition, outer)).faces;
    const moved = twistFace(solved, face, false, faceLayers(face, 3));
    const cubie = findCubieByColors(moved, Object.values(cubieColors) as Face[]);

    assert.deepEqual(
      cubie.position,
      scaleVec(expectedPosition, outer),
      `${face}' should move the local top-right corner to local top-left`,
    );
  });
});

test('R and R\' move the white sticker between B and F as on a physical cube', () => {
  const solved = createSolvedCube(3);

  const afterR = twistFace(solved, 'R', true, faceLayers('R', 3));
  const afterRPrime = twistFace(solved, 'R', false, faceLayers('R', 3));

  const urfAfterR = findCubieByColors(afterR, ['U', 'R', 'F']);
  const urfAfterRPrime = findCubieByColors(afterRPrime, ['U', 'R', 'F']);

  assert.equal(urfAfterR.faces.B, 'U', 'After R, the white sticker from U should move to B');
  assert.equal(urfAfterRPrime.faces.F, 'U', 'After R\', the white sticker from U should move to F');
});

test('clockwise rotation matrices move each face local up vector onto its local right vector', () => {
  (['U', 'D', 'R', 'L', 'F', 'B'] as Face[]).forEach(face => {
    const [localRight, localUp] = CUBE_3D_TOPOLOGY.faces[face].tangents3D!;
    const rotatedUp = snapVec3(mulVec(twistRotationMatrix(face, Math.PI / 2), localUp));

    assert.deepEqual(
      rotatedUp,
      snapVec3(localRight),
      `${face} clockwise should move local up to local right`,
    );
  });
});

test('inverse and double-turn identities hold for every face', () => {
  const solved = createSolvedCube(3);
  const solvedSignature = cubeSignature(solved);

  (['U', 'D', 'R', 'L', 'F', 'B'] as Face[]).forEach(face => {
    const layer = faceLayers(face, 3);
    const clockwise = twistFace(solved, face, true, layer);
    const restored = twistFace(clockwise, face, false, layer);

    assert.equal(cubeSignature(restored), solvedSignature, `${face} followed by ${face}' should restore the cube`);

    let spun = solved;
    for (let index = 0; index < 4; index++) {
      spun = twistFace(spun, face, true, layer);
    }

    assert.equal(cubeSignature(spun), solvedSignature, `${face} repeated four times should restore the cube`);

    const doubleViaSingles = twistFace(clockwise, face, true, layer);
    const doubleViaInverse = twistFace(twistFace(solved, face, false, layer), face, false, layer);
    assert.equal(
      cubeSignature(doubleViaSingles),
      cubeSignature(doubleViaInverse),
      `${face}2 should match two quarter turns in either direction`,
    );
  });
});

function findCubieByColors(
  state: ReturnType<typeof createSolvedCube>,
  cubieColors: Face[],
) {
  const target = [...cubieColors].sort().join('');
  const cubie = state.find(entry => {
    const colors = Object.values(entry.faces).sort().join('');
    return colors === target;
  });

  assert.ok(cubie, `Missing cubie ${target}`);
  return cubie;
}

function findCubieByPosition(
  state: ReturnType<typeof createSolvedCube>,
  position: Vec3,
) {
  const cubie = state.find(entry => entry.position.every((value, index) => value === position[index]));
  assert.ok(cubie, `Missing cubie at ${position.join(',')}`);
  return cubie;
}

function cubeSignature(state: ReturnType<typeof createSolvedCube>): string {
  return state
    .map(cubie => {
      const faces = Object.entries(cubie.faces)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([face, color]) => `${face}:${color}`)
        .join(',');
      return `${cubie.position.join('/')}:${faces}`;
    })
    .sort()
    .join('|');
}

function snapVec3(vector: Vec3): Vec3 {
  return vector.map(value => {
    const rounded = Math.round(value);
    return Object.is(rounded, -0) ? 0 : rounded;
  }) as Vec3;
}

function add3(left: Vec3, right: Vec3): Vec3 {
  return [left[0] + right[0], left[1] + right[1], left[2] + right[2]];
}

function scaleVec(vector: Vec3, factor: number): Vec3 {
  return [vector[0] * factor, vector[1] * factor, vector[2] * factor];
}
