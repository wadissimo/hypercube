import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { GLView, type ExpoWebGLRenderingContext } from 'expo-gl';
import { Renderer } from 'expo-three';
import * as THREE from 'three';
import type { Mat3 } from '../utils/math3d';
import {
  buildMagicCube4DFrame,
  type MagicCube4DPickInfo,
  type MagicCube4DTwistAnimation,
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
  twistAnimation: MagicCube4DTwistAnimation | null;
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
  const modelGroupRef = useRef<THREE.Group | null>(null);
  const propsRef = useRef({
    state,
    viewMatrix,
    zoom,
    width,
    height,
    rotation4d,
    twistAnimation,
    settings,
  });

  propsRef.current = {
    state,
    viewMatrix,
    zoom,
    width,
    height,
    rotation4d,
    twistAnimation,
    settings,
  };

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

  const updateView = useCallback(() => {
    const renderer = rendererRef.current;
    const camera = cameraRef.current;
    const gl = glRef.current;
    const current = propsRef.current;

    if (!renderer || !camera || current.width <= 0 || current.height <= 0) {
      return;
    }

    if (gl) {
      renderer.setViewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
      renderer.setScissor(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
      renderer.setScissorTest(false);
      renderer.setSize(gl.drawingBufferWidth, gl.drawingBufferHeight, false);
    }

    camera.left = 0;
    camera.right = current.width;
    camera.top = 0;
    camera.bottom = current.height;
    camera.zoom = 1;
    camera.position.set(0, 0, 5);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    sceneRef.current?.updateMatrixWorld(true);
  }, []);

  const rebuildModel = useCallback(() => {
    const modelGroup = modelGroupRef.current;
    if (!modelGroup) {
      return;
    }

    clearGroup(modelGroup);
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

    const faceGeometry = new THREE.BufferGeometry();
    faceGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(facePositions), 3));
    faceGeometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(faceColors), 3));
    const mesh = new THREE.Mesh(
      faceGeometry,
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
    mesh.renderOrder = 1;
    modelGroup.add(mesh);

    const edgeGeometry = new THREE.BufferGeometry();
    edgeGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(edgePositions), 3));
    const edges = new THREE.LineSegments(
      edgeGeometry,
      new THREE.LineBasicMaterial({
        color: EDGE_COLOR,
        depthTest: true,
        depthWrite: false,
      }),
    );
    edges.renderOrder = 2;
    modelGroup.add(edges);
  }, [frameData]);

  const pickInfo = useCallback((x: number, y: number): MagicCube4DPickInfo | null => {
    for (let i = frameData.polygons.length - 1; i >= 0; i--) {
      const polygon = frameData.polygons[i];
      if (hitsPolygon([x, y], polygon.points)) {
        return {
          stickerIndex: polygon.stickerIndex,
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
  }, [rebuildModel]);

  useLayoutEffect(() => {
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

    const modelGroup = new THREE.Group();
    scene.add(modelGroup);
    modelGroupRef.current = modelGroup;

    rebuildModel();
    updateView();

    const renderLoop = () => {
      frameRef.current = requestAnimationFrame(renderLoop);
      renderer.render(scene, camera);
      gl.endFrameEXP();
    };

    renderLoop();
  }, [height, rebuildModel, updateView, width]);

  return (
    <GLView
      pointerEvents="none"
      style={{ width, height }}
      onContextCreate={handleContextCreate}
    />
  );
}

function clearGroup(group: THREE.Group | null) {
  if (!group) {
    return;
  }

  while (group.children.length > 0) {
    const child = group.children[0];
    if (!child) {
      continue;
    }
    group.remove(child);

    if ('geometry' in child && child.geometry instanceof THREE.BufferGeometry) {
      child.geometry.dispose();
    }

    if ('material' in child) {
      const material = child.material as THREE.Material | THREE.Material[];
      if (Array.isArray(material)) {
        for (const item of material) {
          item.dispose();
        }
      } else {
        material.dispose();
      }
    }
  }
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
