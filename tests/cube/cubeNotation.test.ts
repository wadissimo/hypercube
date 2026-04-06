import assert from 'node:assert/strict';
import test from 'node:test';
import { getFaceMoveButtons, resolve3DNotationMove } from '../../app/utils/cubeNotation';
import { createSolvedCube, faceLayers, faceVector, twistFace, vectorToFace, type Face } from '../../app/utils/cubeModel';
import { resolveScreenRelativeMapping } from '../../app/utils/cubeControls';
import { mulMat, rotX, rotY } from '../../app/utils/math3d';
import { CUBE_3D_TOPOLOGY } from '../../app/utils/puzzleTopology';

test('R button semantics are wired as unprimed clockwise and prime counterclockwise', () => {
  const buttons = getFaceMoveButtons('R', true);

  assert.deepEqual(
    buttons.map(button => ({ label: button.label, clockwise: button.clockwise, turns: button.turns })),
    [
      { label: 'R2', clockwise: true, turns: 2 },
      { label: "R'", clockwise: false, turns: 1 },
      { label: 'R', clockwise: true, turns: 1 },
    ],
  );
});

test('default-view R resolves to physical R with the user-facing clockwise direction', () => {
  const defaultViewMatrix = mulMat(rotX(Math.PI / 5.5), rotY(-Math.PI / 5));
  const resolvedMove = resolve3DNotationMove('R', true, 3, defaultViewMatrix);

  assert.deepEqual(resolvedMove, { face: 'R', clockwise: false });

  const next = twistFace(createSolvedCube(3), resolvedMove.face, resolvedMove.clockwise, faceLayers(resolvedMove.face, 3));
  const urf = next.find(cubie => Object.values(cubie.faces).sort().join('') === ['U', 'R', 'F'].sort().join(''));

  assert.ok(urf);
  assert.equal(urf.faces.F, 'U');
});

test('default-view R prime resolves to physical R with the user-facing counterclockwise direction', () => {
  const defaultViewMatrix = mulMat(rotX(Math.PI / 5.5), rotY(-Math.PI / 5));
  const resolvedMove = resolve3DNotationMove('R', false, 3, defaultViewMatrix);

  assert.deepEqual(resolvedMove, { face: 'R', clockwise: true });

  const next = twistFace(createSolvedCube(3), resolvedMove.face, resolvedMove.clockwise, faceLayers(resolvedMove.face, 3));
  const urf = next.find(cubie => Object.values(cubie.faces).sort().join('') === ['U', 'R', 'F'].sort().join(''));

  assert.ok(urf);
  assert.equal(urf.faces.B, 'U');
});

test('red-front blue-right white-top view resolves R prime to a physical F clockwise turn', () => {
  const redFrontBlueRightViewMatrix = mulMat(rotX(-0.8), rotY(0.8));
  const mapping = resolveScreenRelativeMapping(redFrontBlueRightViewMatrix, 3);
  const resolvedMove = resolve3DNotationMove('R', false, 3, redFrontBlueRightViewMatrix);

  assert.equal(mapping.U, 'U');
  assert.equal(mapping.F, 'R');
  assert.equal(mapping.R, 'F');
  assert.deepEqual(resolvedMove, { face: 'F', clockwise: true });

  const next = twistFace(createSolvedCube(3), resolvedMove.face, resolvedMove.clockwise, faceLayers(resolvedMove.face, 3));
  const urf = next.find(cubie => Object.values(cubie.faces).sort().join('') === ['U', 'R', 'F'].sort().join(''));

  assert.ok(urf);
  assert.equal(urf.faces.R, 'U');
});

test('screen-relative notation matches physical outside-face corner motion across sampled views', () => {
  sampleViewMatrices().forEach(viewMatrix => {
    const mapping = resolveScreenRelativeMapping(viewMatrix, 3);
    const solved = createSolvedCube(3);

    (['U', 'D', 'L', 'R', 'F', 'B'] as Face[]).forEach(slotFace => {
      const [slotRightVector, slotUpVector] = CUBE_3D_TOPOLOGY.faces[slotFace].tangents3D!;
      const physicalFace = mapping[slotFace];
      const physicalRightFace = mapping[vectorToFace(slotRightVector)];
      const physicalUpFace = mapping[vectorToFace(slotUpVector)];
      const startPosition = add3(faceVector(physicalFace), add3(faceVector(physicalRightFace), faceVector(physicalUpFace)));
      const startCubie = findCubieByPosition(solved, startPosition);
      const startColors = Object.values(startCubie.faces) as Face[];

      ([
        { clockwise: true, expectedPosition: add3(faceVector(physicalFace), add3(faceVector(physicalRightFace), negate3(faceVector(physicalUpFace)))) },
        { clockwise: false, expectedPosition: add3(faceVector(physicalFace), add3(negate3(faceVector(physicalRightFace)), faceVector(physicalUpFace))) },
      ] as const).forEach(({ clockwise, expectedPosition }) => {
        const resolvedMove = resolve3DNotationMove(slotFace, clockwise, 3, viewMatrix);
        const moved = twistFace(solved, resolvedMove.face, resolvedMove.clockwise, faceLayers(resolvedMove.face, 3));
        const cubie = findCubieByColors(moved, startColors);

        assert.deepEqual(
          cubie.position,
          expectedPosition,
          `${slotFace}${clockwise ? '' : '\''} should move the slot-local top-right corner to the expected destination`,
        );
      });
    });
  });
});

function sampleViewMatrices() {
  const matrices = [];

  for (let pitchDeg = -70; pitchDeg <= 70; pitchDeg += 20) {
    for (let yawDeg = -180; yawDeg <= 180; yawDeg += 30) {
      matrices.push(mulMat(rotX((pitchDeg * Math.PI) / 180), rotY((yawDeg * Math.PI) / 180)));
    }
  }

  return matrices;
}

function findCubieByColors(
  state: ReturnType<typeof createSolvedCube>,
  cubieColors: Face[],
) {
  const target = [...cubieColors].sort().join('');
  const cubie = state.find(entry => Object.values(entry.faces).sort().join('') === target);

  assert.ok(cubie, `Missing cubie ${target}`);
  return cubie;
}

function findCubieByPosition(
  state: ReturnType<typeof createSolvedCube>,
  position: [number, number, number],
) {
  const cubie = state.find(entry => entry.position.every((value, index) => value === position[index]));
  assert.ok(cubie, `Missing cubie at ${position.join(',')}`);
  return cubie;
}

function add3(left: [number, number, number], right: [number, number, number]): [number, number, number] {
  return [left[0] + right[0], left[1] + right[1], left[2] + right[2]];
}

function negate3(vector: [number, number, number]): [number, number, number] {
  return [-vector[0], -vector[1], -vector[2]];
}
