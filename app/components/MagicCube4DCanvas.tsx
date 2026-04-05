import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { GLView, type ExpoWebGLRenderingContext } from 'expo-gl';
import { Renderer } from 'expo-three';
import * as THREE from 'three';
import type { Mat3 } from '../utils/math3d';
import {
  buildMagicCube4DFrame,
  type MagicCube4DAnimation,
  type MagicCube4DPickInfo,
  type Mat4,
} from '../utils/magiccube4d';
import type { MagicCube4DSettings } from '../utils/magiccube4dSettings';

interface Props {
  state: number[];
  viewMatrix: Mat3;
  zoom: number;
  width: number;
  height: number;
  rotation4d: Mat4;
  twistAnimation: MagicCube4DAnimation | null;
  settings: MagicCube4DSettings;
  onPickReady?: (picker: (x: number, y: number) => MagicCube4DPickInfo | null) => void;
}

const EDGE_COLOR = 0x111111;
const DEFAULT_ZOOM = 0.62;

export default function MagicCube4DCanvas({
  state,
  viewMatrix,
  zoom,
  width,
  height,
  rotation4d,
  twistAnimation,
  settings,
  onPickReady,
}: Props) {
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.OrthographicCamera | null>(null);
  const glRef = useRef<ExpoWebGLRenderingContext | null>(null);
  const frameRef = useRef<number | null>(null);
  const faceMeshRef = useRef<THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial> | null>(null);
  const edgeLinesRef = useRef<THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial> | null>(null);

  const frameData = useMemo(
    () => buildMagicCube4DFrame(
      state,
      rotation4d,
      viewMatrix,
      twistAnimation,
      width,
      height,
      zoom / DEFAULT_ZOOM,
      settings,
    ),
    [state, rotation4d, viewMatrix, twistAnimation, width, height, zoom, settings],
  );

  const renderScene = useCallback(() => {
    const renderer = rendererRef.current;
    const scene = sceneRef.current;
    const camera = cameraRef.current;
    const gl = glRef.current;

    if (!renderer || !scene || !camera || !gl) {
      return;
    }

    renderer.render(scene, camera);
    gl.endFrameEXP();
  }, []);

  const scheduleRender = useCallback(() => {
    if (frameRef.current !== null) {
      return;
    }

    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      renderScene();
    });
  }, [renderScene]);

  const updateView = useCallback(() => {
    const renderer = rendererRef.current;
    const camera = cameraRef.current;
    const gl = glRef.current;

    if (!renderer || !camera || width <= 0 || height <= 0) {
      return;
    }

    if (gl) {
      renderer.setViewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
      renderer.setScissor(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
      renderer.setScissorTest(false);
      renderer.setSize(gl.drawingBufferWidth, gl.drawingBufferHeight, false);
    }

    camera.left = 0;
    camera.right = width;
    camera.top = 0;
    camera.bottom = height;
    camera.zoom = 1;
    camera.position.set(0, 0, 5);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    sceneRef.current?.updateMatrixWorld(true);
  }, [height, width]);

  const rebuildModel = useCallback(() => {
    const faceMesh = faceMeshRef.current;
    const edgeLines = edgeLinesRef.current;
    if (!faceMesh || !edgeLines) {
      return;
    }

    const facePositions: number[] = [];
    const faceColors: number[] = [];
    const edgePositions: number[] = [];

    for (let index = 0; index < frameData.polygons.length; index++) {
      const polygon = frameData.polygons[index];
      if (polygon.points.length < 3) {
        continue;
      }

      const color = new THREE.Color(polygon.color);

      for (let i = 1; i < polygon.points.length - 1; i++) {
        pushPoint(facePositions, polygon.points[0], index);
        pushColor(faceColors, color);
        pushPoint(facePositions, polygon.points[i], index);
        pushColor(faceColors, color);
        pushPoint(facePositions, polygon.points[i + 1], index);
        pushColor(faceColors, color);
      }

      for (let i = 0; i < polygon.points.length; i++) {
        const a = polygon.points[i];
        const b = polygon.points[(i + 1) % polygon.points.length];
        pushPoint(edgePositions, a, index);
        pushPoint(edgePositions, b, index);
      }
    }

    updateGeometry(faceMesh.geometry, facePositions, faceColors);
    updateGeometry(edgeLines.geometry, edgePositions);
  }, [frameData]);

  const pickInfo = useCallback((x: number, y: number): MagicCube4DPickInfo | null => {
    for (let i = frameData.polygons.length - 1; i >= 0; i--) {
      const polygon = frameData.polygons[i];
      if (hitsPolygon([x, y], polygon.points)) {
        return {
          stickerIndex: polygon.stickerIndex,
          cubieIndex: polygon.cubieIndex,
          faceIndex: polygon.faceIndex,
          gripIndex: polygon.gripIndex,
        };
      }
    }
    return null;
  }, [frameData]);

  useLayoutEffect(() => {
    onPickReady?.(pickInfo);
  }, [onPickReady, pickInfo]);

  useLayoutEffect(() => {
    rebuildModel();
    updateView();
    scheduleRender();
  }, [rebuildModel, scheduleRender, updateView]);

  useEffect(() => (
    () => {
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
      }
      disposeRenderable(faceMeshRef.current);
      disposeRenderable(edgeLinesRef.current);
      faceMeshRef.current = null;
      edgeLinesRef.current = null;
      rendererRef.current?.dispose();
    }
  ), []);

  const handleContextCreate = useCallback((gl: ExpoWebGLRenderingContext) => {
    glRef.current = gl;

    const renderer = new Renderer({
      gl,
      width: gl.drawingBufferWidth,
      height: gl.drawingBufferHeight,
      clearColor: 0x4a4a4a,
    }) as unknown as THREE.WebGLRenderer;
    renderer.setPixelRatio?.(1);
    renderer.setSize(gl.drawingBufferWidth, gl.drawingBufferHeight, false);
    renderer.sortObjects = true;
    rendererRef.current = renderer;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#4a4a4a');
    sceneRef.current = scene;

    const camera = new THREE.OrthographicCamera(
      0,
      width,
      0,
      height,
      0.1,
      10,
    );
    camera.position.set(0, 0, 5);
    camera.lookAt(0, 0, 0);
    camera.zoom = 1;
    camera.updateProjectionMatrix();
    cameraRef.current = camera;

    const faceMesh = new THREE.Mesh(
      new THREE.BufferGeometry(),
      new THREE.MeshBasicMaterial({
        vertexColors: true,
        side: THREE.DoubleSide,
        transparent: false,
        opacity: 1,
        blending: THREE.NoBlending,
        polygonOffset: true,
        polygonOffsetFactor: 1,
        polygonOffsetUnits: 1,
        depthTest: true,
        depthWrite: true,
      }),
    );
    faceMesh.renderOrder = 1;
    scene.add(faceMesh);
    faceMeshRef.current = faceMesh;

    const edgeLines = new THREE.LineSegments(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({
        color: EDGE_COLOR,
        depthTest: true,
        depthWrite: false,
      }),
    );
    edgeLines.renderOrder = 2;
    scene.add(edgeLines);
    edgeLinesRef.current = edgeLines;

    rebuildModel();
    updateView();
    scheduleRender();
  }, [height, rebuildModel, scheduleRender, updateView, width]);

  return (
    <GLView
      pointerEvents="none"
      style={{ width, height }}
      onContextCreate={handleContextCreate}
    />
  );
}

function disposeRenderable(object: THREE.Object3D | null) {
  if (!object) {
    return;
  }

  if ('geometry' in object && object.geometry instanceof THREE.BufferGeometry) {
    object.geometry.dispose();
  }

  if ('material' in object) {
    const material = object.material as THREE.Material | THREE.Material[];
    if (Array.isArray(material)) {
      for (const item of material) {
        item.dispose();
      }
    } else {
      material.dispose();
    }
  }
}

function updateGeometry(
  geometry: THREE.BufferGeometry,
  positions: number[],
  colors?: number[],
) {
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
  geometry.setDrawRange(0, positions.length / 3);

  if (colors) {
    geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(colors), 3));
  } else if (geometry.hasAttribute('color')) {
    geometry.deleteAttribute('color');
  }

  geometry.computeBoundingSphere();
}

function pushPoint(target: number[], point: [number, number], order: number) {
  target.push(point[0], point[1], order * 0.001);
}

function pushColor(target: number[], color: THREE.Color) {
  target.push(color.r, color.g, color.b);
}

function hitsPolygon(point: [number, number], polygon: [number, number][]): boolean {
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    if (twiceTriangleArea(a, b, point) > 0) {
      return false;
    }
  }
  return true;
}

function twiceTriangleArea(v0: [number, number], v1: [number, number], v2: [number, number]): number {
  const ax = v1[0] - v0[0];
  const ay = v1[1] - v0[1];
  const bx = v2[0] - v0[0];
  const by = v2[1] - v0[1];
  return ax * by - ay * bx;
}
