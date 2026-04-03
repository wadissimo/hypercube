import React, { useCallback, useEffect, useRef } from 'react';
import { GLView, type ExpoWebGLRenderingContext } from 'expo-gl';
import { Renderer } from 'expo-three';
import * as THREE from 'three';
import type { Mat3, Vec2, Vec3 } from '../utils/math3d';
import {
  HYPER_AXES,
  HYPERCUBE_CELLS,
  axisIndex as hyperAxisIndex,
  hyperCellCenterById,
  type HyperAxis,
  type HyperCubieDef,
  type HyperPreviewHitFace,
} from '../utils/hypercubeModel';
import type { Mat4, Vec4 } from '../utils/math4d';
import { mulVec4, project4dTo3d } from '../utils/math4d';

interface Props {
  cubies: HyperCubieDef[];
  viewMatrix: Mat3;
  zoom: number;
  width: number;
  height: number;
  rotationMatrix: Mat4;
  twistAnimation?: {
    cubieIds: Set<number>;
    matrix: Mat4;
  } | null;
  onPickReady?: (picker: (x: number, y: number) => HyperPreviewHitFace | null) => void;
}

interface DisplayState {
  cellCenter4D: Vec4;
  center: Vec3;
  offset: Vec3;
  axisBasis: Record<HyperAxis, Vec3 | undefined>;
  visible: boolean;
}

interface ProjectedCubie {
  cubie: HyperCubieDef;
  currentVertices4D: HyperCubieDef['vertices4D'];
}

interface RenderFace {
  cubieId: number;
  faceIndex: number;
  isShellFace: boolean;
  quad: [Vec3, Vec3, Vec3, Vec3];
  color: string;
}

interface NormalizedRenderFace extends RenderFace {
  quad: [Vec3, Vec3, Vec3, Vec3];
  depth: number;
}

const PREVIEW_CAMERA_W = 6.8;
const PREVIEW_VIEW_DIST = 42;
const ORTHO_HALF_HEIGHT = 12;
const FACE_STROKE = 0x101216;
const INNER_CELL_SCALE = 0.92;
const SIDE_CELL_SCALE = 0.92;
const SIDE_EXPLODED_DISTANCE = 1.3;
const TARGET_MODEL_SIZE = 8.2;

export default function HypercubePreviewCanvas({
  cubies,
  viewMatrix,
  zoom,
  width,
  height,
  rotationMatrix,
  twistAnimation = null,
  onPickReady,
}: Props) {
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.OrthographicCamera | null>(null);
  const viewGroupRef = useRef<THREE.Group | null>(null);
  const modelGroupRef = useRef<THREE.Group | null>(null);
  const normalizedFacesRef = useRef<NormalizedRenderFace[]>([]);
  const frameRef = useRef<number | null>(null);
  const glRef = useRef<ExpoWebGLRenderingContext | null>(null);
  const propsRef = useRef({
    cubies,
    viewMatrix,
    zoom,
    width,
    height,
    rotationMatrix,
    twistAnimation,
  });

  propsRef.current = {
    cubies,
    viewMatrix,
    zoom,
    width,
    height,
    rotationMatrix,
    twistAnimation,
  };

  const buildFaces = useCallback((): RenderFace[] => {
    const current = propsRef.current;
    const projectedCubies: ProjectedCubie[] = current.cubies.map(cubie => {
      const currentVertices4D = current.twistAnimation?.cubieIds.has(cubie.id)
        ? cubie.vertices4D.map(point => mulVec4(current.twistAnimation!.matrix, point)) as HyperCubieDef['vertices4D']
        : cubie.vertices4D;

      return {
        cubie,
        currentVertices4D,
      };
    });

    const cellDisplay = createCellDisplayStates(current.rotationMatrix);
    const faces: RenderFace[] = [];

    for (const projectedCubie of projectedCubies) {
      const display = cellDisplay.get(projectedCubie.cubie.cellId);
      if (!display || !display.visible) {
        continue;
      }

      const vertices3D = projectedCubie.currentVertices4D
        .map(point => projectDisplayPoint(point, projectedCubie.cubie, display)) as [Vec3, Vec3, Vec3, Vec3, Vec3, Vec3, Vec3, Vec3];
      const cubieCenter = averagePoint(vertices3D);

      for (let faceIndex = 0; faceIndex < projectedCubie.cubie.faces.length; faceIndex++) {
        const faceDef = projectedCubie.cubie.faces[faceIndex];
        const quad = faceDef.vertexIndices.map(index => vertices3D[index]) as [Vec3, Vec3, Vec3, Vec3];
        faces.push({
          cubieId: projectedCubie.cubie.id,
          faceIndex,
          isShellFace: faceDef.isShellFace,
          quad: orientQuad(quad, cubieCenter),
          color: projectedCubie.cubie.color,
        });
      }
    }

    return faces;
  }, []);

  const rebuildModel = useCallback(() => {
    const modelGroup = modelGroupRef.current;
    if (!modelGroup) {
      return;
    }

    const rawFaces = buildFaces();
    const normalizedFaces = normalizeFaces(rawFaces);

    clearGroup(modelGroup);
    normalizedFacesRef.current = normalizedFaces;
    modelGroup.position.set(0, 0, 0);
    modelGroup.scale.setScalar(1);

    const colorBuckets = new Map<string, number[]>();
    const edgePositions: number[] = [];

    for (const face of normalizedFaces) {
      const bucket = colorBuckets.get(face.color) ?? [];
      appendFaceTriangles(bucket, face.quad);
      colorBuckets.set(face.color, bucket);
      appendFaceEdges(edgePositions, face.quad);
    }

    for (const [color, positions] of colorBuckets) {
      const geometry = createGeometryFromPositions(positions, true);
      const material = new THREE.MeshLambertMaterial({
        color: new THREE.Color(color),
        polygonOffset: true,
        polygonOffsetFactor: 1,
        polygonOffsetUnits: 1,
        side: THREE.FrontSide,
      });
      modelGroup.add(new THREE.Mesh(geometry, material));
    }

    const edgeGeometry = createGeometryFromPositions(edgePositions, false);
    const edges = new THREE.LineSegments(
      edgeGeometry,
      new THREE.LineBasicMaterial({
        color: FACE_STROKE,
        depthWrite: false,
      }),
    );
    modelGroup.add(edges);
  }, [buildFaces]);

  const updateView = useCallback(() => {
    const renderer = rendererRef.current;
    const camera = cameraRef.current;
    const viewGroup = viewGroupRef.current;
    const gl = glRef.current;
    const current = propsRef.current;

    if (!renderer || !camera || !viewGroup || current.width <= 0 || current.height <= 0) {
      return;
    }

    if (gl) {
      renderer.setViewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
      renderer.setScissor(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
      renderer.setScissorTest(false);
    }
    const aspect = current.width / Math.max(current.height, 1);
    camera.left = -ORTHO_HALF_HEIGHT * aspect;
    camera.right = ORTHO_HALF_HEIGHT * aspect;
    camera.top = ORTHO_HALF_HEIGHT;
    camera.bottom = -ORTHO_HALF_HEIGHT;
    camera.zoom = current.zoom;
    camera.updateProjectionMatrix();

    viewGroup.matrixAutoUpdate = false;
    viewGroup.matrix.copy(mat3ToThreeMatrix(current.viewMatrix));
    viewGroup.matrixWorldNeedsUpdate = true;
    viewGroup.updateMatrixWorld(true);
    sceneRef.current?.updateMatrixWorld(true);
  }, []);

  const pickFace = useCallback((x: number, y: number): HyperPreviewHitFace | null => {
    const camera = cameraRef.current;
    const current = propsRef.current;

    if (!camera || current.width <= 0 || current.height <= 0 || normalizedFacesRef.current.length === 0) {
      return null;
    }

    camera.updateMatrixWorld();
    sceneRef.current?.updateMatrixWorld(true);
    const viewMatrix4 = mat3ToThreeMatrix(current.viewMatrix);
    let bestHit: HyperPreviewHitFace | null = null;
    let bestDepth = Infinity;

    for (const face of normalizedFacesRef.current) {
      const worldQuad = face.quad.map(point => toThreePoint(point).applyMatrix4(viewMatrix4)) as [
        THREE.Vector3,
        THREE.Vector3,
        THREE.Vector3,
        THREE.Vector3,
      ];
      const faceCenter = averageThree(worldQuad);
      const normal = new THREE.Vector3()
        .subVectors(worldQuad[1], worldQuad[0])
        .cross(new THREE.Vector3().subVectors(worldQuad[2], worldQuad[0]));
      const toCamera = new THREE.Vector3().subVectors(camera.position, faceCenter);

      if (normal.dot(toCamera) <= 0) {
        continue;
      }

      const screenQuad = worldQuad.map(point => projectToScreen(point, camera, current.width, current.height)) as [
        Vec2,
        Vec2,
        Vec2,
        Vec2,
      ];

      if (!pointInQuad([x, y], screenQuad)) {
        continue;
      }

      const depth = worldQuad.reduce(
        (sum, point) => sum + point.distanceToSquared(camera.position),
        0,
      ) / 4;

      if (depth < bestDepth) {
        bestDepth = depth;
        bestHit = {
          cubieId: face.cubieId,
          faceIndex: face.faceIndex,
          isShellFace: face.isShellFace,
          quad: screenQuad,
          regions: [],
          z: face.depth,
        };
      }
    }

    return bestHit;
  }, []);

  useEffect(() => {
    onPickReady?.(pickFace);
  }, [onPickReady, pickFace]);

  useEffect(() => {
    rebuildModel();
  }, [rebuildModel, cubies, rotationMatrix, twistAnimation]);

  useEffect(() => {
    updateView();
  }, [updateView, viewMatrix, zoom, width, height]);

  useEffect(() => (
    () => {
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current);
      }
      clearGroup(modelGroupRef.current);
      rendererRef.current?.dispose();
    }
  ), []);

  const handleContextCreate = useCallback(async (gl: ExpoWebGLRenderingContext) => {
    glRef.current = gl;
    const renderer = new Renderer({
      gl,
      width: gl.drawingBufferWidth,
      height: gl.drawingBufferHeight,
      clearColor: 0x1a1a2e,
    }) as unknown as THREE.WebGLRenderer;
    renderer.setPixelRatio?.(1);
    renderer.setSize(gl.drawingBufferWidth, gl.drawingBufferHeight, false);
    renderer.setViewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    renderer.sortObjects = true;
    rendererRef.current = renderer;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#1a1a2e');
    sceneRef.current = scene;

    const aspect = gl.drawingBufferWidth / Math.max(gl.drawingBufferHeight, 1);
    const camera = new THREE.OrthographicCamera(
      -ORTHO_HALF_HEIGHT * aspect,
      ORTHO_HALF_HEIGHT * aspect,
      ORTHO_HALF_HEIGHT,
      -ORTHO_HALF_HEIGHT,
      0.1,
      1000,
    );
    camera.position.set(0, 0, PREVIEW_VIEW_DIST);
    camera.lookAt(0, 0, 0);
    camera.zoom = propsRef.current.zoom;
    camera.updateProjectionMatrix();
    cameraRef.current = camera;

    scene.add(new THREE.AmbientLight(0xffffff, 0.72));
    const keyLight = new THREE.DirectionalLight(0xffffff, 0.65);
    keyLight.position.set(8, 10, 14);
    scene.add(keyLight);

    const viewGroup = new THREE.Group();
    viewGroup.matrixAutoUpdate = false;
    scene.add(viewGroup);
    viewGroupRef.current = viewGroup;

    const modelGroup = new THREE.Group();
    viewGroup.add(modelGroup);
    modelGroupRef.current = modelGroup;

    rebuildModel();
    updateView();

    const renderLoop = () => {
      frameRef.current = requestAnimationFrame(renderLoop);
      renderer.render(scene, camera);
      gl.endFrameEXP();
    };

    renderLoop();
  }, [rebuildModel, updateView]);

  return (
    <GLView
      pointerEvents="none"
      style={{ width, height }}
      onContextCreate={handleContextCreate}
    />
  );
}

function createCellDisplayStates(rotationMatrix: Mat4): Map<string, DisplayState> {
  const cellEntries = HYPERCUBE_CELLS.map(cell => {
    const cellCenter4D = hyperCellCenterById(cell.id);
    const rotatedCenter4D = mulVec4(rotationMatrix, cellCenter4D);
    const projectedCenter3D = project4dTo3d(rotatedCenter4D, PREVIEW_CAMERA_W);
    const cellAxes = HYPER_AXES.filter(axis => axis !== cell.fixedAxis) as [HyperAxis, HyperAxis, HyperAxis];
    const rawBasis = cellAxes.map(axis => projectAxisBasis(cellCenter4D, rotationMatrix, axis)) as [Vec3, Vec3, Vec3];

    return {
      cellId: cell.id,
      cellCenter4D,
      cellAxes,
      rawBasis,
      rotatedCenter4D,
      projectedCenter3D,
    };
  }).sort((a, b) => a.rotatedCenter4D[3] - b.rotatedCenter4D[3]);

  const innerEntry = cellEntries[0];
  const outerCellId = cellEntries[cellEntries.length - 1]?.cellId;
  const innerCenter = innerEntry?.projectedCenter3D ?? [0, 0, 0] as Vec3;
  const innerBasisLength = innerEntry
    ? averageVecLength(innerEntry.rawBasis) * INNER_CELL_SCALE
    : 1;
  const display = new Map<string, DisplayState>();

  for (const entry of cellEntries) {
    const visible = entry.cellId !== outerCellId;
    const isInner = entry.cellId === innerEntry?.cellId;
    const basisLength = innerBasisLength * (isInner ? 1 : SIDE_CELL_SCALE / INNER_CELL_SCALE);
    const rigidBasis = buildRigidBasis(entry.rawBasis, basisLength);
    const axisBasis: Record<HyperAxis, Vec3 | undefined> = { x: undefined, y: undefined, z: undefined, w: undefined };

    for (let i = 0; i < entry.cellAxes.length; i++) {
      axisBasis[entry.cellAxes[i]] = rigidBasis[i];
    }

    display.set(entry.cellId, {
      cellCenter4D: entry.cellCenter4D,
      visible,
      center: entry.projectedCenter3D,
      offset: explodeOffset(subtract(entry.projectedCenter3D, innerCenter), isInner ? 0 : SIDE_EXPLODED_DISTANCE),
      axisBasis,
    });
  }

  return display;
}

function projectDisplayPoint(point: Vec4, cubie: HyperCubieDef, display: DisplayState): Vec3 {
  let projected = add3(display.center, display.offset);

  for (const axis of cubie.localAxes) {
    const basis = display.axisBasis[axis];
    if (!basis) {
      continue;
    }

    const coeff = point[hyperAxisIndex(axis)] - display.cellCenter4D[hyperAxisIndex(axis)];
    projected = add3(projected, scale3(basis, coeff));
  }

  return projected;
}

function orientQuad(quad: [Vec3, Vec3, Vec3, Vec3], center: Vec3): [Vec3, Vec3, Vec3, Vec3] {
  const faceCenter = averagePoint(quad);
  const outward = subtract(faceCenter, center);
  const normal = cross3(subtract(quad[1], quad[0]), subtract(quad[2], quad[0]));
  return dot3(normal, outward) >= 0 ? quad : [quad[0], quad[3], quad[2], quad[1]];
}

function normalizeFaces(faces: RenderFace[]): NormalizedRenderFace[] {
  if (faces.length === 0) {
    return [];
  }

  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;

  for (const face of faces) {
    for (const point of face.quad) {
      minX = Math.min(minX, point[0]);
      minY = Math.min(minY, point[1]);
      minZ = Math.min(minZ, point[2]);
      maxX = Math.max(maxX, point[0]);
      maxY = Math.max(maxY, point[1]);
      maxZ = Math.max(maxZ, point[2]);
    }
  }

  const center: Vec3 = [
    (minX + maxX) / 2,
    (minY + maxY) / 2,
    (minZ + maxZ) / 2,
  ];
  const maxDim = Math.max(maxX - minX, maxY - minY, maxZ - minZ, 0.001);
  const fitScale = TARGET_MODEL_SIZE / maxDim;

  return faces.map(face => ({
    ...face,
    quad: face.quad.map(point => scale3(subtract(point, center), fitScale)) as [Vec3, Vec3, Vec3, Vec3],
    depth: averageZ(face.quad),
  }));
}

function createGeometryFromPositions(positions: number[], computeNormals: boolean): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
  if (computeNormals) {
    geometry.computeVertexNormals();
  }
  return geometry;
}

function appendFaceTriangles(target: number[], quad: [Vec3, Vec3, Vec3, Vec3]) {
  appendPoint(target, quad[0]);
  appendPoint(target, quad[2]);
  appendPoint(target, quad[1]);
  appendPoint(target, quad[0]);
  appendPoint(target, quad[3]);
  appendPoint(target, quad[2]);
}

function appendFaceEdges(target: number[], quad: [Vec3, Vec3, Vec3, Vec3]) {
  appendSegment(target, quad[0], quad[1]);
  appendSegment(target, quad[1], quad[2]);
  appendSegment(target, quad[2], quad[3]);
  appendSegment(target, quad[3], quad[0]);
}

function appendSegment(target: number[], a: Vec3, b: Vec3) {
  appendPoint(target, a);
  appendPoint(target, b);
}

function appendPoint(target: number[], point: Vec3) {
  const threePoint = toThreePoint(point);
  target.push(threePoint.x, threePoint.y, threePoint.z);
}

function clearGroup(group: THREE.Group | null) {
  if (!group) {
    return;
  }

  while (group.children.length > 0) {
    const child = group.children[0];
    group.remove(child);

    const geometry = (child as THREE.Mesh).geometry;
    if (geometry && 'dispose' in geometry) {
      geometry.dispose();
    }

    const material = (child as THREE.Mesh).material;
    if (Array.isArray(material)) {
      for (const item of material) {
        item.dispose();
      }
    } else if (material && 'dispose' in material) {
      material.dispose();
    }
  }
}

function mat3ToThreeMatrix(matrix: Mat3): THREE.Matrix4 {
  const m00 = matrix[0][0];
  const m01 = matrix[0][1];
  const m02 = -matrix[0][2];
  const m10 = matrix[1][0];
  const m11 = matrix[1][1];
  const m12 = -matrix[1][2];
  const m20 = -matrix[2][0];
  const m21 = -matrix[2][1];
  const m22 = matrix[2][2];

  return new THREE.Matrix4().set(
    m00, m01, m02, 0,
    m10, m11, m12, 0,
    m20, m21, m22, 0,
    0, 0, 0, 1,
  );
}

function toThreePoint(point: Vec3): THREE.Vector3 {
  return new THREE.Vector3(point[0], point[1], -point[2]);
}

function averageThree(points: THREE.Vector3[]): THREE.Vector3 {
  const inv = 1 / points.length;
  return new THREE.Vector3(
    points.reduce((sum, point) => sum + point.x, 0) * inv,
    points.reduce((sum, point) => sum + point.y, 0) * inv,
    points.reduce((sum, point) => sum + point.z, 0) * inv,
  );
}

function projectToScreen(
  point: THREE.Vector3,
  camera: THREE.Camera,
  width: number,
  height: number,
): Vec2 {
  const projected = point.clone().project(camera);
  return [
    ((projected.x + 1) * 0.5) * width,
    ((1 - projected.y) * 0.5) * height,
  ];
}

function pointInQuad(point: Vec2, quad: [Vec2, Vec2, Vec2, Vec2]): boolean {
  return pointInTriangle(point, quad[0], quad[1], quad[2]) || pointInTriangle(point, quad[0], quad[2], quad[3]);
}

function pointInTriangle(point: Vec2, a: Vec2, b: Vec2, c: Vec2): boolean {
  const area = (p0: Vec2, p1: Vec2, p2: Vec2) => (
    (p1[0] - p0[0]) * (p2[1] - p0[1]) - (p1[1] - p0[1]) * (p2[0] - p0[0])
  );
  const ab = area(a, b, point);
  const bc = area(b, c, point);
  const ca = area(c, a, point);
  const hasNeg = ab < 0 || bc < 0 || ca < 0;
  const hasPos = ab > 0 || bc > 0 || ca > 0;
  return !(hasNeg && hasPos);
}

function averagePoint(points: Vec3[]): Vec3 {
  const inv = 1 / points.length;
  return [
    points.reduce((sum, point) => sum + point[0], 0) * inv,
    points.reduce((sum, point) => sum + point[1], 0) * inv,
    points.reduce((sum, point) => sum + point[2], 0) * inv,
  ];
}

function averageZ(points: Vec3[]): number {
  return points.reduce((sum, point) => sum + point[2], 0) / points.length;
}

function add3(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function subtract(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function scale3(v: Vec3, scalar: number): Vec3 {
  return [v[0] * scalar, v[1] * scalar, v[2] * scalar];
}

function cross3(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function dot3(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function explodeOffset(projectedCenter: Vec3, magnitude: number): Vec3 {
  if (magnitude <= 0) {
    return [0, 0, 0];
  }

  const radialDir = normalizeScreenRadial(projectedCenter);
  if (!radialDir) {
    return [0, 0, 0];
  }

  return scale3(radialDir, magnitude);
}

function normalizeScreenRadial(v: Vec3): Vec3 | null {
  const length = Math.hypot(v[0], v[1]);
  if (length < 0.001) {
    return null;
  }

  return [v[0] / length, v[1] / length, 0];
}

function projectAxisBasis(center4D: Vec4, rotationMatrix: Mat4, axis: HyperAxis): Vec3 {
  const unit = axisUnit4(axis);
  const plus = project4dTo3d(mulVec4(rotationMatrix, add4(center4D, unit)), PREVIEW_CAMERA_W);
  const minus = project4dTo3d(mulVec4(rotationMatrix, sub4(center4D, unit)), PREVIEW_CAMERA_W);
  return scale3(subtract(plus, minus), 0.5);
}

function buildRigidBasis(rawBasis: [Vec3, Vec3, Vec3], targetLength: number): [Vec3, Vec3, Vec3] {
  const first = normalizeVec3(rawBasis[0]) ?? [1, 0, 0];
  const secondCandidate = subtract(rawBasis[1], scale3(first, dot3(rawBasis[1], first)));
  const second = normalizeVec3(secondCandidate)
    ?? normalizeVec3(perpendicularVec3(first))
    ?? [0, 1, 0];
  const thirdCandidate = subtract(
    subtract(rawBasis[2], scale3(first, dot3(rawBasis[2], first))),
    scale3(second, dot3(rawBasis[2], second)),
  );
  const third = normalizeVec3(thirdCandidate)
    ?? normalizeVec3(cross3(first, second))
    ?? [0, 0, 1];

  return [
    scale3(first, targetLength),
    scale3(second, targetLength),
    scale3(third, targetLength),
  ];
}

function averageVecLength(vectors: Vec3[]): number {
  return vectors.reduce((sum, vector) => sum + Math.hypot(vector[0], vector[1], vector[2]), 0) / vectors.length;
}

function normalizeVec3(v: Vec3): Vec3 | null {
  const length = Math.hypot(v[0], v[1], v[2]);
  if (length < 0.0001) {
    return null;
  }

  return [v[0] / length, v[1] / length, v[2] / length];
}

function perpendicularVec3(v: Vec3): Vec3 {
  return Math.abs(v[0]) < 0.8 ? cross3(v, [1, 0, 0]) : cross3(v, [0, 1, 0]);
}

function axisUnit4(axis: HyperAxis): Vec4 {
  switch (axis) {
    case 'x':
      return [1, 0, 0, 0];
    case 'y':
      return [0, 1, 0, 0];
    case 'z':
      return [0, 0, 1, 0];
    case 'w':
      return [0, 0, 0, 1];
  }
}

function add4(a: Vec4, b: Vec4): Vec4 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2], a[3] + b[3]];
}

function sub4(a: Vec4, b: Vec4): Vec4 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2], a[3] - b[3]];
}
