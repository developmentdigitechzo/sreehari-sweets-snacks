import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { View } from 'react-native';
import { API_MODE } from '../services/api';
import { useCatalog } from '../store/useCatalog';
import { colors, radius, spacing } from '../theme';
import { AppText } from './AppText';
import { PressableScale } from '../animations/PressableScale';

/** Shown when the app cannot reach the store (internet off or server down) while older data is still on screen. */
export function OfflineBanner() {
  const problem = useCatalog((s) => s.refreshError);
  if (API_MODE !== 'live' || !problem) return null;
  return (
    <View accessibilityRole="alert" style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginHorizontal: spacing.md, marginTop: spacing.sm, padding: spacing.sm + 2, borderRadius: radius.md, backgroundColor: colors.errorSoft }}>
      <Ionicons name="cloud-offline-outline" size={22} color={colors.error} />
      <AppText variant="caption" color={colors.text} style={{ flex: 1 }}>You are offline or the store cannot be reached. You are seeing the last saved menu, and orders cannot be placed.</AppText>
      <PressableScale onPress={() => void useCatalog.getState().load({ silent: true })} accessibilityLabel="Retry connecting" style={{ paddingHorizontal: spacing.md, minHeight: 36, justifyContent: 'center' }}>
        <AppText variant="buttonSm" color={colors.primary}>Retry</AppText>
      </PressableScale>
    </View>
  );
}
