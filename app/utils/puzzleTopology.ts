import type { Vec3 } from './math3d';

export type SpaceAxis = 'x' | 'y' | 'z' | 'w';
export type TopologyDimension = 3 | 4;

export interface FaceTopology<AxisName extends SpaceAxis = SpaceAxis> {
  axis: AxisName;
  sign: 1 | -1;
  normal3D?: Vec3;
  tangents3D?: [Vec3, Vec3];
}

export interface PuzzleTopology<FaceName extends string, AxisName extends SpaceAxis = SpaceAxis> {
  id: string;
  dimension: TopologyDimension;
  axes: readonly AxisName[];
  faces: Record<FaceName, FaceTopology<AxisName>>;
}

export type CubeAxis = 'x' | 'y' | 'z';
export type CubeFace = 'U' | 'D' | 'R' | 'L' | 'F' | 'B';

export const CUBE_3D_TOPOLOGY: PuzzleTopology<CubeFace, CubeAxis> = {
  id: 'cube-3d',
  dimension: 3,
  axes: ['x', 'y', 'z'],
  faces: {
    U: {
      axis: 'y',
      sign: 1,
      normal3D: [0, 1, 0],
      tangents3D: [[1, 0, 0], [0, 0, -1]],
    },
    D: {
      axis: 'y',
      sign: -1,
      normal3D: [0, -1, 0],
      tangents3D: [[1, 0, 0], [0, 0, 1]],
    },
    R: {
      axis: 'x',
      sign: 1,
      normal3D: [1, 0, 0],
      tangents3D: [[0, 0, -1], [0, 1, 0]],
    },
    L: {
      axis: 'x',
      sign: -1,
      normal3D: [-1, 0, 0],
      tangents3D: [[0, 0, 1], [0, 1, 0]],
    },
    F: {
      axis: 'z',
      sign: 1,
      normal3D: [0, 0, 1],
      tangents3D: [[1, 0, 0], [0, 1, 0]],
    },
    B: {
      axis: 'z',
      sign: -1,
      normal3D: [0, 0, -1],
      tangents3D: [[-1, 0, 0], [0, 1, 0]],
    },
  },
};
