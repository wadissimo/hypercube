import React, { useCallback, useRef, useState } from 'react';
import { View, StyleSheet, useWindowDimensions, Pressable, Text } from 'react-native';
import { GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import CubeCanvas from './components/CubeCanvas';
import MagicCube4DCanvas from './components/MagicCube4DCanvas';
import type { Axis, CubeSize, CubeState, Face } from './utils/cubeModel';
import {
  ALL_FACES,
  SUPPORTED_CUBE_SIZES,
  createSolvedCube,
  twistFace,
  faceAxis,
  faceLayers,
} from './utils/cubeModel';
import { useCubeGesture } from './hooks/useCubeGesture';
import { useHypercubeGesture } from './hooks/useHypercubeGesture';
import { useMagicCube4D } from './hooks/useMagicCube4D';
import { useTwistAnimation } from './hooks/useTwistAnimation';
import {
  getFaceCenterStickerIndex,
  getStickerFaceIndex,
  MAGICCUBE4D_FACE_COLORS,
  MAGICCUBE4D_FACE_LABELS,
  MAGICCUBE4D_SLICE_BITS,
  MAGICCUBE4D_SLICE_LABELS,
} from './utils/magiccube4d';

const SCRAMBLE_MOVES = 20;
type ScreenMode = 'cube' | 'hypercube';

export default function Index() {
  const { width } = useWindowDimensions();
  const [mode, setMode] = useState<ScreenMode>('cube');
  const [cubeSize, setCubeSize] = useState<CubeSize>(3);
  const [cubeState, setCubeState] = useState(() => createSolvedCube(3));
  const [cubeCanUndo, setCubeCanUndo] = useState(false);
  const [scrambleText, setScrambleText] = useState('');
  const [canvasHeight, setCanvasHeight] = useState(0);
  const [selected4DFace, setSelected4DFace] = useState(4);
  const cubeHistoryRef = useRef<CubeState[]>([]);
  const { twistAnim, twist } = useTwistAnimation(setCubeState, previousState => {
    cubeHistoryRef.current.push(previousState);
    setCubeCanUndo(true);
  });
  const {
    state: magicCube4DState,
    sliceMask,
    setSliceMask,
    rotation4d,
    twistAnimation: magicCube4DTwistAnimation,
    canUndo: magicCube4DCanUndo,
    isAnimating: magicCube4DAnimating,
    reset: resetMagicCube4D,
    scramble: scrambleMagicCube4D,
    undo: undoMagicCube4D,
    twistSticker,
    rotateFaceToCenter,
  } = useMagicCube4D();
  const magicCube4DPickRef = useRef<(x: number, y: number) => number | null>(() => null);
  const cubeDisabled = !!twistAnim || mode !== 'cube';
  const cubeGesture = useCubeGesture({
    cubeState, cubeSize, width, height: canvasHeight,
    onTwist: twist, disabled: cubeDisabled,
  });
  const handleHypercubeDoubleTap = useCallback((point: [number, number]) => {
    const stickerIndex = magicCube4DPickRef.current(point[0], point[1]);
    if (stickerIndex != null) {
      setSelected4DFace(getStickerFaceIndex(stickerIndex));
    }
    rotateFaceToCenter(stickerIndex);
  }, [rotateFaceToCenter]);
  const handleHypercubeTap = useCallback((point: [number, number]) => {
    const stickerIndex = magicCube4DPickRef.current(point[0], point[1]);
    if (stickerIndex != null) {
      setSelected4DFace(getStickerFaceIndex(stickerIndex));
    }
    twistSticker(stickerIndex, 1);
  }, [twistSticker]);
  const handleHypercubeLongTap = useCallback((point: [number, number]) => {
    const stickerIndex = magicCube4DPickRef.current(point[0], point[1]);
    if (stickerIndex != null) {
      setSelected4DFace(getStickerFaceIndex(stickerIndex));
    }
    twistSticker(stickerIndex, -1);
  }, [twistSticker]);
  const previewGesture = useHypercubeGesture({
    onTap: handleHypercubeTap,
    onLongTap: handleHypercubeLongTap,
    onDoubleTap: handleHypercubeDoubleTap,
    disabled: magicCube4DAnimating,
  });

  const activeGesture = mode === 'cube' ? cubeGesture : previewGesture;
  const actionDisabled = mode === 'cube' ? !!twistAnim : magicCube4DAnimating;

  const handleSizeChange = (size: CubeSize) => {
    if (!!twistAnim) return;
    setMode('cube');
    if (size === cubeSize) return;
    setCubeSize(size);
    setCubeState(createSolvedCube(size));
    cubeHistoryRef.current = [];
    setCubeCanUndo(false);
    setScrambleText('');
  };

  const handleHypercubeMode = () => {
    if (!!twistAnim) return;
    setMode('hypercube');
  };

  const handleReset = () => {
    if (actionDisabled) return;
    if (mode === 'cube') {
      setCubeState(createSolvedCube(cubeSize));
      cubeHistoryRef.current = [];
      setCubeCanUndo(false);
      setScrambleText('');
      return;
    }

    resetMagicCube4D();
  };

  const handleScramble = () => {
    if (actionDisabled) return;
    if (mode === 'hypercube') {
      scrambleMagicCube4D();
      return;
    }

    const scramble = createScramble(SCRAMBLE_MOVES, cubeSize);
    cubeHistoryRef.current = [];
    setCubeCanUndo(false);
    setCubeState(applyMoves(createSolvedCube(cubeSize), scramble.moves));
    setScrambleText(scramble.notation);
  };

  const handleUndo = () => {
    if (mode === 'cube') {
      if (!!twistAnim) {
        return;
      }
      const previous = cubeHistoryRef.current.pop();
      if (!previous) {
        return;
      }
      setCubeState(previous);
      setCubeCanUndo(cubeHistoryRef.current.length > 0);
      return;
    }

    undoMagicCube4D();
  };

  const handle4DControlTwist = (dir: 1 | -1) => {
    twistSticker(getFaceCenterStickerIndex(selected4DFace), dir);
  };

  const handle4DControlCenter = () => {
    rotateFaceToCenter(getFaceCenterStickerIndex(selected4DFace));
  };

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
        <View style={styles.modeBar}>
          {SUPPORTED_CUBE_SIZES.map((size, i) => (
            <Pressable
              key={size}
              style={[
                styles.modeButton,
                mode === 'cube' && size === cubeSize && styles.modeButtonActive,
                i === 0 && styles.modeButtonFirst,
              ]}
              onPress={() => handleSizeChange(size)}
              disabled={!!twistAnim}
            >
              <Text
                style={[
                  styles.modeButtonText,
                  mode === 'cube' && size === cubeSize && styles.modeButtonTextActive,
                ]}
              >
                {size}x{size}
              </Text>
            </Pressable>
          ))}
          <Pressable
            style={[
              styles.modeButton,
              styles.modeButtonLast,
              mode === 'hypercube' && styles.modeButtonActive,
            ]}
            onPress={handleHypercubeMode}
            disabled={!!twistAnim}
          >
            <Text
              style={[
                styles.modeButtonText,
                mode === 'hypercube' && styles.modeButtonTextActive,
              ]}
            >
              4D
            </Text>
          </Pressable>
        </View>
        <View style={styles.topBar}>
          <View style={styles.actionGroup}>
            <ActionButton
              icon="arrow-undo"
              label="Undo"
              onPress={handleUndo}
              disabled={mode === 'cube' ? !cubeCanUndo || !!twistAnim : !magicCube4DCanUndo || magicCube4DAnimating}
            />
            <ActionButton
              icon="refresh"
              label="Reset"
              onPress={handleReset}
              disabled={actionDisabled}
            />
          </View>
          <Text
            style={styles.scrambleText}
            numberOfLines={2}
            adjustsFontSizeToFit
            minimumFontScale={0.7}
          >
            {mode === 'cube'
              ? scrambleText
              : `Magic Cube 4D  •  tap CCW  •  hold CW  •  slices ${MAGICCUBE4D_SLICE_LABELS[sliceMask]}`}
          </Text>
          <ActionButton
            icon="shuffle"
            label="Scramble"
            onPress={handleScramble}
            disabled={actionDisabled}
          />
        </View>
        {mode === 'hypercube' && (
          <>
            <View style={styles.sliceBar}>
              {MAGICCUBE4D_SLICE_BITS.map(bit => {
                const active = (sliceMask & bit) !== 0;
                return (
                  <Pressable
                    key={bit}
                    style={[
                      styles.sliceButton,
                      active && styles.sliceButtonActive,
                    ]}
                    onPress={() => setSliceMask(mask => {
                      const nextMask = (mask ^ bit) & 0b111;
                      return nextMask === 0 ? bit : nextMask;
                    })}
                    disabled={magicCube4DAnimating}
                  >
                    <Text style={[
                      styles.sliceButtonText,
                      active && styles.sliceButtonTextActive,
                    ]}
                    >
                      Slice {MAGICCUBE4D_SLICE_LABELS[bit]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <View style={styles.bottomControls}>
              <View style={styles.facePickerRow}>
                {MAGICCUBE4D_FACE_LABELS.map((label, faceIndex) => (
                  <Pressable
                    key={label}
                    style={[
                      styles.faceChip,
                      { backgroundColor: MAGICCUBE4D_FACE_COLORS[faceIndex] },
                      selected4DFace === faceIndex && styles.faceChipActive,
                    ]}
                    onPress={() => setSelected4DFace(faceIndex)}
                    disabled={magicCube4DAnimating}
                  >
                    <Text style={styles.faceChipText}>{label}</Text>
                  </Pressable>
                ))}
              </View>
              <View style={styles.bottomActionRow}>
                <BottomControlButton
                  label="Center"
                  onPress={handle4DControlCenter}
                  disabled={magicCube4DAnimating}
                />
                <BottomControlButton
                  label="CCW"
                  onPress={() => handle4DControlTwist(1)}
                  disabled={magicCube4DAnimating}
                />
                <BottomControlButton
                  label="CW"
                  onPress={() => handle4DControlTwist(-1)}
                  disabled={magicCube4DAnimating}
                />
              </View>
            </View>
          </>
        )}
        <GestureDetector gesture={activeGesture.gesture}>
          <View
            style={styles.canvas}
            onLayout={e => setCanvasHeight(e.nativeEvent.layout.height)}
          >
            {mode === 'cube' ? (
              <CubeCanvas
                cubeState={cubeState}
                cubeSize={cubeSize}
                viewMatrix={activeGesture.viewMatrix}
                zoom={activeGesture.zoom}
                twistAnim={twistAnim}
                width={width}
                height={canvasHeight}
              />
            ) : (
              <MagicCube4DCanvas
                state={magicCube4DState}
                viewMatrix={activeGesture.viewMatrix}
                zoom={activeGesture.zoom}
                width={width}
                height={canvasHeight}
                rotation4d={rotation4d}
                twistAnimation={magicCube4DTwistAnimation}
                onPickReady={(picker) => {
                  magicCube4DPickRef.current = picker;
                }}
              />
            )}
          </View>
        </GestureDetector>
      </SafeAreaView>
    </GestureHandlerRootView>
  );
}

interface ActionButtonProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  disabled: boolean;
}

function ActionButton({ icon, label, onPress, disabled }: ActionButtonProps) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.actionButton,
        disabled && styles.actionButtonDisabled,
        pressed && !disabled && styles.actionButtonPressed,
      ]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Ionicons name={icon} size={18} color="#f5f7ff" />
    </Pressable>
  );
}

interface BottomControlButtonProps {
  label: string;
  onPress: () => void;
  disabled: boolean;
}

function BottomControlButton({ label, onPress, disabled }: BottomControlButtonProps) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.bottomControlButton,
        disabled && styles.actionButtonDisabled,
        pressed && !disabled && styles.actionButtonPressed,
      ]}
      onPress={onPress}
      disabled={disabled}
    >
      <Text style={styles.bottomControlButtonText}>{label}</Text>
    </Pressable>
  );
}

function applyMoves(state: CubeState, moves: Move[]): CubeState {
  let next = state;
  for (const { face, clockwise, layers } of moves) {
    next = twistFace(next, face, clockwise, layers);
  }
  return next;
}

interface Move {
  face: Face;
  clockwise: boolean;
  layers: number[];
}

function createScramble(length: number, size: CubeSize): { moves: Move[]; notation: string } {
  const moves: Move[] = [];
  let previousFace: Face | null = null;
  let previousAxis: Axis | null = null;

  while (moves.length < length) {
    const face = ALL_FACES[Math.floor(Math.random() * ALL_FACES.length)];
    const axis = faceAxis(face);
    if (face === previousFace || axis === previousAxis) {
      continue;
    }

    const clockwise = Math.random() >= 0.5;
    const wide = size >= 4 && Math.random() < 0.3;
    const layers = faceLayers(face, size, wide);
    moves.push({ face, clockwise, layers });
    previousFace = face;
    previousAxis = axis;
  }

  return {
    moves,
    notation: moves.map(m => formatMove(m, size)).join(' '),
  };
}

function formatMove({ face, clockwise, layers }: Move, size: CubeSize): string {
  const isWide = size >= 4 && layers.length > 1;
  const name = isWide ? `${face}w` : face;
  return clockwise ? name : `${name}'`;
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#1a1a2e',
  },
  safeArea: {
    flex: 1,
  },
  modeBar: {
    flexDirection: 'row',
    justifyContent: 'center',
    paddingHorizontal: 14,
    paddingTop: 10,
    gap: 0,
  },
  modeButton: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    backgroundColor: 'transparent',
  },
  modeButtonActive: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderColor: 'rgba(255,255,255,0.4)',
  },
  modeButtonFirst: {
    borderTopLeftRadius: 8,
    borderBottomLeftRadius: 8,
  },
  modeButtonLast: {
    borderTopRightRadius: 8,
    borderBottomRightRadius: 8,
  },
  modeButtonText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 14,
    fontWeight: '600',
  },
  modeButtonTextActive: {
    color: '#f5f7ff',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 10,
    gap: 12,
  },
  actionGroup: {
    flexDirection: 'row',
    gap: 10,
  },
  sliceBar: {
    flexDirection: 'row',
    justifyContent: 'center',
    paddingHorizontal: 14,
    paddingBottom: 8,
    gap: 8,
  },
  sliceButton: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 7,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  sliceButtonActive: {
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderColor: 'rgba(255,255,255,0.3)',
  },
  sliceButtonText: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 12,
    fontWeight: '600',
  },
  sliceButtonTextActive: {
    color: '#f5f7ff',
  },
  bottomControls: {
    paddingHorizontal: 14,
    paddingBottom: 14,
    gap: 10,
  },
  facePickerRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
  },
  faceChip: {
    minWidth: 48,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: 'transparent',
    alignItems: 'center',
  },
  faceChipActive: {
    borderColor: '#f5f7ff',
  },
  faceChipText: {
    color: '#111111',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  bottomActionRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
  },
  bottomControlButton: {
    minWidth: 88,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
  },
  bottomControlButtonText: {
    color: '#f5f7ff',
    fontSize: 14,
    fontWeight: '700',
  },
  actionButton: {
    width: 40,
    height: 40,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  actionButtonDisabled: {
    opacity: 0.45,
  },
  actionButtonPressed: {
    transform: [{ scale: 0.96 }],
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  scrambleText: {
    flex: 1,
    color: '#f5f7ff',
    fontSize: 11,
    lineHeight: 14,
    textAlign: 'center',
    opacity: 0.9,
    paddingHorizontal: 4,
  },
  canvas: {
    flex: 1,
  },
});
