import { softIn } from '../animations/motion';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { colors, spacing } from '../theme';
import { AppText } from './AppText';
import { Button } from './Button';

type Props = {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
};

export function EmptyState({ icon = 'basket-outline', title, message, actionLabel, onAction, secondaryLabel, onSecondary }: Props) {
  return (
    <Animated.View entering={FadeIn.duration(350)} style={styles.wrap}>
      <Animated.View entering={softIn.delay(80)} style={styles.iconWrap}>
        <Ionicons name={icon} size={44} color={colors.primary} />
      </Animated.View>
      <AppText variant="h1" align="center" style={{ marginTop: spacing.lg }}>{title}</AppText>
      {!!message && <AppText variant="body" color={colors.textMuted} align="center" style={{ marginTop: 6, maxWidth: 300 }}>{message}</AppText>}
      <View style={{ marginTop: spacing.xl, gap: 10, alignSelf: 'stretch', paddingHorizontal: spacing.xl }}>
        {!!actionLabel && <Button title={actionLabel} onPress={onAction} />}
        {!!secondaryLabel && <Button title={secondaryLabel} onPress={onSecondary} variant="outline" />}
      </View>
    </Animated.View>
  );
}

export function ErrorState({ message, onRetry }: { message?: string; onRetry: () => void }) {
  return (
    <EmptyState
      icon="cloud-offline-outline"
      title="Something went wrong"
      message={message ?? 'We could not load this right now. Please check your connection and try again.'}
      actionLabel="Try again"
      onAction={onRetry}
    />
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.huge * 1.5, paddingHorizontal: spacing.lg },
  iconWrap: { width: 96, height: 96, borderRadius: 48, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
});
