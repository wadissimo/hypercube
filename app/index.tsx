import React, { useCallback, useMemo, useRef, useState } from 'react';
import { View, StyleSheet, useWindowDimensions, Pressable, Text } from 'react-native';
import { GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { SafeAreaView } from 'react-native-safe-area-context';
import CubeCanvas from './components/CubeCanvas';
import MagicCube4DCanvas from './components/MagicCube4DCanvas';
import MagicCube4DSettingsSheet from './components/MagicCube4DSettingsSheet';
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
import { createHypercubeViewMatrix, useHypercubeGesture } from './hooks/useHypercubeGesture';
import { useMagicCube4D } from './hooks/useMagicCube4D';
import { useTwistAnimation } from './hooks/useTwistAnimation';
import {
  getFaceCenterStickerIndex,
  getFaceTwistAxisOptions,
  type MagicCube4DFaceAxisOption,
  type MagicCube4DPickInfo,
  MAGICCUBE4D_FACE_COLORS,
  MAGICCUBE4D_FACE_LABELS,
  MAGICCUBE4D_SLICE_BITS,
  MAGICCUBE4D_SLICE_LABELS,
} from './utils/magiccube4d';
import {
  clampMagicCube4DSettings,
  DEFAULT_MAGICCUBE4D_SETTINGS,
} from './utils/magiccube4dSettings';
import { cloneMat3, type Mat3 } from './utils/math3d';

const SCRAMBLE_MOVES = 20;
const AXIS_TARGET_LABELS = [
  ['x-', 'x+'],
  ['y-', 'y+'],
  ['z-', 'z+'],
  ['w-', 'w+'],
] as const;
const FACE_SELECTION_ROWS = [
  [0, 1],
  [2, 3],
  [4, 5],
  [6, 7],
] as const;
const GLOBAL_4D_AXIS_OPTIONS = [
  { axisIndex: 0 },
  { axisIndex: 1 },
  { axisIndex: 2 },
] as const;
type ScreenMode = 'cube' | 'hypercube';
type HypercubeAction = { type: 'state' } | { type: 'view'; previousViewMatrix: Mat3 };
type HypercubeRotationMode = '4d' | '3d' | null;
const DEFAULT_HYPERCUBE_ROTATION_MODE: Exclude<HypercubeRotationMode, null> = '3d';

export default function Index() {
  const { width } = useWindowDimensions();
  const [mode, setMode] = useState<ScreenMode>('cube');
  const [cubeSize, setCubeSize] = useState<CubeSize>(3);
  const [cubeState, setCubeState] = useState(() => createSolvedCube(3));
  const [cubeCanUndo, setCubeCanUndo] = useState(false);
  const [scrambleText, setScrambleText] = useState('');
  const [cubeCanvasSize, setCubeCanvasSize] = useState({ width, height: 0 });
  const [hypercubeCanvasSize, setHypercubeCanvasSize] = useState({ width, height: 0 });
  const [selected4DFace, setSelected4DFace] = useState<number | null>(null);
  const [hypercubeRotationMode, setHypercubeRotationMode] = useState<HypercubeRotationMode>(DEFAULT_HYPERCUBE_ROTATION_MODE);
  const [magicCube4DSettingsOpen, setMagicCube4DSettingsOpen] = useState(false);
  const [magicCube4DSettings, setMagicCube4DSettings] = useState(DEFAULT_MAGICCUBE4D_SETTINGS);
  const [saved4DViewMatrix, setSaved4DViewMatrix] = useState<Mat3 | null>(null);
  const [show4DViewReset, setShow4DViewReset] = useState(false);
  const cubeHistoryRef = useRef<CubeState[]>([]);
  const current4DViewMatrixRef = useRef<Mat3 | null>(null);
  const hypercubeHistoryRef = useRef<HypercubeAction[]>([]);
  const lastTurnSliceMaskRef = useRef(MAGICCUBE4D_SLICE_BITS[0]);
  const [hypercubeCanUndo, setHypercubeCanUndo] = useState(false);
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
    isAnimating: magicCube4DAnimating,
    reset: resetMagicCube4D,
    scramble: scrambleMagicCube4D,
    undo: undoMagicCube4D,
    twistGrip,
    rotateFaceToCenter,
    rotateState,
    rotateSpatialState,
  } = useMagicCube4D({
    twistDurationMs: magicCube4DSettings.twistDurationMs,
    animationDurationMs: magicCube4DSettings.animationDurationMs,
    onStateCommit: () => {
      hypercubeHistoryRef.current.push({ type: 'state' });
      setHypercubeCanUndo(true);
    },
  });
  const magicCube4DPickRef = useRef<(x: number, y: number) => MagicCube4DPickInfo | null>(() => null);
  const base4DViewMatrix = useMemo(
    () => saved4DViewMatrix ?? createHypercubeViewMatrix(
      magicCube4DSettings.viewPitchDeg,
      magicCube4DSettings.viewYawDeg,
    ),
    [magicCube4DSettings.viewPitchDeg, magicCube4DSettings.viewYawDeg, saved4DViewMatrix],
  );
  const selected4DAxisOptions = useMemo(
    () => {
      if (selected4DFace == null) {
        return GLOBAL_4D_AXIS_OPTIONS;
      }

      return [...getFaceTwistAxisOptions(selected4DFace)].sort(
        (left, right) => left.axisIndex - right.axisIndex,
      );
    },
    [selected4DFace],
  );
  const current4DFaceColors = useMemo(
    () => MAGICCUBE4D_FACE_COLORS.map((_, faceIndex) => {
      const centerStickerIndex = getFaceCenterStickerIndex(faceIndex);
      const colorIndex = magicCube4DState[centerStickerIndex] % MAGICCUBE4D_FACE_COLORS.length;
      return MAGICCUBE4D_FACE_COLORS[colorIndex];
    }),
    [magicCube4DState],
  );
  const selected4DFaceColor = selected4DFace == null ? null : current4DFaceColors[selected4DFace];
  const cubeDisabled = !!twistAnim || mode !== 'cube';
  const cubeGesture = useCubeGesture({
    cubeState, cubeSize, width: cubeCanvasSize.width, height: cubeCanvasSize.height,
    onTwist: twist, disabled: cubeDisabled,
  });
  const activateDefaultRotationMode = useCallback(() => {
    setHypercubeRotationMode(DEFAULT_HYPERCUBE_ROTATION_MODE);
    setSelected4DFace(null);
    setSliceMask(mask => {
      if (mask !== 0) {
        lastTurnSliceMaskRef.current = mask;
      }
      return 0;
    });
  }, [setSliceMask]);
  const select4DFace = useCallback((faceIndex: number) => {
    if (hypercubeRotationMode !== null) {
      setHypercubeRotationMode(null);
      setSliceMask(mask => {
        const restoredMask = mask === 0 ? lastTurnSliceMaskRef.current : mask;
        lastTurnSliceMaskRef.current = restoredMask;
        return restoredMask;
      });
    }
    setSelected4DFace(faceIndex);
  }, [hypercubeRotationMode, setSliceMask]);
  const toggle4DFace = useCallback((faceIndex: number) => {
    if (selected4DFace === faceIndex) {
      activateDefaultRotationMode();
      return;
    }
    if (hypercubeRotationMode !== null) {
      setHypercubeRotationMode(null);
      setSliceMask(mask => {
        const restoredMask = mask === 0 ? lastTurnSliceMaskRef.current : mask;
        lastTurnSliceMaskRef.current = restoredMask;
        return restoredMask;
      });
    }
    setSelected4DFace(faceIndex);
  }, [activateDefaultRotationMode, hypercubeRotationMode, selected4DFace, setSliceMask]);

  const handleHypercubeDoubleTap = useCallback((point: [number, number]) => {
    const pickInfo = magicCube4DPickRef.current(point[0], point[1]);
    if (pickInfo) {
      select4DFace(pickInfo.faceIndex);
    }
    rotateFaceToCenter(pickInfo?.stickerIndex ?? null);
  }, [rotateFaceToCenter, select4DFace]);
  const handleHypercubeTap = useCallback((point: [number, number]) => {
    const pickInfo = magicCube4DPickRef.current(point[0], point[1]);
    if (pickInfo) {
      select4DFace(pickInfo.faceIndex);
    }
    twistGrip(pickInfo?.gripIndex ?? null, 1);
  }, [select4DFace, twistGrip]);
  const handleHypercubeLongTap = useCallback((point: [number, number]) => {
    const pickInfo = magicCube4DPickRef.current(point[0], point[1]);
    if (pickInfo) {
      select4DFace(pickInfo.faceIndex);
    }
    twistGrip(pickInfo?.gripIndex ?? null, -1);
  }, [select4DFace, twistGrip]);
  const handle4DViewMatrixChange = useCallback((nextViewMatrix: Mat3) => {
    current4DViewMatrixRef.current = cloneMat3(nextViewMatrix);
    setShow4DViewReset(!mat3EqualsWithinTolerance(nextViewMatrix, base4DViewMatrix));
  }, [base4DViewMatrix]);
  const previewGesture = useHypercubeGesture({
    onTap: handleHypercubeTap,
    onLongTap: handleHypercubeLongTap,
    onDoubleTap: handleHypercubeDoubleTap,
    dragSensitivity: magicCube4DSettings.dragSensitivity,
    viewPitchDeg: magicCube4DSettings.viewPitchDeg,
    viewYawDeg: magicCube4DSettings.viewYawDeg,
    initialViewMatrix: saved4DViewMatrix ?? undefined,
    onViewMatrixChange: handle4DViewMatrixChange,
    disabled: magicCube4DAnimating,
  });

  const activeGesture = mode === 'cube' ? cubeGesture : previewGesture;
  const actionDisabled = mode === 'cube' ? !!twistAnim : magicCube4DAnimating;
  const activeCanvasSize = mode === 'cube' ? cubeCanvasSize : hypercubeCanvasSize;

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
    setHypercubeCanvasSize(current => ({ width: current.width || width, height: 0 }));
    setMode('hypercube');
  };

  const handleOpen4DSettings = () => {
    if (mode !== 'hypercube') {
      return;
    }
    setMagicCube4DSettingsOpen(true);
  };
  const handleUseCurrent4DView = useCallback(() => {
    const currentViewMatrix = current4DViewMatrixRef.current;
    if (!currentViewMatrix) {
      return;
    }
    setSaved4DViewMatrix(cloneMat3(currentViewMatrix));
  }, []);
  const handleRestoreSaved4DView = useCallback(() => {
    setSaved4DViewMatrix(current => (current ? cloneMat3(current) : current));
  }, []);
  const handleClearSaved4DView = useCallback(() => {
    setSaved4DViewMatrix(null);
  }, []);
  const handleReset4DView = useCallback(() => {
    previewGesture.setViewMatrix(base4DViewMatrix);
  }, [base4DViewMatrix, previewGesture]);

  const handleReset = () => {
    if (actionDisabled) return;
    if (mode === 'cube') {
      setCubeState(createSolvedCube(cubeSize));
      cubeHistoryRef.current = [];
      setCubeCanUndo(false);
      setScrambleText('');
      return;
    }

    hypercubeHistoryRef.current = [];
    setHypercubeCanUndo(false);
    setHypercubeRotationMode(DEFAULT_HYPERCUBE_ROTATION_MODE);
    setSelected4DFace(null);
    setSliceMask(0);
    resetMagicCube4D();
  };

  const handleScramble = () => {
    if (actionDisabled) return;
    if (mode === 'hypercube') {
      hypercubeHistoryRef.current = [];
      setHypercubeCanUndo(false);
      setHypercubeRotationMode(DEFAULT_HYPERCUBE_ROTATION_MODE);
      setSelected4DFace(null);
      setSliceMask(0);
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

    const previousAction = hypercubeHistoryRef.current.pop();
    if (!previousAction) {
      return;
    }

    if (previousAction.type === 'view') {
      previewGesture.setViewMatrix(previousAction.previousViewMatrix);
    } else {
      undoMagicCube4D();
    }

    setHypercubeCanUndo(hypercubeHistoryRef.current.length > 0);
  };

  const handle4DControlPress = useCallback((
    option: Pick<MagicCube4DFaceAxisOption, 'axisIndex' | 'gripIndex' | 'oppositeGripIndex'> | { axisIndex: 0 | 1 | 2 },
    dir: -1 | 1,
  ) => {
    if (selected4DFace == null) {
      if (hypercubeRotationMode === null) {
        return;
      }
      if (hypercubeRotationMode === '4d') {
        rotateState(option.axisIndex, dir);
      } else {
        rotateSpatialState(option.axisIndex, dir);
      }
      return;
    }

    if (!('gripIndex' in option) || !('oppositeGripIndex' in option)) {
      return;
    }

    twistGrip(dir < 0 ? option.oppositeGripIndex : option.gripIndex, 1);
  }, [hypercubeRotationMode, rotateSpatialState, rotateState, selected4DFace, twistGrip]);
  const handleSliceButtonPress = useCallback((bit: number) => {
    setHypercubeRotationMode(null);
    setSelected4DFace(null);
    setSliceMask(mask => {
      const sourceMask = mask === 0 ? lastTurnSliceMaskRef.current : mask;
      const nextMask = (sourceMask ^ bit) & 0b111;
      const resolvedMask = nextMask === 0 ? bit : nextMask;
      lastTurnSliceMaskRef.current = resolvedMask;
      return resolvedMask;
    });
  }, [setSliceMask]);
  const handleRotationModePress = useCallback((nextMode: Exclude<HypercubeRotationMode, null>) => {
    setHypercubeRotationMode(nextMode);
    setSelected4DFace(null);
    setSliceMask(mask => {
      if (mask !== 0) {
        lastTurnSliceMaskRef.current = mask;
      }
      return 0;
    });
  }, [setSliceMask]);

  return (
    <GestureHandlerRootView style={styles.root}>
      <BottomSheetModalProvider>
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
                disabled={mode === 'cube' ? !cubeCanUndo || !!twistAnim : !hypercubeCanUndo || magicCube4DAnimating}
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
                : `Magic Cube 4D  •  tap CCW  •  hold CW  •  dbl tap center  •  slices ${sliceMask === 0 ? 'off' : MAGICCUBE4D_SLICE_LABELS[sliceMask]}`}
            </Text>
            <View style={styles.actionGroup}>
              {mode === 'hypercube' && (
                <ActionButton
                  icon="options-outline"
                  label="Settings"
                  onPress={handleOpen4DSettings}
                  disabled={false}
                />
              )}
              <ActionButton
                icon="shuffle"
                label="Scramble"
                onPress={handleScramble}
                disabled={actionDisabled}
              />
            </View>
          </View>
          <GestureDetector gesture={activeGesture.gesture}>
            <View
              style={styles.canvas}
              onLayout={e => {
                const { width: nextWidth, height: nextHeight } = e.nativeEvent.layout;
                if (mode === 'cube') {
                  setCubeCanvasSize(current => (
                    current.width === nextWidth && current.height === nextHeight
                      ? current
                      : { width: nextWidth, height: nextHeight }
                  ));
                } else {
                  setHypercubeCanvasSize(current => (
                    current.width === nextWidth && current.height === nextHeight
                      ? current
                      : { width: nextWidth, height: nextHeight }
                  ));
                }
              }}
            >
              {mode === 'cube' ? (
                <CubeCanvas
                  cubeState={cubeState}
                  cubeSize={cubeSize}
                  viewMatrix={activeGesture.viewMatrix}
                  zoom={activeGesture.zoom}
                  twistAnim={twistAnim}
                  width={activeCanvasSize.width}
                  height={activeCanvasSize.height}
                />
              ) : (
                <>
                  <MagicCube4DCanvas
                    key={`hypercube-${activeCanvasSize.width}x${activeCanvasSize.height}`}
                    state={magicCube4DState}
                    viewMatrix={activeGesture.viewMatrix}
                    zoom={activeGesture.zoom}
                    width={activeCanvasSize.width}
                    height={activeCanvasSize.height}
                    rotation4d={rotation4d}
                    twistAnimation={magicCube4DTwistAnimation}
                    settings={magicCube4DSettings}
                    onPickReady={(picker) => {
                      magicCube4DPickRef.current = picker;
                    }}
                  />
                  {show4DViewReset && (
                    <Pressable
                      style={({ pressed }) => [
                        styles.floatingViewResetButton,
                        pressed && styles.actionButtonPressed,
                      ]}
                      onPress={handleReset4DView}
                      disabled={magicCube4DAnimating}
                    >
                      <Ionicons name="compass-outline" size={16} color="#f5f7ff" />
                    </Pressable>
                  )}
                </>
              )}
            </View>
          </GestureDetector>
          {mode === 'hypercube' && (
            <View style={styles.hypercubeControls}>
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
                      onPress={() => handleSliceButtonPress(bit)}
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
                <Pressable
                  style={[
                    styles.sliceButton,
                    hypercubeRotationMode === '4d' && styles.sliceButtonActive,
                  ]}
                  onPress={() => handleRotationModePress('4d')}
                  disabled={magicCube4DAnimating}
                >
                  <Text
                    style={[
                      styles.sliceButtonText,
                      hypercubeRotationMode === '4d' && styles.sliceButtonTextActive,
                    ]}
                  >
                    4D Rot
                  </Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.sliceButton,
                    hypercubeRotationMode === '3d' && styles.sliceButtonActive,
                  ]}
                  onPress={() => handleRotationModePress('3d')}
                  disabled={magicCube4DAnimating}
                >
                  <Text
                    style={[
                      styles.sliceButtonText,
                      hypercubeRotationMode === '3d' && styles.sliceButtonTextActive,
                    ]}
                  >
                    3D Rot
                  </Text>
                </Pressable>
              </View>
              <View style={styles.bottomControls}>
                <View style={styles.bottomControlSplit}>
                  <View style={[styles.controlPanel, styles.faceControlPanel]}>
                    <View style={styles.facePickerColumn}>
                      {FACE_SELECTION_ROWS.map(row => (
                        <View key={row.join('-')} style={styles.faceChipRow}>
                          {row.map(faceIndex => (
                            <Pressable
                              key={MAGICCUBE4D_FACE_LABELS[faceIndex]}
                              style={({ pressed }) => [
                                styles.faceChip,
                                { backgroundColor: current4DFaceColors[faceIndex] },
                                selected4DFace === faceIndex && styles.faceChipActive,
                                pressed && !magicCube4DAnimating && styles.faceChipPressed,
                              ]}
                              onPress={() => toggle4DFace(faceIndex)}
                              disabled={magicCube4DAnimating}
                            >
                              <Text style={[styles.faceChipText, { color: getButtonTextColor(current4DFaceColors[faceIndex]) }]}>
                                {MAGICCUBE4D_FACE_LABELS[faceIndex]}
                              </Text>
                            </Pressable>
                          ))}
                        </View>
                      ))}
                    </View>
                  </View>
                  <View style={[styles.controlPanel, styles.turnControlPanel]}>
                    <View style={styles.turnButtonColumn}>
                      {selected4DAxisOptions.map(option => (
                        <View
                          key={`${selected4DFace}-${option.axisIndex}`}
                          style={styles.turnButtonPair}
                        >
                          <CompactControlButton
                            label={AXIS_TARGET_LABELS[option.axisIndex][0]}
                            onPress={() => handle4DControlPress(option, -1)}
                            disabled={magicCube4DAnimating || (selected4DFace == null && hypercubeRotationMode === null)}
                            color={selected4DFaceColor}
                          />
                          <CompactControlButton
                            label={AXIS_TARGET_LABELS[option.axisIndex][1]}
                            onPress={() => handle4DControlPress(option, 1)}
                            disabled={magicCube4DAnimating || (selected4DFace == null && hypercubeRotationMode === null)}
                            color={selected4DFaceColor}
                          />
                        </View>
                      ))}
                    </View>
                  </View>
                </View>
              </View>
            </View>
          )}
          <MagicCube4DSettingsSheet
            visible={magicCube4DSettingsOpen}
            settings={magicCube4DSettings}
            onChange={(nextSettings) => {
              if (
                nextSettings.viewPitchDeg !== magicCube4DSettings.viewPitchDeg ||
                nextSettings.viewYawDeg !== magicCube4DSettings.viewYawDeg
              ) {
                setSaved4DViewMatrix(null);
              }
              setMagicCube4DSettings(clampMagicCube4DSettings(nextSettings));
            }}
            onUseCurrentView={handleUseCurrent4DView}
            onRestoreSavedView={handleRestoreSaved4DView}
            onClearSavedView={handleClearSaved4DView}
            hasSavedView={saved4DViewMatrix !== null}
            onClose={() => setMagicCube4DSettingsOpen(false)}
            onReset={() => {
              setSaved4DViewMatrix(null);
              setMagicCube4DSettings(DEFAULT_MAGICCUBE4D_SETTINGS);
            }}
          />
        </SafeAreaView>
      </BottomSheetModalProvider>
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

interface CompactControlButtonProps {
  label: string;
  onPress: () => void;
  disabled: boolean;
  color?: string | null;
}

function CompactControlButton({ label, onPress, disabled, color = null }: CompactControlButtonProps) {
  const textColor = color ? getButtonTextColor(color) : '#f5f7ff';
  return (
    <Pressable
      style={({ pressed }) => [
        styles.compactControlButton,
        color ? { backgroundColor: color, borderColor: color } : null,
        disabled && styles.actionButtonDisabled,
        pressed && !disabled && styles.actionButtonPressed,
      ]}
      onPress={onPress}
      disabled={disabled}
    >
      <Text style={[styles.compactControlButtonText, { color: textColor }]}>{label}</Text>
    </Pressable>
  );
}

function getButtonTextColor(backgroundColor: string): string {
  const normalized = backgroundColor.replace('#', '');
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.62 ? '#111111' : '#f5f7ff';
}

function mat3EqualsWithinTolerance(left: Mat3, right: Mat3, epsilon = 1e-4): boolean {
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      if (Math.abs(left[row][col] - right[row][col]) > epsilon) {
        return false;
      }
    }
  }
  return true;
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
    gap: 8,
  },
  hypercubeControls: {
    paddingTop: 10,
    paddingBottom: 14,
    gap: 10,
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
    paddingHorizontal: 12,
    gap: 8,
  },
  bottomControlSplit: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 10,
  },
  controlPanel: {
    flex: 1,
    gap: 8,
  },
  faceControlPanel: {
    flex: 0.95,
  },
  turnControlPanel: {
    flex: 1.05,
  },
  facePickerColumn: {
    gap: 8,
  },
  faceChipRow: {
    flexDirection: 'row',
    gap: 8,
  },
  turnButtonColumn: {
    gap: 8,
    justifyContent: 'center',
    flex: 1,
  },
  turnButtonPair: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  faceChip: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 8,
    paddingVertical: 9,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
  },
  faceChipActive: {
    borderColor: '#f5f7ff',
    transform: [{ scale: 1.03 }],
  },
  faceChipPressed: {
    opacity: 0.92,
  },
  faceChipText: {
    color: '#111111',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  compactControlButton: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
  },
  compactControlButtonText: {
    color: '#f5f7ff',
    fontSize: 13,
    fontWeight: '800',
    textTransform: 'uppercase',
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
});
