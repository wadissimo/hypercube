import React, { useEffect, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetScrollView,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import type { Face } from '../utils/cubeModel';
import { ALL_FACES, FACE_COLORS } from '../utils/cubeModel';
import type { CubeViewSettings } from '../utils/cubeViewSettings';

interface Props {
  visible: boolean;
  settings: CubeViewSettings;
  crossFace: Face;
  onChange: (settings: CubeViewSettings) => void;
  onCrossFaceChange: (face: Face) => void;
  onClose: () => void;
  onReset: () => void;
}

type SettingKey = keyof CubeViewSettings;

interface SettingSpec {
  key: SettingKey;
  label: string;
  step: number;
  min: number;
  max: number;
  format: (value: number) => string;
}

const VIEW_SETTINGS: SettingSpec[] = [
  {
    key: 'viewPitchDeg',
    label: 'Pitch',
    step: 2,
    min: -85,
    max: 85,
    format: value => `${Math.round(value)}°`,
  },
  {
    key: 'viewYawDeg',
    label: 'Yaw',
    step: 3,
    min: -180,
    max: 180,
    format: value => `${Math.round(value)}°`,
  },
  {
    key: 'viewRollDeg',
    label: 'Roll',
    step: 3,
    min: -180,
    max: 180,
    format: value => `${Math.round(value)}°`,
  },
];


export default function CubeViewSettingsSheet({
  visible,
  settings,
  crossFace,
  onChange,
  onCrossFaceChange,
  onClose,
  onReset,
}: Props) {
  const modalRef = useRef<BottomSheetModal>(null);

  useEffect(() => {
    if (visible) {
      modalRef.current?.present();
    } else {
      modalRef.current?.dismiss();
    }
  }, [visible]);

  const updateSetting = (spec: SettingSpec, delta: number) => {
    const nextValue = clamp(settings[spec.key] + delta, spec.min, spec.max);
    onChange({
      ...settings,
      [spec.key]: nextValue,
    });
  };

  const renderBackdrop = (props: BottomSheetBackdropProps) => (
    <BottomSheetBackdrop
      {...props}
      disappearsOnIndex={-1}
      appearsOnIndex={0}
      opacity={0.42}
      pressBehavior="close"
    />
  );

  return (
    <BottomSheetModal
      ref={modalRef}
      snapPoints={['60%']}
      index={0}
      enablePanDownToClose
      enableDynamicSizing={false}
      onDismiss={onClose}
      backdropComponent={renderBackdrop}
      backgroundStyle={styles.sheet}
      handleIndicatorStyle={styles.handleIndicator}
    >
      <BottomSheetScrollView
        style={styles.content}
        contentContainerStyle={styles.contentInner}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.title}>3D Settings</Text>
          <Pressable style={styles.resetButton} onPress={onReset}>
            <Text style={styles.resetButtonText}>Reset</Text>
          </Pressable>
        </View>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>View</Text>
          {VIEW_SETTINGS.map(spec => (
            <View key={spec.key} style={styles.settingRow}>
              <View style={styles.settingMeta}>
                <Text style={styles.settingLabel}>{spec.label}</Text>
                <Text style={styles.settingValue}>{spec.format(settings[spec.key])}</Text>
              </View>
              <View style={styles.stepper}>
                <Pressable
                  style={styles.stepperButton}
                  onPress={() => updateSetting(spec, -spec.step)}
                >
                  <Ionicons name="remove" size={18} color="#f5f7ff" />
                </Pressable>
                <Pressable
                  style={styles.stepperButton}
                  onPress={() => updateSetting(spec, spec.step)}
                >
                  <Ionicons name="add" size={18} color="#f5f7ff" />
                </Pressable>
              </View>
            </View>
          ))}
        </View>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Cross color</Text>
          <View style={styles.facePickerRow}>
            {ALL_FACES.map(face => {
              const bg = FACE_COLORS[face];
              const isActive = crossFace === face;
              return (
                <Pressable
                  key={face}
                  onPress={() => onCrossFaceChange(face)}
                  style={[styles.faceSwatch, isActive && styles.faceSwatchActive]}
                >
                  <View style={[styles.faceSwatchInner, { backgroundColor: bg }]} />
                </Pressable>
              );
            })}
          </View>
        </View>
      </BottomSheetScrollView>
    </BottomSheetModal>
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

const styles = StyleSheet.create({
  sheet: {
    backgroundColor: '#202133',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  handleIndicator: {
    backgroundColor: 'rgba(255,255,255,0.35)',
    width: 42,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
    marginBottom: 2,
  },
  title: {
    color: '#f5f7ff',
    fontSize: 18,
    fontWeight: '700',
  },
  resetButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  resetButtonText: {
    color: '#f5f7ff',
    fontSize: 13,
    fontWeight: '700',
  },
  content: {
    flex: 1,
  },
  contentInner: {
    paddingHorizontal: 18,
    paddingVertical: 16,
    gap: 20,
  },
  section: {
    gap: 10,
  },
  sectionTitle: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  facePickerRow: {
    flexDirection: 'row',
    gap: 10,
  },
  faceSwatch: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  faceSwatchActive: {
    borderColor: '#f5f7ff',
  },
  faceSwatchInner: {
    width: 20,
    height: 20,
    borderRadius: 10,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    gap: 12,
  },
  settingMeta: {
    flex: 1,
    gap: 2,
  },
  settingLabel: {
    color: '#f5f7ff',
    fontSize: 14,
    fontWeight: '600',
  },
  settingValue: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 12,
    fontWeight: '600',
  },
  stepper: {
    flexDirection: 'row',
    gap: 8,
  },
  stepperButton: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
});
