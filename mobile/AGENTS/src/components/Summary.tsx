import { API_MODE } from '../services/api';
import { getRules } from '../services/rules';
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { PressableScale } from '../animations/PressableScale';
import { colors, radius, spacing, type as t } from '../theme';
import type { Totals } from '../types';
import { rupee } from '../utils/format';
import { AppText } from './AppText';
import { toast } from '../store/useToast';

/** Smoothly tweens a number to its new value (works the same on web, iOS, Android). */
export function useCountUp(value: number, duration = 420) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const start = Date.now();
    const a = from.current;
    let raf: ReturnType<typeof requestAnimationFrame>;
    const tick = () => {
      const t = Math.min(1, (Date.now() - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const v = a + (value - a) * eased;
      setShown(v);
      if (t < 1) raf = requestAnimationFrame(tick);
      else from.current = value;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  return Math.round(shown);
}

export function Amount({ value, negative, style, color }: { value: number; negative?: boolean; style?: object; color?: string }) {
  const n = useCountUp(value);
  return (
    <AppText style={[t.amountSm, { color: color ?? colors.text }, style]}>
      {negative && n > 0 ? '– ' : ''}{rupee(n)}
    </AppText>
  );
}

type Props = { totals: Totals; couponCode?: string | null; title?: string; totalLabel?: string; showSaving?: boolean };

/** The full price breakdown required before payment (BRD 05/06): every charge is itemised. */
export function PriceSummary({ totals, couponCode, title = 'Order Summary', totalLabel = 'Total Amount', showSaving = true }: Props) {
  return (
    <View style={styles.card}>
      {!!title && <AppText variant="sectionTitle" color={colors.primary} style={{ padding: spacing.lg, paddingBottom: 6 }}>{title}</AppText>}
      <View style={{ paddingHorizontal: spacing.lg, gap: 12, paddingBottom: spacing.md }}>
        <Row label={`Item Total (${totals.itemCount} ${totals.itemCount === 1 ? 'Item' : 'Items'}, MRP)`} value={<Amount value={totals.mrpTotal} />} />
        {totals.itemDiscount > 0 && <Row label="Item Discount" green value={<Amount value={totals.itemDiscount} negative color={colors.success} />} />}
        {totals.couponDiscount > 0 && <Row label={`Coupon Discount (${couponCode})`} green value={<Amount value={totals.couponDiscount} negative color={colors.success} />} />}
        {totals.rewardDiscount > 0 && <Row label={API_MODE === 'mock' ? 'Rewards points (demo)' : 'Rewards points'} green value={<Amount value={totals.rewardDiscount} negative color={colors.success} />} />}
        <Row
          label="Delivery Fee"
          info={() => toast(API_MODE === 'mock' ? 'Demo delivery fee. Free above ₹1,499 or with FREESHIP. Final fees are set by the business.' : `Delivery is free above ${rupee(getRules().freeDeliveryThreshold)} or with a free-delivery coupon.`, 'info')}
          value={totals.deliveryFee === 0 && totals.itemCount > 0 ? <AppText style={[t.amountSm, { color: colors.success }]}>Free</AppText> : <Amount value={totals.deliveryFee} />}
        />
      </View>
      <View style={styles.totalBox}>
        <View style={styles.totalRow}>
          <AppText variant="sectionTitle" color={colors.primary} style={{ flexShrink: 1 }}>{totalLabel}</AppText>
          <Amount value={totals.total} style={{ ...t.amountLg, color: colors.primary }} />
        </View>
        {showSaving && totals.savings > 0 && (
          <Animated.View entering={FadeIn} exiting={FadeOut} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
            <Ionicons name="checkmark-circle" size={18} color={colors.success} />
            <AppText variant="bodyMedium" color={colors.success}>You Save {rupee(totals.savings)} on this order!</AppText>
          </Animated.View>
        )}
      </View>
    </View>
  );
}

function Row({ label, value, green, info }: { label: string; value: React.ReactNode; green?: boolean; info?: () => void }) {
  return (
    <View style={styles.row}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
        <AppText variant="bodyLg" color={green ? colors.success : colors.text}>{label}</AppText>
        {info && (
          <PressableScale onPress={info} accessibilityLabel="About delivery fee" style={{ padding: 4 }}>
            <Ionicons name="information-circle-outline" size={18} color={colors.textMuted} />
          </PressableScale>
        )}
      </View>
      {value}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, overflow: 'hidden', borderWidth: 1, borderColor: colors.border },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  totalBox: { backgroundColor: colors.backgroundAlt, padding: spacing.lg, paddingVertical: 14 },
  totalRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
});
