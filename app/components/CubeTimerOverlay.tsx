import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { CubeTimerSession } from '../utils/cubeTimer';
import { formatCubeTimerElapsed, getCubeTimerElapsedMs } from '../utils/cubeTimer';

interface Props {
  timer: CubeTimerSession;
  onStart: () => void;
  onPause: () => void;
  onStop: () => void;
}

export default function CubeTimerOverlay({
  timer,
  onStart,
  onPause,
  onStop,
}: Props) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (timer.status !== 'running') {
      return;
    }

    const intervalId = setInterval(() => {
      setNow(Date.now());
    }, 50);

    return () => clearInterval(intervalId);
  }, [timer.status]);

  useEffect(() => {
    if (timer.status !== 'running') {
      setNow(Date.now());
    }
  }, [timer.elapsedMs, timer.startedAt, timer.status]);

  const elapsedMs = getCubeTimerElapsedMs(timer, now);
  const canStop = elapsedMs > 0;
  const showStart = timer.status !== 'running';
  const showPause = timer.status === 'running';
  const showStop = timer.status === 'running';

  return (
    <View pointerEvents="box-none" style={styles.container}>
      <View style={styles.row}>
        <Text style={styles.timerValue}>{formatCubeTimerElapsed(elapsedMs)}</Text>
        <View style={styles.buttonGroup}>
          {showStart && (
            <OverlayButton
              icon="play"
              onPress={onStart}
              disabled={false}
              accent
              largeHitTarget
            />
          )}
          {showPause && (
            <OverlayButton
              icon="pause"
              onPress={onPause}
              disabled={false}
            />
          )}
          {showStop && (
            <OverlayButton
              icon="stop"
              onPress={onStop}
              disabled={!canStop}
              largeHitTarget
            />
          )}
        </View>
      </View>
    </View>
  );
}

interface OverlayButtonProps {
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  disabled: boolean;
  accent?: boolean;
  largeHitTarget?: boolean;
}

function OverlayButton({
  icon,
  onPress,
  disabled,
  accent = false,
  largeHitTarget = false,
}: OverlayButtonProps) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.button,
        largeHitTarget && styles.buttonLarge,
        accent && styles.buttonAccent,
        disabled && styles.buttonDisabled,
        pressed && !disabled && styles.pressed,
      ]}
      onPress={onPress}
      disabled={disabled}
      hitSlop={largeHitTarget ? 12 : 8}
    >
      <Ionicons name={icon} size={largeHitTarget ? 20 : 18} color="#f5f7ff" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 18,
    right: 12,
    left: 12,
    alignItems: 'flex-end',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    flexWrap: 'nowrap',
    width: '100%',
  },
  timerValue: {
    color: '#f5f7ff',
    fontSize: 17,
    fontWeight: '800',
    lineHeight: 20,
    fontVariant: ['tabular-nums'],
    textAlign: 'left',
    textShadowColor: 'rgba(0,0,0,0.65)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
    minWidth: 62,
    flexShrink: 0,
  },
  buttonGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
  },
  button: {
    width: 40,
    height: 40,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(8,12,20,0.4)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  buttonLarge: {
    width: 48,
    height: 48,
  },
  buttonAccent: {
    backgroundColor: 'rgba(73,184,128,0.34)',
    borderColor: 'rgba(73,184,128,0.6)',
  },
  buttonDisabled: {
    opacity: 0.38,
  },
  pressed: {
    transform: [{ scale: 0.98 }],
  },
});
