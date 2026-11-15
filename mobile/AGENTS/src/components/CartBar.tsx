import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { duration, timingConfig } from '../animations/motion';
import { PressableScale } from '../animations/PressableScale';
import { useCartView } from '../hooks/useShopData';
import { colors, layout, radius, shadow, spacing, alpha } from '../theme';
import { rupee } from '../utils/format';
import { AppText } from './AppText';

type Props = {
  onPress: () => void;
  /** Hide the bar on screens where it makes no sense (cart, checkout, orders, account). */
  hidden?: boolean;
  /** True when nothing below the bar handles the bottom safe-area (stack screens). Inside the tab bar this is false. */
  safeBottom?: boolean;
};

/**
 * Sticky cart summary. It is part of the layout flow (not absolutely positioned): it grows from 0 height to its
 * full height above whatever sits below it, so it pushes content up and can never overlap content or the tab bar.
 * Reads the same cart view as the Cart screen, so count and amount always match it.
 */
export function CartBar({ onPress, hidden = false, safeBottom = false }: Props) {
  const { totals } = useCartView();
  const insets = useSafeAreaInsets();
  const reduce = useReducedMotion();

  const count = totals.itemCount;
  const show = count > 0 && !hidden;
  // Keep the last non-empty values so the text does not flash "0 items" while the bar slides away.
  const [shown, setShown] = useState({ count, amount: totals.subtotal });
  if (count > 0 && (shown.count !== count || shown.amount !== totals.subtotal)) setShown({ count, amount: totals.subtotal });

  const full = layout.cartBarHeight + layout.cartBarPad * 2 + (safeBottom ? insets.bottom : 0);
  const p = useSharedValue(show ? 1 : 0);
  useEffect(() => {
    p.value = withTiming(show ? 1 : 0, timingConfig(reduce ? 0 : duration.card));
  }, [show, reduce, p]);

  const wrap = useAnimatedStyle(() => ({ height: p.value * full, opacity: p.value }));
  const slide = useAnimatedStyle(() => ({ transform: [{ translateY: (1 - p.value) * 24 }] }));

  const noun = shown.count === 1 ? 'item' : 'items';

  return (
    <Animated.View style={[styles.wrap, wrap]} pointerEvents={show ? 'auto' : 'none'} accessibilityElementsHidden={!show} importantForAccessibility={show ? 'auto' : 'no-hide-descendants'}>
      <Animated.View style={[styles.inner, { height: full, paddingBottom: safeBottom ? insets.bottom : 0 }, slide]}>
        <PressableScale
          onPress={onPress}
          scaleTo={0.99}
          accessibilityLabel={`View cart, ${shown.count} ${noun}, ${rupee(shown.amount)}`}
          style={styles.bar}
        >
          <View style={styles.iconWrap}>
            <Ionicons name="bag-handle" size={20} color={colors.primary} />
          </View>
          <View style={styles.summary}>
            <AppText variant="caption" color={alpha.white(0.8)}>{shown.count} {noun} · subtotal</AppText>
            <AppText variant="productPrice" color={colors.white}>{rupee(shown.amount)}</AppText>
          </View>
          <View style={styles.cta}>
            <AppText variant="buttonSm" color={colors.onAccent}>View Cart</AppText>
            <Ionicons name="arrow-forward" size={16} color={colors.onAccent} />
          </View>
        </PressableScale>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { overflow: 'hidden', backgroundColor: colors.background },
  inner: { position: 'absolute', left: 0, right: 0, bottom: 0, justifyContent: 'center', paddingHorizontal: layout.gutter },
  bar: {
    alignSelf: 'center', width: '100%', maxWidth: layout.maxContentWidth, height: layout.cartBarHeight,
    flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingLeft: spacing.md, paddingRight: spacing.sm,
    borderRadius: radius.lg, backgroundColor: colors.primary, ...shadow.card,
  },
  iconWrap: { width: 36, height: 36, borderRadius: radius.pill, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  summary: { flex: 1 },
  cta: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, height: 36, paddingHorizontal: spacing.lg, borderRadius: radius.pill, backgroundColor: colors.accent },
});
