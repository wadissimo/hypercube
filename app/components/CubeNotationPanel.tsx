import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { CubeSize, Face } from '../utils/cubeModel';
import { FACE_COLORS } from '../utils/cubeModel';
import { getFaceMoveButtons } from '../utils/cubeNotation';

const LEFT_FACE_ROWS: Face[] = ['U', 'L', 'B'];
const RIGHT_FACE_ROWS: Face[] = ['R', 'F', 'D'];

interface Props {
  cubeSize: CubeSize;
  disabled: boolean;
  sliceMask: number;
  useFaceColors: boolean;
  faceColors?: Partial<Record<Face, string>>;
  onCubeSlicePress: (bit: number) => void;
  onNotationMove: (face: Face, clockwise: boolean, turns?: 1 | 2) => void;
}

export default function CubeNotationPanel({
  cubeSize,
  disabled,
  sliceMask,
  useFaceColors,
  faceColors,
  onCubeSlicePress,
  onNotationMove,
}: Props) {
  const availableSliceEntries = useMemo(() => getAvailableCubeSliceEntries(cubeSize), [cubeSize]);

  return (
    <View style={styles.container}>
      <View style={styles.modeBar}>
        <Text style={styles.modeLabel}>Slices:</Text>
        {availableSliceEntries.map(entry => {
          const active = entry.bit === ALL_SLICES_BIT
            ? sliceMask === ALL_SLICES_BIT
            : sliceMask !== ALL_SLICES_BIT && (sliceMask & entry.bit) !== 0;
          return (
            <Pressable
              key={`slice-${entry.bit}`}
              style={({ pressed }) => [
                styles.modeChip,
                active && styles.modeChipActive,
                pressed && !disabled && styles.modeChipPressed,
              ]}
              onPress={() => onCubeSlicePress(entry.bit)}
              disabled={disabled}
            >
              <Text style={[styles.modeChipText, active && styles.modeChipTextActive]}>
                {entry.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <View style={styles.notationSplit}>
        <FaceColumn
          faces={LEFT_FACE_ROWS}
          disabled={disabled}
          useFaceColors={useFaceColors}
          faceColors={faceColors}
          onNotationMove={onNotationMove}
          reverseOrder={false}
        />
        <FaceColumn
          faces={RIGHT_FACE_ROWS}
          disabled={disabled}
          useFaceColors={useFaceColors}
          faceColors={faceColors}
          onNotationMove={onNotationMove}
          reverseOrder
        />
      </View>
    </View>
  );
}

interface FaceColumnProps {
  faces: readonly Face[];
  disabled: boolean;
  useFaceColors: boolean;
  faceColors?: Partial<Record<Face, string>>;
  onNotationMove: (face: Face, clockwise: boolean, turns?: 1 | 2) => void;
  reverseOrder: boolean;
}

function FaceColumn({ faces, disabled, useFaceColors, faceColors, onNotationMove, reverseOrder }: FaceColumnProps) {
  return (
    <View style={styles.faceColumn}>
      {faces.map(face => (
        <View key={face} style={styles.faceRow}>
          {getFaceMoveButtons(face, reverseOrder).map(button => (
            <FaceMoveButton
              key={button.label}
              label={button.label}
              face={face}
              useFaceColors={useFaceColors}
              faceColor={faceColors?.[face]}
              disabled={disabled}
              onPress={() => onNotationMove(face, button.clockwise, button.turns)}
            />
          ))}
        </View>
      ))}
    </View>
  );
}

interface FaceMoveButtonProps {
  label: string;
  face: Face;
  useFaceColors: boolean;
  faceColor?: string;
  disabled: boolean;
  onPress: () => void;
}

function FaceMoveButton({ label, face, useFaceColors, faceColor, disabled, onPress }: FaceMoveButtonProps) {
  const backgroundColor = faceColor ?? FACE_COLORS[face];
  const resolvedBackgroundColor = useFaceColors ? backgroundColor : 'rgba(255,255,255,0.1)';
  const resolvedBorderColor = useFaceColors ? backgroundColor : 'rgba(255,255,255,0.14)';
  const textColor = useFaceColors ? getButtonTextColor(backgroundColor) : '#f5f7ff';
  return (
    <Pressable
      style={({ pressed }) => [
        styles.faceMoveButton,
        { backgroundColor: resolvedBackgroundColor, borderColor: resolvedBorderColor },
        disabled && styles.disabled,
        pressed && !disabled && styles.faceMoveButtonPressed,
      ]}
      onPress={onPress}
      disabled={disabled}
    >
      <Text style={[styles.faceMoveButtonText, { color: textColor }]}>{label}</Text>
    </Pressable>
  );
}

const ALL_SLICES_BIT = -1;

function getAvailableCubeSliceEntries(cubeSize: CubeSize): { bit: number; label: string }[] {
  const numbered = cubeSize === 5
    ? [1, 2, 3]
    : cubeSize === 4
      ? [1, 2]
      : [1];
  return [
    ...numbered.map(value => ({ bit: 1 << (value - 1), label: `${value}` })),
    { bit: ALL_SLICES_BIT, label: 'All' },
  ];
}

function getButtonTextColor(backgroundColor: string): string {
  const normalized = backgroundColor.replace('#', '');
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.62 ? '#111111' : '#f5f7ff';
}

const styles = StyleSheet.create({
  container: {
    paddingTop: 8,
    paddingBottom: 10,
    gap: 10,
  },
  modeBar: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 14,
    gap: 8,
  },
  modeLabel: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 12,
    fontWeight: '700',
  },
  modeChip: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 7,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  modeChipActive: {
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderColor: 'rgba(255,255,255,0.3)',
  },
  modeChipPressed: {
    transform: [{ scale: 0.98 }],
  },
  modeChipText: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 12,
    fontWeight: '600',
  },
  modeChipTextActive: {
    color: '#f5f7ff',
  },
  notationSplit: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    gap: 10,
  },
  faceColumn: {
    flex: 1,
    gap: 6,
  },
  faceRow: {
    flexDirection: 'row',
    gap: 6,
  },
  faceMoveButton: {
    flex: 1,
    minWidth: 0,
    minHeight: 38,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  faceMoveButtonPressed: {
    transform: [{ scale: 0.98 }],
  },
  faceMoveButtonText: {
    fontSize: 13,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  disabled: {
    opacity: 0.45,
  },
});
