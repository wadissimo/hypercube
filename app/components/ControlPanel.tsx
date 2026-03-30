import React from 'react';
import { View, TouchableOpacity, Text, StyleSheet } from 'react-native';
import type { Face } from '../utils/cubeModel';
import { ALL_FACES, FACE_COLORS } from '../utils/cubeModel';

interface Props {
  onTwist: (face: Face, clockwise: boolean) => void;
  disabled: boolean;
}

function textColor(bg: string): string {
  // White and yellow need dark text
  return bg === '#FFFFFF' || bg === '#FFD500' ? '#000' : '#FFF';
}

export default function ControlPanel({ onTwist, disabled }: Props) {
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 12,
    paddingBottom: 24,
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
  disabled: {
    opacity: 0.5,
  },
  label: {
    fontSize: 16,
    fontWeight: '700',
  },
});
