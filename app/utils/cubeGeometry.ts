import type { CubeSize, Face } from './cubeModel';
import type { Vec3 } from './math3d';

export const STICKER_GAP = 0.07;
export const CAMERA_FOV = 400;

export function viewDist(size: CubeSize): number {
  if (size === 2) return 8;
  return size * 2;
}

export function cubieHalfExtent(size: CubeSize): number {
  return size === 2 ? 1.0 : 0.5;
}

export function stickerQuad(cx: number, cy: number, cz: number, face: Face, size: CubeSize): Vec3[] {
  const cellHalf = cubieHalfExtent(size);
  const h = cellHalf - STICKER_GAP;
  const o = cellHalf;

  switch (face) {
    case 'U':
      return [[cx - h, cy + o, cz - h], [cx + h, cy + o, cz - h], [cx + h, cy + o, cz + h], [cx - h, cy + o, cz + h]];
    case 'D':
      return [[cx - h, cy - o, cz + h], [cx + h, cy - o, cz + h], [cx + h, cy - o, cz - h], [cx - h, cy - o, cz - h]];
    case 'R':
      return [[cx + o, cy - h, cz + h], [cx + o, cy - h, cz - h], [cx + o, cy + h, cz - h], [cx + o, cy + h, cz + h]];
    case 'L':
      return [[cx - o, cy - h, cz - h], [cx - o, cy - h, cz + h], [cx - o, cy + h, cz + h], [cx - o, cy + h, cz - h]];
    case 'F':
      return [[cx - h, cy - h, cz + o], [cx + h, cy - h, cz + o], [cx + h, cy + h, cz + o], [cx - h, cy + h, cz + o]];
    case 'B':
      return [[cx + h, cy - h, cz - o], [cx - h, cy - h, cz - o], [cx - h, cy + h, cz - o], [cx + h, cy + h, cz - o]];
  }
}
