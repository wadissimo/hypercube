import React from 'react';
import { View, TouchableOpacity, Text, StyleSheet } from 'react-native';
import type { Face, CubeSize } from '../utils/cubeModel';
import { ALL_FACES, FACE_COLORS } from '../utils/cubeModel';

interface Props {
  onTwist: (face: Face, clockwise: boolean, wide?: boolean) => void;
  disabled: boolean;
  cubeSize: CubeSize;
}

function textColor(bg: string): string {
  return bg === '#FFFFFF' || bg === '#FFD500' ? '#000' : '#FFF';
}

export default function ControlPanel({ onTwist, disabled, cubeSize }: Props) {
  return (
    <View style={styles.container}>
      <View style={styles.row}>
        {ALL_FACES.map(face => (
          <TouchableOpacity
            key={`${face}-cw`}
            style={[styles.button, { backgroundColor: FACE_COLORS[face] }, disabled && styles.disabled]}
            onPress={() => onTwist(face, true)}
            disabled={disabled}
            activeOpacity={0.7}
          >
            <Text style={[styles.label, { color: textColor(FACE_COLORS[face]) }]}>{face}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={styles.row}>
        {ALL_FACES.map(face => (
          <TouchableOpacity
            key={`${face}-ccw`}
            style={[styles.button, { backgroundColor: FACE_COLORS[face] }, disabled && styles.disabled]}
            onPress={() => onTwist(face, false)}
            disabled={disabled}
            activeOpacity={0.7}
          >
            <Text style={[styles.label, { color: textColor(FACE_COLORS[face]) }]}>{face}&apos;</Text>
          </TouchableOpacity>
        ))}
      </View>
      {cubeSize >= 4 && (
        <>
          <View style={styles.row}>
            {ALL_FACES.map(face => (
              <TouchableOpacity
                key={`${face}-w-cw`}
                style={[styles.button, styles.wideButton, { borderColor: FACE_COLORS[face] }, disabled && styles.disabled]}
                onPress={() => onTwist(face, true, true)}
                disabled={disabled}
                activeOpacity={0.7}
              >
                <Text style={[styles.label, { color: FACE_COLORS[face] }]}>{face}w</Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={styles.row}>
            {ALL_FACES.map(face => (
              <TouchableOpacity
                key={`${face}-w-ccw`}
                style={[styles.button, styles.wideButton, { borderColor: FACE_COLORS[face] }, disabled && styles.disabled]}
                onPress={() => onTwist(face, false, true)}
                disabled={disabled}
                activeOpacity={0.7}
              >
                <Text style={[styles.label, { color: FACE_COLORS[face] }]}>{face}w&apos;</Text>
              </TouchableOpacity>
            ))}
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 12,
    paddingBottom: 16,
    paddingTop: 8,
    gap: 8,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  button: {
    flex: 1,
    maxWidth: 60,
    height: 44,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#333',
  },
  wideButton: {
    backgroundColor: 'transparent',
    borderWidth: 2,
  },
  disabled: {
    opacity: 0.5,
  },
  label: {
    fontSize: 16,
    fontWeight: '700',
  },
});
