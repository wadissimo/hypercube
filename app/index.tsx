import React, { useState } from 'react';
import { View, StyleSheet, useWindowDimensions, Pressable, Text } from 'react-native';
import { GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import CubeCanvas from './components/CubeCanvas';
import ControlPanel from './components/ControlPanel';
import type { CubeState, Face } from './utils/cubeModel';
import { ALL_FACES, createSolvedCube, twistFace } from './utils/cubeModel';
import { usePanRotation } from './hooks/usePanRotation';
import { useTwistAnimation } from './hooks/useTwistAnimation';

const SCRAMBLE_MOVES = 20;

export default function Index() {
  const { width } = useWindowDimensions();
  const [cubeState, setCubeState] = useState(createSolvedCube);
  const [scrambleText, setScrambleText] = useState('');
  const [canvasHeight, setCanvasHeight] = useState(0);
  const { viewMatrix, zoom, gesture } = usePanRotation();
  const { twistAnim, twist } = useTwistAnimation(setCubeState);
  const disabled = !!twistAnim;

  const handleReset = () => {
    if (disabled) return;
    setCubeState(createSolvedCube());
    setScrambleText('');
  };

  const handleScramble = () => {
    if (disabled) return;
    const scramble = createScramble(SCRAMBLE_MOVES);
    setCubeState(applyMoves(createSolvedCube(), scramble.moves));
    setScrambleText(scramble.notation);
  };

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
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
              viewMatrix={viewMatrix}
              zoom={zoom}
              twistAnim={twistAnim}
              width={width}
              height={canvasHeight}
            />
          </View>
        </GestureDetector>
        <ControlPanel onTwist={twist} disabled={disabled} />
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
  for (const { face, clockwise } of moves) {
    next = twistFace(next, face, clockwise);
  }
  return next;
}

interface Move {
  face: Face;
  clockwise: boolean;
}

function createScramble(length: number): { moves: Move[]; notation: string } {
  const moves: Move[] = [];
  let previousFace: Face | null = null;
  let previousAxis: string | null = null;

  while (moves.length < length) {
    const face = ALL_FACES[Math.floor(Math.random() * ALL_FACES.length)];
    const axis = faceAxis(face);
    if (face === previousFace || axis === previousAxis) {
      continue;
    }

    const clockwise = Math.random() >= 0.5;
    moves.push({ face, clockwise });
    previousFace = face;
    previousAxis = axis;
  }

  return {
    moves,
    notation: moves.map(formatMove).join(' '),
  };
}

function faceAxis(face: Face): string {
  switch (face) {
    case 'U':
    case 'D':
      return 'y';
    case 'L':
    case 'R':
      return 'x';
    case 'F':
    case 'B':
      return 'z';
  }
}

function formatMove({ face, clockwise }: Move): string {
  return clockwise ? face : `${face}'`;
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#1a1a2e',
  },
  safeArea: {
    flex: 1,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 14,
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
