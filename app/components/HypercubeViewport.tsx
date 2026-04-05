import React, { forwardRef, useImperativeHandle, useState } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { useHypercubeGesture } from '../hooks/useHypercubeGesture';
import type { Mat3 } from '../utils/math3d';
import type { MagicCube4DAnimation, MagicCube4DPickInfo, Mat4 } from '../utils/magiccube4d';
import type { MagicCube4DSettings } from '../utils/magiccube4dSettings';
import MagicCube4DCanvas from './MagicCube4DCanvas';

interface Props {
  state: number[];
  rotation4d: Mat4;
  twistAnimation: MagicCube4DAnimation | null;
  settings: MagicCube4DSettings;
  dragSensitivity: number;
  viewPitchDeg: number;
  viewYawDeg: number;
  initialViewMatrix?: Mat3;
  onViewMatrixChange?: (viewMatrix: Mat3) => void;
  onTap: (point: [number, number]) => void;
  onLongTap: (point: [number, number]) => void;
  onDoubleTap: (point: [number, number]) => void;
  onPickReady?: (picker: (x: number, y: number) => MagicCube4DPickInfo | null) => void;
  disabled: boolean;
  showResetButton: boolean;
  resetViewMatrix: Mat3;
}

export interface HypercubeViewportHandle {
  setViewMatrix: (viewMatrix: Mat3) => void;
}

const HypercubeViewport = forwardRef<HypercubeViewportHandle, Props>(function HypercubeViewport({
  state,
  rotation4d,
  twistAnimation,
  settings,
  dragSensitivity,
  viewPitchDeg,
  viewYawDeg,
  initialViewMatrix,
  onViewMatrixChange,
  onTap,
  onLongTap,
  onDoubleTap,
  onPickReady,
  disabled,
  showResetButton,
  resetViewMatrix,
}: Props, ref) {
  const { width } = useWindowDimensions();
  const [canvasSize, setCanvasSize] = useState({ width, height: 0 });
  const canvasKey = `${canvasSize.width}x${canvasSize.height}`;
  const gestureState = useHypercubeGesture({
    onTap,
    onLongTap,
    onDoubleTap,
    dragSensitivity,
    viewPitchDeg,
    viewYawDeg,
    initialViewMatrix,
    onViewMatrixChange,
    disabled,
  });

  useImperativeHandle(ref, () => ({
    setViewMatrix: gestureState.setViewMatrix,
  }), [gestureState.setViewMatrix]);

  return (
    <GestureDetector gesture={gestureState.gesture}>
      <View
        style={{ flex: 1 }}
        onLayout={(event) => {
          const { width: nextWidth, height: nextHeight } = event.nativeEvent.layout;
          setCanvasSize((current) => (
            current.width === nextWidth && current.height === nextHeight
              ? current
              : { width: nextWidth, height: nextHeight }
          ));
        }}
      >
        <MagicCube4DCanvas
          key={canvasKey}
          state={state}
          viewMatrix={gestureState.viewMatrix}
          zoom={gestureState.zoom}
          width={canvasSize.width}
          height={canvasSize.height}
          rotation4d={rotation4d}
          twistAnimation={twistAnimation}
          settings={settings}
          onPickReady={onPickReady}
        />
        {showResetButton && (
          <Pressable
            style={({ pressed }) => [
              styles.floatingViewResetButton,
              pressed && styles.actionButtonPressed,
            ]}
            onPress={() => {
              gestureState.setViewMatrix(resetViewMatrix);
            }}
            disabled={disabled}
          >
            <Ionicons name="compass-outline" size={16} color="#f5f7ff" />
          </Pressable>
        )}
      </View>
    </GestureDetector>
  );
});

const styles = StyleSheet.create({
  floatingViewResetButton: {
    position: 'absolute',
    bottom: 12,
    left: 12,
    width: 36,
    height: 36,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(26,26,46,0.72)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  actionButtonPressed: {
    transform: [{ scale: 0.96 }],
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
});

export default React.memo(HypercubeViewport);
