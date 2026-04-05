import { useCallback, useEffect, useReducer, useRef } from 'react';
import { Gesture } from 'react-native-gesture-handler';
import type { Mat3 } from '../utils/math3d';
import { cloneMat3, mulMat, rotX, rotY, rotZ } from '../utils/math3d';

const BASE_SENSITIVITY = 0.006;
const INITIAL_ZOOM = 0.62;
const MIN_ZOOM = 0.35;
const MAX_ZOOM = 1.9;
const DEFAULT_VIEW_ROLL_DEG = 60;

interface Params {
  onTap: (point: [number, number]) => void;
  onLongTap: (point: [number, number]) => void;
  onDoubleTap: (point: [number, number]) => void;
  dragSensitivity?: number;
  viewPitchDeg?: number;
  viewYawDeg?: number;
  initialViewMatrix?: Mat3;
  onViewMatrixChange?: (viewMatrix: Mat3) => void;
  disabled?: boolean;
}

export function useHypercubeGesture({
  onTap,
  onLongTap,
  onDoubleTap,
  dragSensitivity = 1,
  viewPitchDeg = 51,
  viewYawDeg = 2,
  initialViewMatrix,
  onViewMatrixChange,
  disabled = false,
}: Params) {
  const viewMatrix = useRef<Mat3>(cloneMat3(initialViewMatrix ?? createHypercubeViewMatrix(viewPitchDeg, viewYawDeg)));
  const prevTranslation = useRef<[number, number]>([0, 0]);
  const zoom = useRef(INITIAL_ZOOM);
  const pinchStartZoom = useRef(INITIAL_ZOOM);
  const [, forceRender] = useReducer((value: number) => value + 1, 0);
  const renderFrameRef = useRef<number | null>(null);

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
      onViewMatrixChange?.(viewMatrix.current);
      forceRender();
    });
  }, [onViewMatrixChange]);

  useEffect(() => {
    viewMatrix.current = cloneMat3(initialViewMatrix ?? createHypercubeViewMatrix(viewPitchDeg, viewYawDeg));
    scheduleRender();
  }, [initialViewMatrix, scheduleRender, viewPitchDeg, viewYawDeg]);

  const commitViewMatrix = useCallback((nextViewMatrix: Mat3) => {
    viewMatrix.current = cloneMat3(nextViewMatrix);
    scheduleRender();
  }, [scheduleRender]);

  const panGesture = Gesture.Pan()
    .runOnJS(true)
    .onBegin(() => {
      prevTranslation.current = [0, 0];
    })
    .onUpdate((event) => {
      const dx = event.translationX - prevTranslation.current[0];
      const dy = event.translationY - prevTranslation.current[1];
      prevTranslation.current = [event.translationX, event.translationY];
      const sensitivity = BASE_SENSITIVITY * dragSensitivity;
      const delta = mulMat(rotX(-dy * sensitivity), rotY(-dx * sensitivity));
      commitViewMatrix(mulMat(delta, viewMatrix.current));
    });

  const pinchGesture = Gesture.Pinch()
    .runOnJS(true)
    .onBegin(() => {
      pinchStartZoom.current = zoom.current;
    })
    .onUpdate((event) => {
      zoom.current = clamp(pinchStartZoom.current * event.scale, MIN_ZOOM, MAX_ZOOM);
      scheduleRender();
    });

  const doubleTapGesture = Gesture.Tap()
    .runOnJS(true)
    .enabled(!disabled)
    .numberOfTaps(2)
    .maxDuration(250)
    .onEnd((event, success) => {
      if (success) {
        onDoubleTap([event.x, event.y]);
      }
    });

  const tapGesture = Gesture.Tap()
    .runOnJS(true)
    .enabled(!disabled)
    .numberOfTaps(1)
    .maxDuration(250)
    .onEnd((event, success) => {
      if (success) {
        onTap([event.x, event.y]);
      }
    });

  const longTapGesture = Gesture.LongPress()
    .runOnJS(true)
    .enabled(!disabled)
    .minDuration(350)
    .onEnd((event, success) => {
      if (success) {
        onLongTap([event.x, event.y]);
      }
    });

  const pressGestures = Gesture.Exclusive(doubleTapGesture, longTapGesture, tapGesture);
  const gesture = Gesture.Simultaneous(panGesture, pinchGesture, pressGestures);

  const rotateView = (axisIndex: 0 | 1 | 2, dir: -1 | 1) => {
    const angle = dir * (Math.PI / 2);
    const delta = axisIndex === 0
      ? rotX(angle)
      : axisIndex === 1
        ? rotY(angle)
        : rotZ(angle);
    commitViewMatrix(mulMat(delta, viewMatrix.current));
  };

  return {
    viewMatrix: viewMatrix.current,
    zoom: zoom.current,
    gesture,
    rotateView,
    setViewMatrix: commitViewMatrix,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function createHypercubeViewMatrix(viewPitchDeg: number, viewYawDeg: number): Mat3 {
  return mulMat(
    rotZ(toRadians(DEFAULT_VIEW_ROLL_DEG)),
    mulMat(rotX(toRadians(viewPitchDeg)), rotY(toRadians(viewYawDeg))),
  );
}

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}
