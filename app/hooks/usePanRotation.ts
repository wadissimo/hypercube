import { useRef, useReducer } from 'react';
import { Gesture } from 'react-native-gesture-handler';
import type { Mat3 } from '../utils/math3d';
import { mulMat, rotX, rotY } from '../utils/math3d';
import { createDefaultCubeViewMatrix } from './useCubeGesture';

const SENSITIVITY = 0.006;
const INITIAL_ZOOM = 1;
const MIN_ZOOM = 0.65;
const MAX_ZOOM = 1.9;

export function usePanRotation() {
  const viewMatrix = useRef<Mat3>(createDefaultCubeViewMatrix());
  const prevTranslation = useRef<[number, number]>([0, 0]);
  const zoom = useRef(INITIAL_ZOOM);
  const pinchStartZoom = useRef(INITIAL_ZOOM);
  const [, forceRender] = useReducer(x => x + 1, 0);

  const panGesture = Gesture.Pan()
    .runOnJS(true)
    .onBegin(() => {
      prevTranslation.current = [0, 0];
    })
    .onUpdate((e) => {
      const dx = e.translationX - prevTranslation.current[0];
      const dy = e.translationY - prevTranslation.current[1];
      prevTranslation.current = [e.translationX, e.translationY];
      const delta = mulMat(rotX(-dy * SENSITIVITY), rotY(-dx * SENSITIVITY));
      viewMatrix.current = mulMat(delta, viewMatrix.current);
      forceRender();
    });

  const pinchGesture = Gesture.Pinch()
    .runOnJS(true)
    .onBegin(() => {
      pinchStartZoom.current = zoom.current;
    })
    .onUpdate((e) => {
      zoom.current = clamp(pinchStartZoom.current * e.scale, MIN_ZOOM, MAX_ZOOM);
      forceRender();
    });

  const gesture = Gesture.Simultaneous(panGesture, pinchGesture);

  return {
    viewMatrix: viewMatrix.current,
    zoom: zoom.current,
    gesture,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
