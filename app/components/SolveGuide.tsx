import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { CubeState, Face } from '../utils/cubeModel';
import { FACE_COLORS } from '../utils/cubeModel';
import { analyseCubeState, type SolveStep } from '../utils/cubeSolver';

interface Props {
  cubeState: CubeState;
  crossFace: Face;
}

export default function SolveGuide({ cubeState, crossFace }: Props) {
  const [step, setStep] = useState<SolveStep | null>(null);

  useEffect(() => {
    let cancelled = false;
    const id = setTimeout(() => {
      if (cancelled) return;
      try {
        const result = analyseCubeState(cubeState, crossFace);
        if (!cancelled) setStep(result);
      } catch {
        if (!cancelled) setStep(null);
      }
    }, 60);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [cubeState, crossFace]);

  if (!step || step.phase === 'solved') return null;

  const crossColor = FACE_COLORS[crossFace];
  const phase = step.phase.toUpperCase();
  const progress = step.progress ? ` ${step.progress}` : '';
  const label = step.label && step.label !== step.phase.toUpperCase() ? `  ${step.label}` : '';
  const moves = step.moves && step.moves !== 'done' ? `  ${step.moves}` : '';

  return (
    <View pointerEvents="none" style={styles.container}>
      <View style={styles.row}>
        <View style={[styles.dot, { backgroundColor: crossColor }]} />
        <Text style={styles.text} numberOfLines={1}>
          <Text style={styles.phase}>{phase}{progress}</Text>
          {label ? <Text style={styles.label}>{label}</Text> : null}
          {moves ? <Text style={styles.moves}>{moves}</Text> : null}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 10,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    maxWidth: '90%',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    flexShrink: 0,
  },
  text: {
    flexShrink: 1,
  },
  phase: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 11,
    fontWeight: '600',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  label: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 11,
    fontWeight: '400',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  moves: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 11,
    fontWeight: '600',
    fontFamily: 'monospace',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
});
