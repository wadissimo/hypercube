import { useCallback, useEffect, useRef, useReducer } from 'react';
import { Gesture } from 'react-native-gesture-handler';
import type { Mat3 } from '../utils/math3d';
import { cloneMat3, mulMat, rotX, rotY, rotZ } from '../utils/math3d';
import type { CubeSize, CubeState, Face } from '../utils/cubeModel';
import { buildSwipeLayers } from '../utils/cubeModel';
import { hitTestSticker, swipeToMove, tapToMove } from '../utils/cubeInteraction';
import type { StickerHit } from '../utils/cubeInteraction';

const SENSITIVITY = 0.006;
const INITIAL_RX = Math.PI / 5.5;
const INITIAL_RY = -Math.PI / 5;
const INITIAL_ZOOM = 1;
const MIN_ZOOM = 0.65;
const MAX_ZOOM = 1.9;
const SWIPE_THRESHOLD = 5;
const LONG_PRESS_MS = 300;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

interface Params {
  cubeState: CubeState;
  cubeSize: CubeSize;
  width: number;
  height: number;
  onTwist: (face: Face, clockwise: boolean, layers: number[]) => void;
  disabled: boolean;
}

export function useCubeGesture(params: Params) {
  const viewMatrix = useRef<Mat3>(mulMat(rotX(INITIAL_RX), rotY(INITIAL_RY)));
  const zoom = useRef(INITIAL_ZOOM);
  const pinchStartZoom = useRef(INITIAL_ZOOM);
  const prevTranslation = useRef<[number, number]>([0, 0]);
  const [, forceRender] = useReducer((x: number) => x + 1, 0);
  const renderFrameRef = useRef<number | null>(null);

  // Sticker interaction state
  const hitRef = useRef<StickerHit | null>(null);
  const moveExecutedRef = useRef(false);
  const touchTimeRef = useRef(0);
  const touchPointRef = useRef<[number, number]>([0, 0]);

  // Latest params via ref so gesture callbacks always see current values
  const p = useRef(params);
  p.current = params;

  useEffect(() => (
    () => {
      if (renderFrameRef.current !== null) {
        cancelAnimationFrame(renderFrameRef.current);
      }
    }
  ), []);

  const scheduleRender = useCallback(() => {
    if (renderFrameRef.current !== null) {
      return;
    }

    renderFrameRef.current = requestAnimationFrame(() => {
      renderFrameRef.current = null;
      forceRender();
    });
  }, []);

  const panGesture = Gesture.Pan()
    .runOnJS(true)
    .minDistance(0)
    .onBegin((e) => {
      prevTranslation.current = [0, 0];
      moveExecutedRef.current = false;
      touchTimeRef.current = Date.now();
      touchPointRef.current = [e.x, e.y];

      if (p.current.disabled) {
        hitRef.current = null;
        return;
      }

      hitRef.current = hitTestSticker(
        e.x, e.y,
        p.current.cubeState, p.current.cubeSize,
        viewMatrix.current, zoom.current,
        p.current.width, p.current.height,
      );
    })
    .onUpdate((e) => {
      if (hitRef.current && !moveExecutedRef.current) {
        // Sticker was touched — wait for swipe threshold
        const dx = e.translationX;
        const dy = e.translationY;
        if (Math.abs(dx) + Math.abs(dy) > SWIPE_THRESHOLD) {
          const isLong = Date.now() - touchTimeRef.current > LONG_PRESS_MS;
          const move = swipeToMove(
            hitRef.current.face,
            hitRef.current.position,
            [dx, dy],
            viewMatrix.current,
            zoom.current,
            p.current.cubeSize,
            p.current.width,
            p.current.height,
          );
          if (move) {
            const layers = buildSwipeLayers(p.current.cubeSize, move.layer, isLong);
            p.current.onTwist(move.face, move.clockwise, layers);
            moveExecutedRef.current = true;
          } else {
            // No valid move for this sticker/direction — fall back to view rotation
            hitRef.current = null;
            prevTranslation.current = [e.translationX, e.translationY];
          }
        }
      } else if (!hitRef.current) {
        // View rotation
        const dx = e.translationX - prevTranslation.current[0];
        const dy = e.translationY - prevTranslation.current[1];
        prevTranslation.current = [e.translationX, e.translationY];
        const delta = mulMat(rotX(-dy * SENSITIVITY), rotY(-dx * SENSITIVITY));
        viewMatrix.current = mulMat(delta, viewMatrix.current);
        scheduleRender();
      }
    })
    .onFinalize((e) => {
      if (!hitRef.current || moveExecutedRef.current || p.current.disabled) {
        hitRef.current = null;
        return;
      }

      const totalMovement = Math.abs(e.translationX) + Math.abs(e.translationY);
      if (totalMovement <= SWIPE_THRESHOLD) {
        const move = tapToMove(
          hitRef.current.face,
          hitRef.current.position,
          touchPointRef.current,
          viewMatrix.current,
          zoom.current,
          p.current.cubeSize,
          p.current.width,
          p.current.height,
        );
        if (move) {
          p.current.onTwist(move.face, move.clockwise, [move.layer]);
        }
      }

      hitRef.current = null;
    });

  const pinchGesture = Gesture.Pinch()
    .runOnJS(true)
    .onBegin(() => {
      pinchStartZoom.current = zoom.current;
    })
    .onUpdate((e) => {
      zoom.current = clamp(pinchStartZoom.current * e.scale, MIN_ZOOM, MAX_ZOOM);
      scheduleRender();
    });

  const gesture = Gesture.Simultaneous(panGesture, pinchGesture);

  const commitViewMatrix = useCallback((nextViewMatrix: Mat3) => {
    viewMatrix.current = cloneMat3(nextViewMatrix);
    scheduleRender();
  }, [scheduleRender]);

  const rotateView = useCallback((axisIndex: 0 | 1 | 2, dir: -1 | 1) => {
    const angle = dir * (Math.PI / 2);
    const delta = axisIndex === 0
      ? rotX(angle)
      : axisIndex === 1
        ? rotY(angle)
        : rotZ(angle);
    commitViewMatrix(mulMat(delta, viewMatrix.current));
  }, [commitViewMatrix]);

  return {
    viewMatrix: viewMatrix.current,
    zoom: zoom.current,
    gesture,
    rotateView,
    setViewMatrix: commitViewMatrix,
  };
}
