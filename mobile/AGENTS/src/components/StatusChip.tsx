import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { View } from 'react-native';
import { colors, radius } from '../theme';
import type { OrderStatus } from '../types';
import { AppText } from './AppText';

const MAP: Record<OrderStatus, { label: string; bg: string; fg: string; icon: keyof typeof Ionicons.glyphMap }> = {
  placed: { label: 'Placed', bg: colors.accentSoft, fg: colors.warningText, icon: 'receipt-outline' },
  confirmed: { label: 'Confirmed', bg: colors.infoSoft, fg: colors.info, icon: 'checkmark-circle-outline' },
  preparing: { label: 'Preparing', bg: colors.accentSoft, fg: colors.warningText, icon: 'restaurant-outline' },
  packed: { label: 'Packed', bg: colors.secondarySoft, fg: colors.secondary, icon: 'cube-outline' },
  out_for_delivery: { label: 'Out for Delivery', bg: colors.successSoft, fg: colors.success, icon: 'bicycle-outline' },
  delivered: { label: 'Delivered', bg: colors.successSoft, fg: colors.success, icon: 'checkmark-done' },
  cancelled: { label: 'Cancelled', bg: colors.errorSoft, fg: colors.error, icon: 'close-circle-outline' },
};

export function StatusChip({ status }: { status: OrderStatus }) {
  const m = MAP[status];
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: m.bg, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 6 }}>
      <Ionicons name={m.icon} size={16} color={m.fg} />
      <AppText variant="weight" color={m.fg}>{m.label}</AppText>
    </View>
  );
}
