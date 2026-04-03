import { useReducer, useRef } from 'react';
import { Gesture } from 'react-native-gesture-handler';
import type { Mat3 } from '../utils/math3d';
import { mulMat, rotX, rotY } from '../utils/math3d';

const SENSITIVITY = 0.006;
const INITIAL_RX = Math.PI / 5.5;
const INITIAL_RY = -Math.PI / 5;
const INITIAL_ZOOM = 0.62;
const MIN_ZOOM = 0.35;
const MAX_ZOOM = 1.9;

interface Params {
  onTap: (point: [number, number]) => void;
  onLongTap: (point: [number, number]) => void;
  onDoubleTap: (point: [number, number]) => void;
  disabled?: boolean;
}

export function useHypercubeGesture({ onTap, onLongTap, onDoubleTap, disabled = false }: Params) {
  const viewMatrix = useRef<Mat3>(mulMat(rotX(INITIAL_RX), rotY(INITIAL_RY)));
  const prevTranslation = useRef<[number, number]>([0, 0]);
  const zoom = useRef(INITIAL_ZOOM);
  const pinchStartZoom = useRef(INITIAL_ZOOM);
  const [, forceRender] = useReducer((value: number) => value + 1, 0);

  const panGesture = Gesture.Pan()
    .runOnJS(true)
    .onBegin(() => {
      prevTranslation.current = [0, 0];
    })
    .onUpdate((event) => {
      const dx = event.translationX - prevTranslation.current[0];
      const dy = event.translationY - prevTranslation.current[1];
      prevTranslation.current = [event.translationX, event.translationY];
      const delta = mulMat(rotX(-dy * SENSITIVITY), rotY(-dx * SENSITIVITY));
      viewMatrix.current = mulMat(delta, viewMatrix.current);
      forceRender();
    });

  const pinchGesture = Gesture.Pinch()
    .runOnJS(true)
    .onBegin(() => {
      pinchStartZoom.current = zoom.current;
    })
    .onUpdate((event) => {
      zoom.current = clamp(pinchStartZoom.current * event.scale, MIN_ZOOM, MAX_ZOOM);
      forceRender();
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

  return {
    viewMatrix: viewMatrix.current,
    zoom: zoom.current,
    gesture,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
