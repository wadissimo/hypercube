import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetScrollView,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import type { CubeTimerSession } from '../utils/cubeTimer';
import { formatCubeTimerElapsed, getCubeTimerElapsedMs } from '../utils/cubeTimer';

interface Props {
  visible: boolean;
  title: string;
  subtitle?: string;
  timer: CubeTimerSession;
  onClose: () => void;
  onClearHistory: () => void;
}

export default function CubeTimerSheet({
  visible,
  title,
  subtitle = 'Record and solve history',
  timer,
  onClose,
  onClearHistory,
}: Props) {
  const modalRef = useRef<BottomSheetModal>(null);
  const snapPoints = useMemo(() => ['54%', '78%'], []);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (visible) {
      modalRef.current?.present();
    } else {
      modalRef.current?.dismiss();
    }
  }, [visible]);

  useEffect(() => {
    if (!visible || timer.status !== 'running') {
      return;
    }

    const intervalId = setInterval(() => {
      setNow(Date.now());
    }, 50);

    return () => clearInterval(intervalId);
  }, [timer.status, visible]);

  useEffect(() => {
    setNow(Date.now());
  }, [timer.elapsedMs, timer.startedAt, timer.status, visible]);

  const renderBackdrop = (props: BottomSheetBackdropProps) => (
    <BottomSheetBackdrop
      {...props}
      disappearsOnIndex={-1}
      appearsOnIndex={0}
      opacity={0.42}
      pressBehavior="close"
    />
  );

  const activeElapsedMs = getCubeTimerElapsedMs(timer, now);

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
      <BottomSheetScrollView
        style={styles.content}
        contentContainerStyle={styles.contentInner}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>
        </View>
        <View style={styles.statsRow}>
          <StatCard
            label="Record"
            value={timer.recordMs == null ? 'No solves yet' : formatCubeTimerElapsed(timer.recordMs)}
          />
          <StatCard
            label="History"
            value={timer.history.length === 0 ? 'Empty' : `${timer.history.length} solves`}
          />
        </View>
        {timer.status !== 'idle' && (
          <View style={styles.activeCard}>
            <Text style={styles.activeLabel}>{timer.status === 'running' ? 'Active timer' : 'Paused timer'}</Text>
            <Text style={styles.activeValue}>{formatCubeTimerElapsed(activeElapsedMs)}</Text>
          </View>
        )}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Recent solves</Text>
          <Pressable
            style={[styles.clearButton, timer.history.length === 0 && styles.clearButtonDisabled]}
            onPress={onClearHistory}
            disabled={timer.history.length === 0}
          >
            <Text style={styles.clearButtonText}>Clear</Text>
          </Pressable>
        </View>
        {timer.history.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>No recorded solves yet</Text>
            <Text style={styles.emptyCopy}>Use Start, Pause, and Stop on the cube overlay to build your history here.</Text>
          </View>
        ) : (
          timer.history.map(entry => (
            <View key={entry.id} style={styles.historyRow}>
              <View style={styles.historyMeta}>
                <Text style={styles.historyTime}>{formatCubeTimerElapsed(entry.elapsedMs)}</Text>
                <Text style={styles.historyDate}>{formatRecordedAt(entry.recordedAt)}</Text>
              </View>
              <Text style={styles.historyScramble} numberOfLines={2}>
                {entry.scrambleText.trim().length > 0 ? entry.scrambleText : 'No scramble saved'}
              </Text>
            </View>
          ))
        )}
      </BottomSheetScrollView>
    </BottomSheetModal>
  );
}

interface StatCardProps {
  label: string;
  value: string;
}

function StatCard({ label, value }: StatCardProps) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

function formatRecordedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const month = date.toLocaleString(undefined, { month: 'short' });
  const day = date.toLocaleString(undefined, { day: 'numeric' });
  const time = date.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
  return `${month} ${day} • ${time}`;
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
  subtitle: {
    color: 'rgba(245,247,255,0.62)',
    fontSize: 12,
    marginTop: 2,
  },
  content: {
    flex: 1,
  },
  contentInner: {
    paddingHorizontal: 18,
    paddingVertical: 16,
    gap: 16,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  statCard: {
    flex: 1,
    gap: 6,
    padding: 14,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  statLabel: {
    color: 'rgba(245,247,255,0.6)',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  statValue: {
    color: '#f5f7ff',
    fontSize: 16,
    fontWeight: '700',
  },
  activeCard: {
    padding: 14,
    borderRadius: 16,
    backgroundColor: 'rgba(73, 184, 128, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(73, 184, 128, 0.32)',
  },
  activeLabel: {
    color: 'rgba(245,247,255,0.68)',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  activeValue: {
    color: '#f5f7ff',
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
    marginTop: 4,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  sectionTitle: {
    color: '#f5f7ff',
    fontSize: 16,
    fontWeight: '700',
  },
  clearButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  clearButtonDisabled: {
    opacity: 0.4,
  },
  clearButtonText: {
    color: '#f5f7ff',
    fontSize: 12,
    fontWeight: '700',
  },
  emptyState: {
    gap: 8,
    padding: 16,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  emptyTitle: {
    color: '#f5f7ff',
    fontSize: 15,
    fontWeight: '700',
  },
  emptyCopy: {
    color: 'rgba(245,247,255,0.7)',
    fontSize: 13,
    lineHeight: 18,
  },
  historyRow: {
    gap: 8,
    padding: 14,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  historyMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  historyTime: {
    color: '#f5f7ff',
    fontSize: 18,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  historyDate: {
    color: 'rgba(245,247,255,0.58)',
    fontSize: 12,
    fontWeight: '600',
  },
  historyScramble: {
    color: 'rgba(245,247,255,0.78)',
    fontSize: 13,
    lineHeight: 18,
  },
});
