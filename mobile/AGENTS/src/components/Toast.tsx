import { riseIn } from '../animations/motion';
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCartCount } from '../hooks/useShopData';
import { useToast } from '../store/useToast';
import { colors, layout, radius, shadow } from '../theme';
import { AppText } from './AppText';

/** Mounted once at the root. Non-blocking feedback for add-to-cart, coupons, etc. */
export function ToastHost() {
  const { message, tone, seq, hide } = useToast();
  const insets = useSafeAreaInsets();
  const cartBar = useCartCount() > 0 ? layout.cartBarHeight + layout.cartBarPad * 2 : 0; // keep clear of the sticky cart bar

  useEffect(() => {
    if (!message) return;
    const t = setTimeout(hide, 2200);
    return () => clearTimeout(t);
  }, [seq, message, hide]);

  if (!message) return null;
  const icon = tone === 'success' ? 'checkmark-circle' : tone === 'error' ? 'alert-circle' : 'information-circle';
  const tint = tone === 'success' ? colors.successSoft : tone === 'error' ? colors.errorSoft : colors.accent;
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { justifyContent: 'flex-end', alignItems: 'center', paddingBottom: insets.bottom + 96 + cartBar }]}>
      <Animated.View key={seq} entering={riseIn} exiting={FadeOutDown.duration(180)} style={styles.toast} accessibilityLiveRegion="polite">
        <Ionicons name={icon} size={20} color={tint} />
        <AppText variant="bodyMedium" color={colors.white} style={{ flexShrink: 1 }}>{message}</AppText>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  toast: {
    flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.ink, paddingHorizontal: 16, paddingVertical: 12,
    borderRadius: radius.pill, maxWidth: '88%', ...shadow.lift,
  },
});
