import React, { useState } from 'react';
import { View, StyleSheet, useWindowDimensions, Pressable, Text } from 'react-native';
import { GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import CubeCanvas from './components/CubeCanvas';
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
import { useTwistAnimation } from './hooks/useTwistAnimation';

const SCRAMBLE_MOVES = 20;

export default function Index() {
  const { width } = useWindowDimensions();
  const [cubeSize, setCubeSize] = useState<CubeSize>(3);
  const [cubeState, setCubeState] = useState(() => createSolvedCube(3));
  const [scrambleText, setScrambleText] = useState('');
  const [canvasHeight, setCanvasHeight] = useState(0);
  const { twistAnim, twist } = useTwistAnimation(setCubeState);
  const disabled = !!twistAnim;
  const { viewMatrix, zoom, gesture } = useCubeGesture({
    cubeState, cubeSize, width, height: canvasHeight,
    onTwist: twist, disabled,
  });

  const handleSizeChange = (size: CubeSize) => {
    if (disabled || size === cubeSize) return;
    setCubeSize(size);
    setCubeState(createSolvedCube(size));
    setScrambleText('');
  };

  const handleReset = () => {
    if (disabled) return;
    setCubeState(createSolvedCube(cubeSize));
    setScrambleText('');
  };

  const handleScramble = () => {
    if (disabled) return;
    const scramble = createScramble(SCRAMBLE_MOVES, cubeSize);
    setCubeState(applyMoves(createSolvedCube(cubeSize), scramble.moves));
    setScrambleText(scramble.notation);
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
                size === cubeSize && styles.modeButtonActive,
                i === 0 && styles.modeButtonFirst,
                i === SUPPORTED_CUBE_SIZES.length - 1 && styles.modeButtonLast,
              ]}
              onPress={() => handleSizeChange(size)}
              disabled={disabled}
            >
              <Text
                style={[
                  styles.modeButtonText,
                  size === cubeSize && styles.modeButtonTextActive,
                ]}
              >
                {size}x{size}
              </Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.topBar}>
          <ActionButton
            icon="refresh"
            label="Reset"
            onPress={handleReset}
            disabled={disabled}
          />
          <Text
            style={styles.scrambleText}
            numberOfLines={2}
            adjustsFontSizeToFit
            minimumFontScale={0.7}
          >
            {scrambleText}
          </Text>
          <ActionButton
            icon="shuffle"
            label="Scramble"
            onPress={handleScramble}
            disabled={disabled}
          />
        </View>
        <GestureDetector gesture={gesture}>
          <View
            style={styles.canvas}
            onLayout={e => setCanvasHeight(e.nativeEvent.layout.height)}
          >
            <CubeCanvas
              cubeState={cubeState}
              cubeSize={cubeSize}
              viewMatrix={viewMatrix}
              zoom={zoom}
              twistAnim={twistAnim}
              width={width}
              height={canvasHeight}
            />
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
