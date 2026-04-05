import type { Vec3 } from './math3d';

export type Vec4 = [number, number, number, number];
export type Mat4 = [Vec4, Vec4, Vec4, Vec4];

const PROJECTION_EPSILON = 0.35;
const SNAP_EPSILON = 1e-10;

export function add4(a: Vec4, b: Vec4): Vec4 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2], a[3] + b[3]];
}

export function sub4(a: Vec4, b: Vec4): Vec4 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2], a[3] - b[3]];
}

export function average4(points: Vec4[]): Vec4 {
  const inv = 1 / points.length;
  return [
    points.reduce((sum, point) => sum + point[0], 0) * inv,
    points.reduce((sum, point) => sum + point[1], 0) * inv,
    points.reduce((sum, point) => sum + point[2], 0) * inv,
    points.reduce((sum, point) => sum + point[3], 0) * inv,
  ];
}

export function project4dTo3d(point: Vec4, cameraW: number): Vec3 {
  const denominator = Math.max(cameraW - point[3], PROJECTION_EPSILON);
  const scale = cameraW / denominator;
  return [point[0] * scale, point[1] * scale, point[2] * scale];
}

export function identity4(): Mat4 {
  return [
    [1, 0, 0, 0],
    [0, 1, 0, 0],
    [0, 0, 1, 0],
    [0, 0, 0, 1],
  ];
}

export function cloneMat4(matrix: Mat4): Mat4 {
  return [
    [...matrix[0]] as Vec4,
    [...matrix[1]] as Vec4,
    [...matrix[2]] as Vec4,
    [...matrix[3]] as Vec4,
  ];
}

export function mulVec4(matrix: Mat4, vector: Vec4): Vec4 {
  return [
    matrix[0][0] * vector[0] + matrix[0][1] * vector[1] + matrix[0][2] * vector[2] + matrix[0][3] * vector[3],
    matrix[1][0] * vector[0] + matrix[1][1] * vector[1] + matrix[1][2] * vector[2] + matrix[1][3] * vector[3],
    matrix[2][0] * vector[0] + matrix[2][1] * vector[1] + matrix[2][2] * vector[2] + matrix[2][3] * vector[3],
    matrix[3][0] * vector[0] + matrix[3][1] * vector[1] + matrix[3][2] * vector[2] + matrix[3][3] * vector[3],
  ];
}

export function mulMat4(a: Mat4, b: Mat4): Mat4 {
  const result: Mat4 = [
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ];

  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      result[i][j] =
        a[i][0] * b[0][j] +
        a[i][1] * b[1][j] +
        a[i][2] * b[2][j] +
        a[i][3] * b[3][j];
    }
  }

  return result;
}

export function transpose4(matrix: Mat4): Mat4 {
  return [
    [matrix[0][0], matrix[1][0], matrix[2][0], matrix[3][0]],
    [matrix[0][1], matrix[1][1], matrix[2][1], matrix[3][1]],
    [matrix[0][2], matrix[1][2], matrix[2][2], matrix[3][2]],
    [matrix[0][3], matrix[1][3], matrix[2][3], matrix[3][3]],
  ];
}

export function planeRotation4(
  axisA: 0 | 1 | 2 | 3,
  axisB: 0 | 1 | 2 | 3,
  angle: number,
): Mat4 {
  const matrix = identity4();
  const c = snapUnitValue(Math.cos(angle));
  const s = snapUnitValue(Math.sin(angle));
  matrix[axisA][axisA] = c;
  matrix[axisA][axisB] = -s;
  matrix[axisB][axisA] = s;
  matrix[axisB][axisB] = c;
  return matrix;
}

function snapUnitValue(value: number): number {
  if (Math.abs(value) < SNAP_EPSILON) {
    return 0;
  }

  if (Math.abs(value - 1) < SNAP_EPSILON) {
    return 1;
  }

  if (Math.abs(value + 1) < SNAP_EPSILON) {
    return -1;
  }

  return value;
}
