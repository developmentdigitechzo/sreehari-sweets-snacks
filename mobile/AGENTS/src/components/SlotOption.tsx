import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { PressableScale } from '../animations/PressableScale';
import { colors, control, radius, spacing } from '../theme';
import type { DeliverySlot } from '../types';
import { rupee } from '../utils/format';
import { AppText } from './AppText';

export const SLOT_OPTION_HEIGHT = 68;

/**
 * One delivery slot as a full-width row: radio, name + time, fee. Rows stack, so every slot has the same height and the same
 * columns whatever the screen width or the length of the time text (three side-by-side cards wrapped and misaligned on phones).
 */
export function SlotOption({ slot, selected, unavailableReason, onPress }: { slot: DeliverySlot; selected: boolean; unavailableReason?: string; onPress: () => void }) {
  const off = !!unavailableReason;
  return (
    <PressableScale
      onPress={onPress}
      disabled={off}
      scaleTo={0.99}
      accessibilityRole="radio"
      accessibilityState={{ selected, disabled: off }}
      accessibilityLabel={`${slot.title} ${slot.window}, ${slot.fee ? rupee(slot.fee) : 'free'}${off ? `. ${unavailableReason}` : ''}`}
      style={[styles.row, selected && styles.rowOn, off && { opacity: 0.55 }]}
    >
      <Ionicons name={selected ? 'radio-button-on' : 'radio-button-off'} size={24} color={selected ? colors.primary : colors.textMuted} />
      <View style={styles.icon}>
        <Ionicons name={slot.kind === 'express' ? 'flash-outline' : 'calendar-outline'} size={22} color={colors.primary} />
      </View>
      <View style={styles.text}>
        <AppText variant="h2" numberOfLines={1}>{slot.title}</AppText>
        <AppText variant="caption" color={off ? colors.error : colors.textMuted} numberOfLines={1}>{off ? unavailableReason : slot.window}</AppText>
      </View>
      <AppText variant="bodyMedium" weight="bold" color={slot.fee ? colors.primary : colors.success}>{slot.fee ? rupee(slot.fee) : 'Free'}</AppText>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  row: { height: SLOT_OPTION_HEIGHT, flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.md, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.border },
  rowOn: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  icon: { width: control.stepper, height: control.stepper, borderRadius: radius.md, backgroundColor: colors.backgroundAlt, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, minWidth: 0 },
});
