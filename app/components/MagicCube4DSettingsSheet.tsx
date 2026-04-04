import React, { useEffect, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetScrollView,
  BottomSheetView,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import type { MagicCube4DSettings } from '../utils/magiccube4dSettings';

interface Props {
  visible: boolean;
  settings: MagicCube4DSettings;
  onChange: (settings: MagicCube4DSettings) => void;
  onUseCurrentView: () => void;
  onRestoreSavedView: () => void;
  onClearSavedView: () => void;
  hasSavedView: boolean;
  onClose: () => void;
  onReset: () => void;
}

type SettingKey = keyof MagicCube4DSettings;

interface SettingSpec {
  key: SettingKey;
  label: string;
  step: number;
  min: number;
  max: number;
  format: (value: number) => string;
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
];

export default function MagicCube4DSettingsSheet({
  visible,
  settings,
  onChange,
  onUseCurrentView,
  onRestoreSavedView,
  onClearSavedView,
  hasSavedView,
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
      snapPoints={['76%']}
      index={0}
      enablePanDownToClose
      enableDynamicSizing={false}
      onDismiss={onClose}
      backdropComponent={renderBackdrop}
      backgroundStyle={styles.sheet}
      handleIndicatorStyle={styles.handleIndicator}
    >
      <BottomSheetView style={styles.header}>
        <Text style={styles.title}>4D Settings</Text>
        <View style={styles.headerActions}>
          <Pressable style={styles.resetButton} onPress={onReset}>
            <Text style={styles.resetButtonText}>Reset</Text>
          </Pressable>
          <Pressable style={styles.closeButton} onPress={() => modalRef.current?.dismiss()}>
            <Ionicons name="close" size={20} color="#f5f7ff" />
          </Pressable>
        </View>
      </BottomSheetView>
      <BottomSheetScrollView
        style={styles.content}
        contentContainerStyle={styles.contentInner}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.captureSection}>
          <Text style={styles.sectionTitle}>Exact View</Text>
          <Text style={styles.captureCopy}>
            Save or restore the live 3D view matrix exactly. No angle guessing.
          </Text>
          <View style={styles.captureActions}>
            <Pressable style={styles.captureButton} onPress={onUseCurrentView}>
              <Text style={styles.captureButtonText}>Use Current View</Text>
            </Pressable>
            <Pressable
              style={[styles.captureButton, !hasSavedView && styles.captureButtonDisabled]}
              onPress={onRestoreSavedView}
              disabled={!hasSavedView}
            >
              <Text style={styles.captureButtonText}>Restore Saved</Text>
            </Pressable>
          </View>
          <Pressable
            style={[styles.clearCaptureButton, !hasSavedView && styles.clearCaptureButtonDisabled]}
            onPress={onClearSavedView}
            disabled={!hasSavedView}
          >
            <Text style={styles.clearCaptureButtonText}>
              {hasSavedView ? 'Clear Saved View' : 'No Saved View'}
            </Text>
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
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  title: {
    color: '#f5f7ff',
    fontSize: 18,
    fontWeight: '700',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
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
  closeButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  content: {
    flex: 1,
  },
  contentInner: {
    paddingHorizontal: 18,
    paddingVertical: 16,
    gap: 18,
  },
  captureSection: {
    gap: 10,
    padding: 14,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  captureCopy: {
    color: 'rgba(245,247,255,0.72)',
    fontSize: 12,
    lineHeight: 18,
  },
  captureActions: {
    flexDirection: 'row',
    gap: 10,
  },
  captureButton: {
    flex: 1,
    minHeight: 42,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  captureButtonDisabled: {
    opacity: 0.45,
  },
  captureButtonText: {
    color: '#f5f7ff',
    fontSize: 13,
    fontWeight: '700',
  },
  clearCaptureButton: {
    minHeight: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  clearCaptureButtonDisabled: {
    opacity: 0.45,
  },
  clearCaptureButtonText: {
    color: 'rgba(245,247,255,0.8)',
    fontSize: 12,
    fontWeight: '600',
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
