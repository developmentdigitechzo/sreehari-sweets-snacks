import { softIn } from '../animations/motion';
import React from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { colors, radius, shadow, spacing } from '../theme';
import { AppText } from './AppText';
import { Button } from './Button';

type Props = {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDialog({ visible, title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', onConfirm, onCancel }: Props) {
  if (!visible) return null;
  return (
    <Modal transparent visible animationType="none" statusBarTranslucent onRequestClose={onCancel}>
      <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(140)} style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onCancel} accessibilityLabel="Dismiss" />
        <Animated.View entering={softIn} style={styles.card} accessibilityViewIsModal>
          <AppText variant="h1" align="center">{title}</AppText>
          <AppText variant="body" color={colors.textMuted} align="center" style={{ marginTop: 8 }}>{message}</AppText>
          <View style={{ flexDirection: 'row', gap: 10, marginTop: spacing.xl }}>
            <Button title={cancelLabel} variant="outline" onPress={onCancel} style={{ flex: 1 }} size="sm" />
            <Button title={confirmLabel} onPress={onConfirm} style={{ flex: 1 }} size="sm" />
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.overlay, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  card: { width: '100%', maxWidth: 360, backgroundColor: colors.background, borderRadius: radius.lg, padding: spacing.xl, ...shadow.lift },
});
