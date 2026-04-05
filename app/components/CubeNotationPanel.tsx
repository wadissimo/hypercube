import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { CubeSize, Face } from '../utils/cubeModel';
import { FACE_COLORS } from '../utils/cubeModel';

const LEFT_FACE_ROWS: Face[] = ['U', 'L', 'B'];
const RIGHT_FACE_ROWS: Face[] = ['R', 'F', 'D'];
const ROTATION_ROWS = [
  { label: 'X', axisIndex: 0 as const },
  { label: 'Y', axisIndex: 1 as const },
  { label: 'Z', axisIndex: 2 as const },
] as const;

interface Props {
  cubeSize: CubeSize;
  disabled: boolean;
  cubeRotationMode: boolean;
  sliceMask: number;
  onCubeRotationPress: () => void;
  onCubeSlicePress: (bit: number) => void;
  onViewRotate: (axisIndex: 0 | 1 | 2, dir: -1 | 1) => void;
  onNotationMove: (face: Face, clockwise: boolean, turns?: 1 | 2) => void;
}

export default function CubeNotationPanel({
  cubeSize,
  disabled,
  cubeRotationMode,
  sliceMask,
  onCubeRotationPress,
  onCubeSlicePress,
  onViewRotate,
  onNotationMove,
}: Props) {
  const availableSliceBits = useMemo(() => getAvailableCubeSliceBits(cubeSize), [cubeSize]);
  const hasSliceControls = availableSliceBits.length > 0;

  return (
    <View style={styles.container}>
      <View style={styles.modeBar}>
        {availableSliceBits.map(bit => {
          const active = !cubeRotationMode && (sliceMask & bit) !== 0;
          return (
            <Pressable
              key={`slice-${bit}`}
              style={({ pressed }) => [
                styles.modeChip,
                active && styles.modeChipActive,
                pressed && !disabled && styles.modeChipPressed,
              ]}
              onPress={() => onCubeSlicePress(bit)}
              disabled={disabled}
            >
              <Text style={[styles.modeChipText, active && styles.modeChipTextActive]}>
                Slice {bit}
              </Text>
            </Pressable>
          );
        })}
        <Pressable
          style={({ pressed }) => [
            styles.modeChip,
            cubeRotationMode && styles.modeChipActive,
            pressed && !disabled && styles.modeChipPressed,
          ]}
          onPress={onCubeRotationPress}
          disabled={disabled}
        >
          <Text style={[styles.modeChipText, cubeRotationMode && styles.modeChipTextActive]}>
            Cube Rot
          </Text>
        </Pressable>
        {!hasSliceControls && <View style={styles.modeSpacer} />}
      </View>

      {cubeRotationMode ? (
        <View style={styles.rotationPanel}>
          <RotationColumn
            rows={ROTATION_ROWS.slice(0, 2)}
            disabled={disabled}
            onViewRotate={onViewRotate}
          />
          <RotationColumn
            rows={ROTATION_ROWS.slice(2)}
            disabled={disabled}
            onViewRotate={onViewRotate}
          />
        </View>
      ) : (
        <View style={styles.notationSplit}>
          <FaceColumn
            faces={LEFT_FACE_ROWS}
            disabled={disabled}
            onNotationMove={onNotationMove}
            reverseOrder={false}
          />
          <FaceColumn
            faces={RIGHT_FACE_ROWS}
            disabled={disabled}
            onNotationMove={onNotationMove}
            reverseOrder
          />
        </View>
      )}
    </View>
  );
}

interface FaceColumnProps {
  faces: readonly Face[];
  disabled: boolean;
  onNotationMove: (face: Face, clockwise: boolean, turns?: 1 | 2) => void;
  reverseOrder: boolean;
}

function FaceColumn({ faces, disabled, onNotationMove, reverseOrder }: FaceColumnProps) {
  return (
    <View style={styles.faceColumn}>
      {faces.map(face => (
        <View key={face} style={styles.faceRow}>
          {(reverseOrder
            ? [
              { label: `${face}2`, clockwise: true, turns: 2 as const },
              { label: `${face}'`, clockwise: false, turns: 1 as const },
              { label: face, clockwise: true, turns: 1 as const },
            ]
            : [
              { label: face, clockwise: true, turns: 1 as const },
              { label: `${face}'`, clockwise: false, turns: 1 as const },
              { label: `${face}2`, clockwise: true, turns: 2 as const },
            ]).map(button => (
            <FaceMoveButton
              key={button.label}
              label={button.label}
              face={face}
              disabled={disabled}
              onPress={() => onNotationMove(face, button.clockwise, button.turns)}
            />
          ))}
        </View>
      ))}
    </View>
  );
}

interface RotationColumnProps {
  rows: readonly { label: string; axisIndex: 0 | 1 | 2 }[];
  disabled: boolean;
  onViewRotate: (axisIndex: 0 | 1 | 2, dir: -1 | 1) => void;
}

function RotationColumn({ rows, disabled, onViewRotate }: RotationColumnProps) {
  return (
    <View style={styles.faceColumn}>
      {rows.map(row => (
        <View key={row.label} style={styles.faceRow}>
          <CompactButton
            label={`${row.label}2`}
            disabled={disabled}
            onPress={() => {
              onViewRotate(row.axisIndex, 1);
              onViewRotate(row.axisIndex, 1);
            }}
          />
          <CompactButton
            label={`${row.label}'`}
            disabled={disabled}
            onPress={() => onViewRotate(row.axisIndex, -1)}
          />
          <CompactButton
            label={row.label}
            disabled={disabled}
            onPress={() => onViewRotate(row.axisIndex, 1)}
          />
        </View>
      ))}
    </View>
  );
}

interface FaceMoveButtonProps {
  label: string;
  face: Face;
  disabled: boolean;
  onPress: () => void;
}

function FaceMoveButton({ label, face, disabled, onPress }: FaceMoveButtonProps) {
  const backgroundColor = FACE_COLORS[face];
  const textColor = getButtonTextColor(backgroundColor);
  return (
    <Pressable
      style={({ pressed }) => [
        styles.faceMoveButton,
        { backgroundColor, borderColor: backgroundColor },
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

interface CompactButtonProps {
  label: string;
  disabled: boolean;
  onPress: () => void;
}

function CompactButton({ label, disabled, onPress }: CompactButtonProps) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.compactButton,
        disabled && styles.disabled,
        pressed && !disabled && styles.compactButtonPressed,
      ]}
      onPress={onPress}
      disabled={disabled}
    >
      <Text style={styles.compactButtonText}>{label}</Text>
    </Pressable>
  );
}

function getAvailableCubeSliceBits(cubeSize: CubeSize): number[] {
  if (cubeSize === 5) {
    return [1, 2, 4];
  }
  if (cubeSize === 4) {
    return [1, 2];
  }
  if (cubeSize === 3) {
    return [1];
  }
  return [];
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
  modeSpacer: {
    flex: 1,
  },
  rotationPanel: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    gap: 10,
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
  compactButton: {
    flex: 1,
    minWidth: 0,
    height: 36,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  compactButtonPressed: {
    transform: [{ scale: 0.98 }],
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  compactButtonText: {
    color: '#f5f7ff',
    fontSize: 13,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  disabled: {
    opacity: 0.45,
  },
});
