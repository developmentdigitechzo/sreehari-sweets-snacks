import { softIn } from '../animations/motion';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import React, { useRef, useState } from 'react';
import { ActivityIndicator, Modal, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PressableScale } from '../animations/PressableScale';
import { Reveal } from '../animations/Reveal';
import { AppText } from '../components/AppText';
import { DemoTag } from '../components/Atoms';
import { BrandHeader, Sheet } from '../components/BrandHeader';
import { Button } from '../components/Button';
import { CheckoutSteps } from '../components/CheckoutSteps';
import { ProductImage } from '../components/ProductImage';
import { Amount } from '../components/Summary';
import { PAYMENT_METHODS } from '../data/config';
import { useCartCount, useCartView } from '../hooks/useShopData';
import { useStickyBar } from '../hooks/useStickyBar';
import { API_MODE, api, SimulatedOutcome } from '../services/api';
import { useCatalog } from '../store/useCatalog';
import { toast } from '../store/useToast';
import { useCapabilities } from '../store/useCapabilities';
import { refreshRewards } from '../services/accountSync';
import { slotLabel } from '../services/deliveryDates';
import { useShop } from '../store/useShop';
import { colors, radius, shadow, spacing, type as t } from '../theme';
import type { PaymentMethod } from '../types';
import { rupee, uid } from '../utils/format';

const ICONS: Record<string, keyof typeof Ionicons.glyphMap> = { upi: 'phone-portrait-outline', card: 'card-outline', wallet: 'wallet-outline', netbanking: 'business-outline', cod: 'cash-outline' };
const OUTCOMES: { id: SimulatedOutcome; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { id: 'success', label: 'Success', icon: 'checkmark-circle' }, { id: 'pending', label: 'Pending', icon: 'time' }, { id: 'failure', label: 'Failure', icon: 'close-circle' },
];

export function PaymentScreen() {
  const nav = useNavigation();
  const insets = useSafeAreaInsets();
  const sticky = useStickyBar();
  const { lines, totals, coupon, slot, deliveryDate } = useCartView();
  const count = useCartCount();
  const address = useShop((s) => s.addresses.find((a) => a.id === s.selectedAddressId));
  const addOrder = useShop((s) => s.addOrder);
  const rewardsOn = useShop((s) => s.redeemPoints);
  const onlinePayments = useCapabilities((s) => s.caps.payments) !== 'none';
  // A live store with no payment gateway can only take Cash on Delivery: nothing may be shown as paid that was never paid.
  const codOnly = API_MODE === 'live' && !onlinePayments;

  const [method, setMethod] = useState<PaymentMethod>(codOnly ? 'cod' : 'upi');
  const [outcome, setOutcome] = useState<SimulatedOutcome>('success');
  const [busy, setBusy] = useState(false);
  const [showItems, setShowItems] = useState(false);
  // One key per checkout attempt: repeated taps / retries can never create two orders.
  const key = useRef(uid('chk'));
  const lock = useRef(false);

  const pay = async () => {
    if (lock.current || !address || lines.length === 0) return;
    lock.current = true;
    setBusy(true);
    try {
      const res = await api.placeOrder({
        idempotencyKey: key.current,
        items: lines.map((l) => ({ productId: l.product.id, variantId: l.variant.id, qty: l.qty, options: l.options })),
        couponCode: coupon?.code ?? null,
        slotId: slot.id,
        deliveryDate,
        address,
        paymentMethod: method,
        simulatedOutcome: outcome,
        redeemPoints: totals.rewardDiscount,
      });
      if (res.outcome === 'failure') {
        nav.navigate('OrderResult', { outcome: 'failure', message: res.message });
      } else {
        addOrder(res.order);
        // Live backend: the server recorded points for this order; read them back (and any status the store has already set).
        refreshRewards().catch(() => {});
        key.current = uid('chk');
        nav.navigate('OrderResult', { outcome: res.outcome, orderId: res.order.id });
        // The order changed stock on the server: show the new stock, not the old copy.
        void useCatalog.getState().load({ silent: true });
      }
    } catch (e) {
      toast((e as Error).message || 'Could not place the order. Check your connection and try again.', 'error');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };

  const cod = method === 'cod';

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <BrandHeader title="Checkout">
        <CheckoutSteps step={2} />
      </BrandHeader>
      <Sheet>
        <ScrollView testID="screen-scroll" showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: spacing.lg, paddingBottom: sticky.clearance, gap: spacing.lg }}>
          <View style={styles.summary}>
            <ProductImage image={lines[0]?.product.images[0]} style={{ width: 84, height: 72, borderRadius: radius.md }} />
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
              <AppText variant="sectionTitle">Order Summary</AppText>
              <AppText variant="body" color={colors.textMuted}>{count} {count === 1 ? 'item' : 'items'} · To {address?.area}, {address?.city}</AppText>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6 }}>
                <Ionicons name="bicycle" size={18} color={colors.primary} style={{ marginTop: 1 }} />
                <AppText variant="bodyMedium" color={colors.success} style={{ flex: 1 }}>{slot.kind === 'express' ? `Delivery in ${slot.window}` : slotLabel({ ...slot, date: deliveryDate })}</AppText>
              </View>
              <PressableScale onPress={() => setShowItems((s) => !s)} accessibilityLabel="Toggle items" style={styles.viewItems}>
                <AppText variant="link" color={colors.primary}>{showItems ? 'Hide items' : 'View items'}</AppText>
                <Ionicons name={showItems ? 'chevron-up' : 'chevron-down'} size={16} color={colors.primary} />
              </PressableScale>
            </View>
          </View>
          {showItems && (
            <Animated.View entering={FadeIn} style={styles.items}>
              {lines.map((l) => <AppText key={l.variant.id} variant="body">{l.product.name} · {l.variant.label} × {l.qty} — {rupee(l.linePrice)}</AppText>)}
            </Animated.View>
          )}

          <View style={styles.total}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md }}>
              <AppText variant="sectionTitle" color={colors.primary} style={{ flexShrink: 1 }}>Total Payable</AppText>
              <Amount value={totals.total} style={{ ...t.amountMd, color: colors.primary }} />
            </View>
            {totals.savings > 0 && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                <Ionicons name="checkmark-circle" size={18} color={colors.success} />
                <AppText variant="bodyMedium" color={colors.success}>You Save {rupee(totals.savings)} on this order!</AppText>
              </View>
            )}
            {rewardsOn && totals.rewardDiscount > 0 && <AppText variant="caption" color={colors.textMuted} style={{ marginTop: 2 }}>Includes reward points of {rupee(totals.rewardDiscount)}.</AppText>}
          </View>

          <View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <Ionicons name="card-outline" size={28} color={colors.primary} />
              <AppText variant="sectionTitle">Choose Payment Method</AppText>
            </View>
            <View style={{ gap: 8 }}>
              {PAYMENT_METHODS.filter((m) => !codOnly || m.id === 'cod').map((m, i) => {
                const on = m.id === method;
                return (
                  <Reveal key={m.id} index={i} step={50}>
                    <PressableScale onPress={() => setMethod(m.id)} haptic accessibilityState={{ selected: on }} accessibilityLabel={`${m.title}. ${m.subtitle}`} style={[styles.method, on && styles.methodOn]}>
                      <Ionicons name={on ? 'radio-button-on' : 'radio-button-off'} size={24} color={on ? colors.primary : colors.textMuted} />
                      <View style={styles.mIcon}><Ionicons name={ICONS[m.id]} size={26} color={colors.primary} /></View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', columnGap: 8 }}>
                          <AppText variant="h2">{m.title}</AppText>
                          {'recommended' in m && m.recommended && <View style={styles.reco}><AppText variant="badge" color={colors.white}>Recommended</AppText></View>}
                        </View>
                        <AppText variant="caption" color={colors.textMuted}>{m.subtitle}</AppText>
                      </View>
                    </PressableScale>
                  </Reveal>
                );
              })}
            </View>
          </View>

          {codOnly && (
            <View style={styles.sim}>
              <AppText variant="cardTitle">Online payment is not available yet</AppText>
              <AppText variant="caption" color={colors.textMuted} style={{ marginTop: 4 }}>The store has not connected a payment gateway, so you can pay with Cash on Delivery.</AppText>
            </View>
          )}
          {!onlinePayments && !codOnly && (
          <View style={styles.sim}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons name="flask-outline" size={20} color={colors.text} />
              <AppText variant="cardTitle">Payment simulator</AppText>
              <DemoTag label="SIMULATION" />
            </View>
            <AppText variant="caption" color={colors.textMuted} style={{ marginTop: 4 }}>No real gateway is connected and no money moves. Pick the result you want to demonstrate.</AppText>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
              {OUTCOMES.map((o) => {
                const on = outcome === o.id;
                return (
                  <PressableScale key={o.id} onPress={() => setOutcome(o.id)} accessibilityState={{ selected: on }} style={[styles.seg, on && { backgroundColor: colors.primary, borderColor: colors.primary }]}>
                    <Ionicons name={o.icon} size={18} color={on ? colors.white : colors.primary} />
                    <AppText variant="weight" color={on ? colors.white : colors.text}>{o.label}</AppText>
                  </PressableScale>
                );
              })}
            </View>
            {cod && <AppText variant="caption" color={colors.textMuted} style={{ marginTop: 8 }}>Cash on Delivery is not charged online, so the simulated result is ignored.</AppText>}
          </View>
          )}

          <View style={styles.trust}>
            {[
              { icon: 'shield-checkmark-outline', text: API_MODE === 'mock' ? 'Demo payment only' : 'Secure checkout' },
              { icon: 'lock-closed-outline', text: 'No card details stored' },
              { icon: 'repeat-outline', text: 'Retry-safe checkout' },
            ].map((t, i) => (
              <View key={t.text} style={[styles.trustItem, i > 0 && { borderLeftWidth: 1, borderLeftColor: colors.border }]}>
                <Ionicons name={t.icon as keyof typeof Ionicons.glyphMap} size={28} color={colors.primary} />
                <AppText variant="caption" align="center" style={{ marginTop: 4 }}>{t.text}</AppText>
              </View>
            ))}
          </View>
        </ScrollView>

        <View testID="sticky-bar" onLayout={sticky.onLayout} style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <Button
            title={cod ? 'Place Order (Pay on Delivery)' : `Pay ${rupee(totals.total)} Now`}
            icon={cod ? 'checkmark-circle-outline' : 'lock-closed'}
            loading={busy}
            disabled={lines.length === 0 || !address}
            onPress={pay}
          />
        </View>
      </Sheet>

      <Modal transparent visible={busy} animationType="fade" statusBarTranslucent>
        <View style={styles.overlay}>
          <Animated.View entering={softIn} style={styles.processing}>
            <ActivityIndicator size="large" color={colors.primary} />
            <AppText variant="h2" style={{ marginTop: 14 }}>Processing simulated payment…</AppText>
            <AppText variant="caption" color={colors.textMuted} align="center" style={{ marginTop: 4 }}>Please don’t close the app. No real money is charged.</AppText>
          </Animated.View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  summary: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  viewItems: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 2, minHeight: 36 },
  items: { backgroundColor: colors.surface, borderRadius: radius.md, padding: 12, gap: 6, borderWidth: 1, borderColor: colors.border },
  total: { backgroundColor: colors.backgroundAlt, borderRadius: radius.md, padding: 16 },
  method: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 68, paddingHorizontal: 14, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.border },
  methodOn: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  mIcon: { width: 44, alignItems: 'center' },
  reco: { backgroundColor: colors.error, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 },
  sim: { backgroundColor: colors.accentSoft, borderRadius: radius.md, padding: 14 },
  seg: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 44, borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.border },
  trust: { flexDirection: 'row', backgroundColor: colors.surface, borderRadius: radius.md, paddingVertical: 14, ...shadow.card },
  trustItem: { flex: 1, alignItems: 'center', paddingHorizontal: 6 },
  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: spacing.lg, paddingTop: 12, backgroundColor: colors.background, borderTopWidth: 1, borderTopColor: colors.border },
  overlay: { flex: 1, backgroundColor: colors.overlay, alignItems: 'center', justifyContent: 'center', padding: 24 },
  processing: { backgroundColor: colors.background, borderRadius: radius.lg, padding: 28, alignItems: 'center', maxWidth: 320, ...shadow.lift },
});
