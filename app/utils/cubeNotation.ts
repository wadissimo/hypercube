import type { CubeSize, Face } from './cubeModel';
import { faceVector, vectorToFace } from './cubeModel';
import type { Mat3 } from './math3d';
import { resolveScreenRelativeMapping } from './cubeControls';
import { CUBE_3D_TOPOLOGY } from './puzzleTopology';

export interface NotationButton {
  label: string;
  clockwise: boolean;
  turns: 1 | 2;
}

export function getFaceMoveButtons(face: Face, reverseOrder: boolean): NotationButton[] {
  const buttons: NotationButton[] = [
    { label: face, clockwise: true, turns: 1 },
    { label: `${face}'`, clockwise: false, turns: 1 },
    { label: `${face}2`, clockwise: true, turns: 2 },
  ];

  return reverseOrder ? [...buttons].reverse() : buttons;
}

export function resolve3DNotationMove(
  slotFace: Face,
  clockwise: boolean,
  cubeSize: CubeSize,
  viewMatrix: Mat3,
): { face: Face; clockwise: boolean } {
  const mapping = resolveScreenRelativeMapping(viewMatrix, cubeSize);
  const face = mapping[slotFace];

  return {
    face,
    clockwise: resolveScreenRelativeClockwise(slotFace, face, mapping, clockwise),
  };
}

function resolveScreenRelativeClockwise(
  slotFace: Face,
  physicalFace: Face,
  mapping: Record<Face, Face>,
  clockwise: boolean,
): boolean {
  const [slotRightVector, slotUpVector] = CUBE_3D_TOPOLOGY.faces[slotFace].tangents3D!;
  const mappedRight = faceVector(mapping[vectorToFace(slotRightVector)]);
  const mappedUp = faceVector(mapping[vectorToFace(slotUpVector)]);
  const physicalNormal = faceVector(physicalFace);
  const handedness = dot3(cross3(mappedRight, mappedUp), physicalNormal);

  return handedness > 0 ? clockwise : !clockwise;
}

function cross3(left: [number, number, number], right: [number, number, number]): [number, number, number] {
  return [
    left[1] * right[2] - left[2] * right[1],
    left[2] * right[0] - left[0] * right[2],
    left[0] * right[1] - left[1] * right[0],
  ];
}

function dot3(left: [number, number, number], right: [number, number, number]): number {
  return left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
}
