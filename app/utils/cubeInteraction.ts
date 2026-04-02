import type { Vec3, Vec2, Mat3 } from './math3d';
import { mulVec, project } from './math3d';
import { CAMERA_FOV, stickerQuad, viewDist } from './cubeGeometry';
import type { CubeSize, CubeState, Face } from './cubeModel';
import {
  faceAxisCoord,
  outerCoord,
  twistRotationMatrix,
  vectorToFace,
} from './cubeModel';
import { CUBE_3D_TOPOLOGY } from './puzzleTopology';

// Winding-agnostic point-in-convex-quad test
function pointInQuad(px: number, py: number, quad: Vec2[]): boolean {
  let pos = 0, neg = 0;
  for (let i = 0; i < 4; i++) {
    const [x1, y1] = quad[i];
    const [x2, y2] = quad[(i + 1) % 4];
    const cross = (x2 - x1) * (py - y1) - (y2 - y1) * (px - x1);
    if (cross > 0) pos++;
    else if (cross < 0) neg++;
  }
  return pos === 0 || neg === 0;
}

export interface StickerHit {
  face: Face;
  position: Vec3;
}

function visibleFaceCount(position: Vec3, cubeSize: CubeSize): number {
  const outer = outerCoord(cubeSize);
  return position.filter(coord => Math.abs(Math.abs(coord) - outer) < 0.01).length;
}

const FACE_NORMALS: Record<Face, Vec3> = {
  U: CUBE_3D_TOPOLOGY.faces.U.normal3D!,
  D: CUBE_3D_TOPOLOGY.faces.D.normal3D!,
  R: CUBE_3D_TOPOLOGY.faces.R.normal3D!,
  L: CUBE_3D_TOPOLOGY.faces.L.normal3D!,
  F: CUBE_3D_TOPOLOGY.faces.F.normal3D!,
  B: CUBE_3D_TOPOLOGY.faces.B.normal3D!,
};

export function hitTestSticker(
  screenX: number, screenY: number,
  cubeState: CubeState, cubeSize: CubeSize,
  viewMatrix: Mat3, zoom: number,
  width: number, height: number,
): StickerHit | null {
  if (width === 0 || height === 0) return null;

  const cx = width / 2, cy = height / 2;
  const fov = CAMERA_FOV * zoom;
  const dist = viewDist(cubeSize);

  const candidates: { face: Face; position: Vec3; quad: Vec2[]; z: number }[] = [];

  for (const cubie of cubeState) {
    for (const [face] of Object.entries(cubie.faces) as [Face, Face][]) {
      // Skip back-facing stickers (normal pointing away from camera)
      const normal = mulVec(viewMatrix, FACE_NORMALS[face]);
      if (normal[2] > 0) continue;

      const [px, py, pz] = cubie.position;
      const verts = stickerQuad(px, py, pz, face, cubeSize).map(v => mulVec(viewMatrix, v));
      const quad = verts.map(v => project(v as Vec3, fov, dist, cx, cy)) as Vec2[];
      const z = (verts[0][2] + verts[1][2] + verts[2][2] + verts[3][2]) / 4;
      candidates.push({ face, position: cubie.position, quad, z });
    }
  }

  // Front-to-back: smallest z = closest to camera
  candidates.sort((a, b) => a.z - b.z);

  for (const c of candidates) {
    if (pointInQuad(screenX, screenY, c.quad)) {
      return { face: c.face, position: c.position };
    }
  }
  return null;
}

// Face tangent vectors: t1 = "right", t2 = "up" when looking at the face from outside
const FACE_TANGENTS: Record<Face, [Vec3, Vec3]> = {
  U: CUBE_3D_TOPOLOGY.faces.U.tangents3D!,
  D: CUBE_3D_TOPOLOGY.faces.D.tangents3D!,
  R: CUBE_3D_TOPOLOGY.faces.R.tangents3D!,
  L: CUBE_3D_TOPOLOGY.faces.L.tangents3D!,
  F: CUBE_3D_TOPOLOGY.faces.F.tangents3D!,
  B: CUBE_3D_TOPOLOGY.faces.B.tangents3D!,
};

function dot3(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export interface MoveResult {
  face: Face;
  clockwise: boolean;
  layer: number;
}

export function swipeToMove(
  stickerFace: Face,
  cubiePosition: Vec3,
  swipeDelta: [number, number],
  viewMatrix: Mat3,
  zoom: number,
  cubeSize: CubeSize,
  width: number,
  height: number,
): MoveResult | null {
  const [t1, t2] = FACE_TANGENTS[stickerFace];
  const cx = width / 2, cy = height / 2;
  const fov = CAMERA_FOV * zoom;
  const dist = viewDist(cubeSize);

  // Preserve the existing swipe basis so swipe behavior remains unchanged.
  const center3D = mulVec(viewMatrix, cubiePosition);
  const center2D = project(center3D, fov, dist, cx, cy);

  const t1End = mulVec(viewMatrix, [
    cubiePosition[0] + t1[0], cubiePosition[1] + t1[1], cubiePosition[2] + t1[2],
  ] as Vec3);
  const st1: Vec2 = [
    project(t1End, fov, dist, cx, cy)[0] - center2D[0],
    project(t1End, fov, dist, cx, cy)[1] - center2D[1],
  ];

  const t2End = mulVec(viewMatrix, [
    cubiePosition[0] + t2[0], cubiePosition[1] + t2[1], cubiePosition[2] + t2[2],
  ] as Vec3);
  const st2: Vec2 = [
    project(t2End, fov, dist, cx, cy)[0] - center2D[0],
    project(t2End, fov, dist, cx, cy)[1] - center2D[1],
  ];

  // Decompose screen swipe into face tangent components: swipe = a*st1 + b*st2
  const det = st1[0] * st2[1] - st1[1] * st2[0];
  if (Math.abs(det) < 0.001) return null;

  const a = (swipeDelta[0] * st2[1] - swipeDelta[1] * st2[0]) / det;
  const b = (st1[0] * swipeDelta[1] - st1[1] * swipeDelta[0]) / det;

  // Dominant swipe axis determines which perpendicular layer to rotate
  let swipeDir: Vec3;
  let layerAxis: Vec3;
  let layerCoord: number;

  if (Math.abs(a) > Math.abs(b)) {
    swipeDir = a > 0 ? t1 : [-t1[0], -t1[1], -t1[2]];
    layerAxis = t2;
    layerCoord = dot3(cubiePosition, t2);
  } else {
    swipeDir = b > 0 ? t2 : [-t2[0], -t2[1], -t2[2]];
    layerAxis = t1;
    layerCoord = dot3(cubiePosition, t1);
  }

  // Determine target face — the face whose rotation axis matches the layer axis
  const outer = outerCoord(cubeSize);
  let targetFace: Face;

  if (Math.abs(layerCoord) > 0.01) {
    // Non-zero coordinate: face is on the same side as the layer
    targetFace = layerCoord > 0
      ? vectorToFace(layerAxis)
      : vectorToFace([-layerAxis[0], -layerAxis[1], -layerAxis[2]] as Vec3);
  } else if (Math.abs(layerCoord) < 0.01 && cubeSize === 3) {
    // Middle layer on 3x3: no standard face move
    return null;
  } else {
    return null;
  }

  const targetLayer = faceAxisCoord(targetFace, cubiePosition);

  // Verify the layer coordinate is a valid cubie position
  if (Math.abs(targetLayer) > outer + 0.01) return null;

  // Determine CW/CCW: simulate a tiny CW rotation and check alignment with swipe
  const eps = 0.001;
  const mat = twistRotationMatrix(targetFace, eps);
  const moved = mulVec(mat, cubiePosition);
  const movement: Vec3 = [
    moved[0] - cubiePosition[0],
    moved[1] - cubiePosition[1],
    moved[2] - cubiePosition[2],
  ];
  const clockwise = dot3(movement, swipeDir) > 0;

  return { face: targetFace, clockwise, layer: targetLayer };
}

export function tapToMove(
  stickerFace: Face,
  cubiePosition: Vec3,
  _tapPoint: [number, number],
  _viewMatrix: Mat3,
  _zoom: number,
  cubeSize: CubeSize,
  _width: number,
  _height: number,
): MoveResult | null {
  // Corner taps are ambiguous, and 2x2 consists entirely of corners.
  if (visibleFaceCount(cubiePosition, cubeSize) >= 3) {
    return null;
  }

  const [t1, t2] = FACE_TANGENTS[stickerFace];
  const outer = outerCoord(cubeSize);
  const u = dot3(cubiePosition, t1);
  const v = dot3(cubiePosition, t2);
  const canTurnUAxis = Math.abs(u) < outer - 0.01;
  const canTurnVAxis = Math.abs(v) < outer - 0.01;
  if (!canTurnUAxis && !canTurnVAxis) return null;
  const distances: { face: Face; distance: number }[] = [];
  if (canTurnUAxis) {
    distances.push(
      { face: vectorToFace(t1), distance: outer - u },
      { face: vectorToFace([-t1[0], -t1[1], -t1[2]] as Vec3), distance: outer + u },
    );
  }
  if (canTurnVAxis) {
    distances.push(
      { face: vectorToFace(t2), distance: outer - v },
      { face: vectorToFace([-t2[0], -t2[1], -t2[2]] as Vec3), distance: outer + v },
    );
  }
  distances.sort((a, b) => a.distance - b.distance);

  for (const { face } of distances) {
    const layer = faceAxisCoord(face, cubiePosition);
    if (Math.abs(layer) < outer - 0.01) {
      const towardFaceCenter: Vec3 = [
        -u * t1[0] - v * t2[0],
        -u * t1[1] - v * t2[1],
        -u * t1[2] - v * t2[2],
      ];
      const eps = 0.001;
      const moved = mulVec(twistRotationMatrix(face, eps), cubiePosition);
      const movement: Vec3 = [
        moved[0] - cubiePosition[0],
        moved[1] - cubiePosition[1],
        moved[2] - cubiePosition[2],
      ];
      const clockwise = dot3(movement, towardFaceCenter) < 0;
      return { face, clockwise, layer };
    }
  }

  return null;
}
