import React, { useEffect, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetScrollView,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import type { HypercubeGestureAction, MagicCube4DSettings } from '../utils/magiccube4dSettings';

interface Props {
  visible: boolean;
  settings: MagicCube4DSettings;
  onChange: (settings: MagicCube4DSettings) => void;
  onClose: () => void;
  onReset: () => void;
}

type NumericSettingKey = {
  [K in keyof MagicCube4DSettings]: MagicCube4DSettings[K] extends number ? K : never;
}[keyof MagicCube4DSettings];

type GestureSettingKey = 'singleTapAction' | 'longTapAction' | 'doubleTapAction';

interface SettingSpec {
  key: NumericSettingKey;
  label: string;
  step: number;
  min: number;
  max: number;
  format: (value: number) => string;
}

interface GestureSettingSpec {
  key: GestureSettingKey;
  label: string;
}

const SECTIONS: { title: string; items: SettingSpec[] }[] = [
  {
    title: 'Interaction',
    items: [
      {
        key: 'dragSensitivity',
        label: 'Drag sensitivity',
        step: 0.1,
        min: 0.4,
        max: 1.8,
        format: value => `${value.toFixed(2)}x`,
      },
    ],
  },
  {
    title: 'Animations',
    items: [
      {
        key: 'twistDurationMs',
        label: 'Twist duration',
        step: 20,
        min: 120,
        max: 600,
        format: value => `${Math.round(value)} ms`,
      },
      {
        key: 'animationDurationMs',
        label: 'Other animations',
        step: 20,
        min: 120,
        max: 600,
        format: value => `${Math.round(value)} ms`,
      },
    ],
  },
  {
    title: 'View',
    items: [
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
    ],
  },
  {
    title: 'Projection',
    items: [
      {
        key: 'projectionScale',
        label: 'Scale',
        step: 0.05,
        min: 0.6,
        max: 1.8,
        format: value => `${value.toFixed(2)}x`,
      },
      {
        key: 'projection4d',
        label: '4D FOV',
        step: 0.05,
        min: 0.6,
        max: 1.6,
        format: value => `${value.toFixed(2)}x`,
      },
    ],
  },
  {
    title: 'Geometry',
    items: [
      {
        key: 'faceSpacing',
        label: 'Face spacing',
        step: 0.05,
        min: 0.7,
        max: 1.6,
        format: value => `${value.toFixed(2)}x`,
      },
      {
        key: 'stickerSpacing',
        label: 'Sticker spacing',
        step: 0.05,
        min: 0.7,
        max: 1.6,
        format: value => `${value.toFixed(2)}x`,
      },
    ],
  },
  {
    title: 'Lighting',
    items: [
      {
        key: 'shadowLight',
        label: 'Shadow light',
        step: 0.04,
        min: 0,
        max: 0.65,
        format: value => `${Math.round(value * 100)}%`,
      },
    ],
  },
];

const GESTURE_SETTINGS: GestureSettingSpec[] = [
  { key: 'singleTapAction', label: 'Single tap' },
  { key: 'longTapAction', label: 'Long tap' },
  { key: 'doubleTapAction', label: 'Double tap' },
];

const GESTURE_ACTION_OPTIONS: { value: HypercubeGestureAction; label: string }[] = [
  { value: 'turnCounterclockwise', label: 'Turn CCW' },
  { value: 'turnClockwise', label: 'Turn CW' },
  { value: 'centerFace', label: 'Center face' },
  { value: 'selectFace', label: 'Select face' },
  { value: 'none', label: 'None' },
];

export default function MagicCube4DSettingsSheet({
  visible,
  settings,
  onChange,
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

  const updateGestureSetting = (key: GestureSettingKey, value: HypercubeGestureAction) => {
    onChange({
      ...settings,
      [key]: value,
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
      snapPoints={['76%']}
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
          <Text style={styles.title}>4D Settings</Text>
          <Pressable style={styles.resetButton} onPress={onReset}>
            <Text style={styles.resetButtonText}>Reset</Text>
          </Pressable>
        </View>
        {SECTIONS.map(section => (
          <View key={section.title} style={styles.section}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            {section.items.map(spec => (
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
        ))}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Gesture Actions</Text>
          {GESTURE_SETTINGS.map(spec => (
            <View key={spec.key} style={styles.gestureSection}>
              <View style={styles.settingMeta}>
                <Text style={styles.settingLabel}>{spec.label}</Text>
                <Text style={styles.settingValue}>{getGestureActionLabel(settings[spec.key])}</Text>
              </View>
              <View style={styles.gestureOptionGrid}>
                {GESTURE_ACTION_OPTIONS.map(option => {
                  const active = settings[spec.key] === option.value;
                  return (
                    <Pressable
                      key={`${spec.key}-${option.value}`}
                      style={[
                        styles.gestureOptionButton,
                        active && styles.gestureOptionButtonActive,
                      ]}
                      onPress={() => updateGestureSetting(spec.key, option.value)}
                    >
                      <Text
                        style={[
                          styles.gestureOptionButtonText,
                          active && styles.gestureOptionButtonTextActive,
                        ]}
                      >
                        {option.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ))}
        </View>
      </BottomSheetScrollView>
    </BottomSheetModal>
  );
}

function getGestureActionLabel(value: HypercubeGestureAction): string {
  const option = GESTURE_ACTION_OPTIONS.find(candidate => candidate.value === value);
  return option?.label ?? value;
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
    gap: 18,
  },
  section: {
    gap: 10,
  },
  gestureSection: {
    gap: 12,
  },
  sectionTitle: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
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
  gestureOptionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
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
  gestureOptionButton: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  gestureOptionButtonActive: {
    borderColor: '#f5f7ff',
    backgroundColor: 'rgba(245,247,255,0.16)',
  },
  gestureOptionButtonText: {
    color: 'rgba(245,247,255,0.82)',
    fontSize: 13,
    fontWeight: '600',
  },
  gestureOptionButtonTextActive: {
    color: '#f5f7ff',
  },
});
