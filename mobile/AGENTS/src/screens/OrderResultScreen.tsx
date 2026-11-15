import { CommonActions, useNavigation } from '@react-navigation/native';
import React, { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Reveal } from '../animations/Reveal';
import { AppText } from '../components/AppText';
import { DemoTag } from '../components/Atoms';
import { BrandHeader, Sheet } from '../components/BrandHeader';
import { Button } from '../components/Button';
import { OrderUpdatesCard } from '../components/PermissionRows';
import { CheckoutSteps } from '../components/CheckoutSteps';
import { SuccessCheck } from '../components/SuccessCheck';
import type { RootScreenProps } from '../navigation/types';
import { api } from '../services/api';
import { useShop } from '../store/useShop';
import { toast } from '../store/useToast';
import { colors, fonts, radius, spacing } from '../theme';
import type { PaymentStatus } from '../types';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { slotLabel } from '../services/deliveryDates';
import { formatDateTime, rupee } from '../utils/format';

const METHOD: Record<string, string> = { upi: 'UPI', card: 'Card', wallet: 'Wallet', netbanking: 'Net Banking', cod: 'Cash on Delivery' };
const STATUS_LABEL: Record<PaymentStatus, string> = {
  paid: 'Paid', pending: 'Pending', processing: 'Processing', failed: 'Failed', cancelled: 'Cancelled', refunded: 'Refunded', cod_due: 'Pay on delivery',
};

export function OrderResultScreen({ route }: RootScreenProps<'OrderResult'>) {
  const nav = useNavigation();
  const insets = useSafeAreaInsets();
  const { outcome, orderId, message } = route.params;
  const order = useShop((s) => s.orders.find((o) => o.id === orderId));
  const setOrderPayment = useShop((s) => s.setOrderPayment);
  const cancelOrder = useShop((s) => s.cancelOrder);
  const [busy, setBusy] = useState<'check' | 'cancel' | null>(null);

  const payStatus = order?.payment.status;
  const real = !!order && !order.payment.simulated; // a real provider payment, not the demo simulator
  let effective: typeof outcome = outcome;
  if (outcome === 'pending' && payStatus === 'paid') effective = 'success';
  if (outcome === 'requires_payment') {
    effective = payStatus === 'paid' ? 'success' : payStatus === 'cancelled' || payStatus === 'failed' ? 'failure' : 'requires_payment';
  }
  const tone = effective === 'success' ? 'success' : effective === 'pending' || effective === 'requires_payment' ? 'pending' : 'error';

  const title =
    effective === 'success' ? 'Order Placed!' : effective === 'requires_payment' ? 'Complete your payment' : effective === 'pending' ? 'Payment Pending' : payStatus === 'cancelled' ? 'Payment Cancelled' : 'Payment Failed';
  const body =
    effective === 'success'
      ? 'Thank you! Your order is confirmed. You can follow its progress on the tracking screen.'
      : effective === 'requires_payment'
        ? 'Your order is reserved until payment is completed. It is not confirmed yet. Online checkout needs the payment SDK, which is not included in this build, so you can check the status or cancel here.'
        : effective === 'pending'
          ? 'We have not received confirmation from the payment provider yet. Your order is not confirmed until payment is verified.'
          : message ?? 'The payment did not go through. No money was charged. You can safely retry.';

  /** Demo mode: simulated reconciliation. Live mode: ask the server for the verified payment state (never trust the client). */
  const check = async () => {
    if (!order) return;
    setBusy('check');
    try {
      if (real && api.account) {
        const r = await api.account.paymentStatus(order.id);
        setOrderPayment(order.id, r.status as PaymentStatus);
        toast(r.status === 'paid' ? 'Payment verified' : `Payment status: ${STATUS_LABEL[r.status as PaymentStatus] ?? r.status}`, r.status === 'paid' ? 'success' : 'info');
      } else {
        const r = await api.reconcilePayment(order.id);
        if (r.status === 'paid') {
          setOrderPayment(order.id, 'paid');
          toast('Payment verified (simulated)', 'success');
        }
      }
    } catch (e) {
      toast((e as Error).message || 'Could not check the payment right now', 'error');
    } finally {
      setBusy(null);
    }
  };

  const cancelPayment = async () => {
    if (!order || !api.account) return;
    setBusy('cancel');
    try {
      const r = await api.account.cancelPayment(order.id);
      setOrderPayment(order.id, (r.status as PaymentStatus) ?? 'cancelled');
      cancelOrder(order.id);
      toast(r.cancelled ? 'Payment cancelled. Nothing was charged.' : 'This payment can no longer be cancelled', r.cancelled ? 'success' : 'info');
    } catch (e) {
      toast((e as Error).message || 'Could not cancel right now', 'error');
    } finally {
      setBusy(null);
    }
  };

  const goHome = () => nav.dispatch(CommonActions.reset({ index: 0, routes: [{ name: 'Main' }] }));
  const track = () => order && nav.dispatch(CommonActions.reset({ index: 1, routes: [{ name: 'Main' }, { name: 'OrderTracking', params: { orderId: order.id } }] }));

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <BrandHeader left="none" title="Checkout">
        <CheckoutSteps step={3} allDone={effective === 'success'} />
      </BrandHeader>
      <Sheet>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + spacing.xxl, alignItems: 'center', gap: spacing.lg }}>
          <View style={{ marginTop: spacing.lg }}><SuccessCheck tone={tone} /></View>
          <Reveal index={1} style={{ alignItems: 'center' }}>
            <AppText variant="resultTitle" color={colors.primary} align="center" accessibilityRole="header" accessibilityLiveRegion="polite">{title}</AppText>
            <AppText variant="bodyLg" color={colors.textMuted} align="center" style={{ marginTop: 6, maxWidth: 320 }}>{body}</AppText>
          </Reveal>

          {order && effective !== 'failure' && (
            <Reveal index={2} style={{ alignSelf: 'stretch' }}>
              <View style={styles.card}>
                <Line label="Order number" value={`#${order.number}`} bold />
                <Line label="Placed" value={formatDateTime(order.createdAt)} />
                <Line label="Items" value={`${order.totals.itemCount}`} />
                <Line label="Amount" value={rupee(order.totals.total)} bold />
                <Line label="Payment" value={`${METHOD[order.payment.method]} · ${STATUS_LABEL[order.payment.status]}`} />
                <Line label="Reference" value={order.payment.reference} />
                <Line label="Deliver to" value={`${order.address.area}, ${order.address.city} - ${order.address.pincode}`} />
                <Line label="Delivery" value={slotLabel(order.slot)} />
                {order.payment.simulated ? (
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 4, alignItems: 'center' }}>
                    <DemoTag label="SIMULATED" /><AppText variant="caption" color={colors.textMuted}>Demo order and payment — no real charge.</AppText>
                  </View>
                ) : (
                  <AppText variant="caption" color={colors.textMuted}>
                    {order.payment.method === 'cod'
                      ? 'Pay in cash when your order arrives.'
                      : `Payment handled by ${order.payment.provider ?? 'the payment provider'}. Status is confirmed by our server, not by this app.`}
                  </AppText>
                )}
              </View>
            </Reveal>
          )}

          {effective === 'success' && !!order && <OrderUpdatesCard />}

          <View style={{ alignSelf: 'stretch', gap: 10 }}>
            {effective === 'success' && order && <Button title="Track Order" icon="navigate-outline" onPress={track} />}
            {effective === 'requires_payment' && order && (
              <>
                <Button title="Check payment status" icon="refresh" loading={busy === 'check'} disabled={busy === 'cancel'} onPress={check} />
                <Button title="Cancel payment" variant="outline" loading={busy === 'cancel'} disabled={busy === 'check'} onPress={cancelPayment} />
              </>
            )}
            {effective === 'pending' && order && (
              <>
                <Button title="Check payment status" icon="refresh" loading={busy === 'check'} onPress={check} />
                <Button title="Track Order" variant="outline" onPress={track} />
              </>
            )}
            {effective === 'failure' && (
              <>
                <Button title="Retry Payment" icon="refresh" onPress={() => nav.goBack()} />
                <Button title="Back to Cart" variant="outline" onPress={() => nav.dispatch(CommonActions.reset({ index: 1, routes: [{ name: 'Main' }, { name: 'Cart' }] }))} />
              </>
            )}
            <Button title="Continue Shopping" variant={effective === 'success' ? 'outline' : 'ghost'} onPress={goHome} />
          </View>
        </ScrollView>
      </Sheet>
    </View>
  );
}

function Line({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
      <AppText variant="body" color={colors.textMuted} style={{ flexShrink: 0 }}>{label}</AppText>
      <AppText variant="bodyMedium" style={{ fontFamily: bold ? fonts.bold : fonts.medium, flexShrink: 1, flexBasis: 0, flexGrow: 1, textAlign: 'right' }}>{value}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: 16, gap: 10, borderWidth: 1, borderColor: colors.border },
});
