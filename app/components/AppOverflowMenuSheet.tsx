import React, { useEffect, useMemo, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetView,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';

export interface OverflowMenuAction {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  disabled?: boolean;
  tone?: 'default' | 'danger';
}

interface Props {
  visible: boolean;
  actions: OverflowMenuAction[];
  onClose: () => void;
}

export default function AppOverflowMenuSheet({
  visible,
  actions,
  onClose,
}: Props) {
  const modalRef = useRef<BottomSheetModal>(null);
  const snapPoints = useMemo(() => ['56%'], []);

  useEffect(() => {
    if (visible) {
      modalRef.current?.present();
    } else {
      modalRef.current?.dismiss();
    }
  }, [visible]);

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
      snapPoints={snapPoints}
      index={0}
      enablePanDownToClose
      enableDynamicSizing={false}
      onDismiss={onClose}
      backdropComponent={renderBackdrop}
      backgroundStyle={styles.sheet}
      handleIndicatorStyle={styles.handleIndicator}
    >
      <BottomSheetView style={styles.content}>
        {actions.map(action => (
          <Pressable
            key={action.key}
            style={({ pressed }) => [
              styles.actionRow,
              action.disabled && styles.actionRowDisabled,
              pressed && !action.disabled && styles.actionRowPressed,
            ]}
            onPress={action.onPress}
            disabled={action.disabled}
          >
            <View style={[
              styles.iconWrap,
              action.tone === 'danger' && styles.iconWrapDanger,
            ]}
            >
              <Ionicons
                name={action.icon}
                size={18}
                color={action.tone === 'danger' ? '#ffb4b4' : '#f5f7ff'}
              />
            </View>
            <Text style={[
              styles.actionLabel,
              action.tone === 'danger' && styles.actionLabelDanger,
            ]}
            >
              {action.label}
            </Text>
          </Pressable>
        ))}
      </BottomSheetView>
    </BottomSheetModal>
  );
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
  content: {
    paddingHorizontal: 18,
    paddingTop: 28,
    paddingBottom: 20,
    gap: 10,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  actionRowPressed: {
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  actionRowDisabled: {
    opacity: 0.42,
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  iconWrapDanger: {
    backgroundColor: 'rgba(255,120,120,0.12)',
  },
  actionLabel: {
    color: '#f5f7ff',
    fontSize: 15,
    fontWeight: '700',
  },
  actionLabelDanger: {
    color: '#ffd0d0',
  },
});
