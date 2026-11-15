import { duration, timingConfig } from '../animations/motion';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useState } from 'react';
import { AppState, Linking, RefreshControl, ScrollView, StyleSheet, Switch, View, useWindowDimensions } from 'react-native';
import Animated, { Easing, FadeIn, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import { PressableScale } from '../animations/PressableScale';
import { Reveal } from '../animations/Reveal';
import { AppText } from '../components/AppText';
import { DemoTag } from '../components/Atoms';
import { BottomSheet } from '../components/BottomSheet';
import { BrandHeader, Sheet } from '../components/BrandHeader';
import { Button } from '../components/Button';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { ReturnRequestSheet } from '../components/ReturnRequestSheet';
import { ProductImage } from '../components/ProductImage';
import { EmptyState } from '../components/States';
import type { RootScreenProps } from '../navigation/types';
import { refreshOrder } from '../services/accountSync';
import { api, type ReturnItem } from '../services/api';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { slotLabel } from '../services/deliveryDates';
import { ORDER_FLOW, nextStatus } from '../services/orders';
import { useCatalog } from '../store/useCatalog';
import { useShop } from '../store/useShop';
import { toast } from '../store/useToast';
import { colors, fonts, radius, shadow, spacing, alpha } from '../theme';
import { formatDateTime, rupee } from '../utils/format';

const STAGE_ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  placed: 'receipt-outline', confirmed: 'basket-outline', preparing: 'restaurant-outline', packed: 'cube-outline', out_for_delivery: 'bicycle-outline', delivered: 'checkmark-done-circle-outline',
};

export function OrderTrackingScreen({ route }: RootScreenProps<'OrderTracking'>) {
  const nav = useNavigation();
  const order = useShop((s) => s.orders.find((o) => o.id === route.params.orderId));
  const advance = useShop((s) => s.advanceOrder);
  const cancel = useShop((s) => s.cancelOrder);
  const upsertOrder = useShop((s) => s.upsertOrder);
  const reorder = useShop((s) => s.reorder);
  const products = useCatalog((s) => s.products);
  const store = useCatalog((s) => s.store);
  const { height: winH } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [auto, setAuto] = useState(false);
  const [details, setDetails] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const live = !!api.account; // a real backend: status comes from the store, not from a simulator
  const [request, setRequest] = useState<'RETURN' | 'CANCELLATION' | null>(null);
  const [openedAt] = useState(() => Date.now()); // a fixed 'now' for the return-window check, so rendering stays pure
  const [requests, setRequests] = useState<ReturnItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const sync = async () => {
    try {
      await refreshOrder(route.params.orderId);
      setRequests(await api.account!.returnRequests());
    } catch {
      /* offline: keep showing the last known status */
    }
  };
  // Live backend: refresh now and every 15 s while this screen is open and the order can still change.
  const finished = order?.status === 'delivered' || order?.status === 'cancelled';
  useEffect(() => {
    if (!live) return;
    sync();
    if (finished) return;
    const t = setInterval(sync, 8000); // well inside the 15 s the store promises
    const sub = AppState.addEventListener('change', (st) => { if (st === 'active') sync(); }); // catch up the moment the app returns
    return () => { clearInterval(t); sub.remove(); };
  }, [live, route.params.orderId, finished]); // eslint-disable-line

  useEffect(() => {
    if (live || !auto || !order || !nextStatus(order.status) || order.status === 'cancelled') return;
    const t = setTimeout(() => advance(order.id), 3500);
    return () => clearTimeout(t);
  }, [auto, order?.status, order?.id]); // eslint-disable-line

  if (!order) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <BrandHeader />
        <Sheet><EmptyState icon="receipt-outline" title="Order not found" actionLabel="View my orders" onAction={() => nav.navigate('Main', { screen: 'Orders' })} /></Sheet>
      </View>
    );
  }

  const cancelled = order.status === 'cancelled';
  const idx = ORDER_FLOW.findIndex((f) => f.status === order.status);
  const current = ORDER_FLOW[Math.max(idx, 0)];
  // Live: an order the store has not started on and nothing has been paid for is cancelled straight away; otherwise it is a request the store decides on.
  const instantCancel = live && order.status === 'placed' && ['cod_due', 'pending', 'processing'].includes(order.payment.status);
  const canCancel = live ? ['placed', 'confirmed', 'preparing', 'packed'].includes(order.status) : order.status === 'placed' || order.status === 'confirmed';
  const myRequest = requests.find((r) => r.orderNumber === order.number && ['REQUESTED', 'APPROVED', 'REFUNDED', 'REJECTED'].includes(r.status));
  const open = myRequest?.status === 'REQUESTED' || myRequest?.status === 'APPROVED';
  const pendingPay = order.payment.status === 'pending';
  const eventAt = (s: string) => order.events.find((e) => e.status === s)?.at;
  const delivered = order.status === 'delivered';
  // Hide the return button once the store's return window (counted from delivery) has passed; the server enforces it too.
  const deliveredAt = order.events.find((e) => e.status === 'delivered')?.at;
  const returnClosed = !!deliveredAt && store?.returnWindowDays !== undefined && openedAt - new Date(deliveredAt).getTime() > store.returnWindowDays * 86_400_000;

  // Live backend: real contact details entered by the store in Business Settings.
  const help = () => {
    if (!live) return toast('Support contact details will be supplied by Shree Hari (demo)', 'info');
    if (store?.phone) return void Linking.openURL(`tel:${store.phone}`);
    if (store?.email) return void Linking.openURL(`mailto:${store.email}?subject=${encodeURIComponent(`Order ${order.number}`)}`);
    toast('The store has not added contact details yet.', 'info');
  };

  const doReorder = () => {
    const n = reorder(order.id, (pid, label, sku) => { const vs = products.find((p) => p.id === pid)?.variants ?? []; return (vs.find((v) => !!sku && v.sku === sku && v.stock > 0) ?? vs.find((v) => v.label === label && v.stock > 0))?.id; });
    toast(n ? `${n} item${n > 1 ? 's' : ''} added to cart` : 'These items are currently unavailable', n ? 'success' : 'error');
    if (n) nav.navigate('Cart');
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <BrandHeader actions={['help']} title="Order Tracking">
        <View style={styles.meta}>
          <View>
            <AppText variant="h1" color={colors.text}>Order #{order.number}</AppText>
            <AppText variant="body" color={colors.textMuted}>Placed on {formatDateTime(order.createdAt)}</AppText>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <AppText variant="h1" color={colors.primary}>{rupee(order.totals.total)}</AppText>
            <AppText variant="body" color={colors.textMuted}>{order.totals.itemCount} Items</AppText>
          </View>
        </View>
      </BrandHeader>

      <Sheet>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: spacing.md, paddingBottom: insets.bottom + spacing.xxl, gap: spacing.lg }} refreshControl={live ? <RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await sync(); setRefreshing(false); }} tintColor={colors.primary} /> : undefined}>
          <Reveal>
            <View style={styles.status}>
              <LinearGradient colors={[colors.accentSoft, colors.backgroundAlt]} style={StyleSheet.absoluteFill} />
              <View style={{ flex: 1, paddingRight: 104, zIndex: 1 }}>
                <Animated.View key={order.status} entering={FadeIn.duration(350)}>
                  <AppText variant="resultTitle" color={cancelled ? colors.error : colors.primary}>{cancelled ? 'Order Cancelled' : current.title}</AppText>
                  <AppText variant="body" color={colors.textMuted} style={{ marginTop: 2 }}>{cancelled ? 'This order was cancelled.' : delivered ? 'Enjoy your sweets!' : 'We’ll keep this page updated.'}</AppText>
                </Animated.View>
                {!cancelled && !delivered && (
                  <View style={styles.eta}>
                    <Ionicons name="time-outline" size={18} color={colors.success} />
                    <AppText variant="bodyMedium" color={colors.success} weight="semi">Delivery: {slotLabel(order.slot)}</AppText>
                  </View>
                )}
              </View>
              <ProductImage image="scooter" style={styles.scooter} contentFit="cover" />
            </View>
          </Reveal>

          {pendingPay && (
            <View style={styles.pendingBanner}>
              <Ionicons name="time" size={20} color={colors.warning} />
              <AppText variant="bodyMedium" style={{ flex: 1 }}>Payment is pending verification. The order is not confirmed until payment is verified.</AppText>
            </View>
          )}

          {!cancelled && (
            <View style={styles.timeline}>
              {ORDER_FLOW.map((st, i) => {
                const done = i < idx || (i === idx && delivered);
                const isCur = i === idx && !delivered;
                return <Step key={st.status} i={i} last={i === ORDER_FLOW.length - 1} done={done} current={isCur} title={st.title} subtitle={eventAt(st.status) ? formatDateTime(eventAt(st.status)!) : st.subtitle} icon={STAGE_ICON[st.status]} />;
              })}
            </View>
          )}

          {!live && (order.status === 'out_for_delivery' || delivered) && (
            <Reveal>
              <View style={styles.partner}>
                <ProductImage image="avatar-rider" style={{ width: 62, height: 62, borderRadius: 31 }} />
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <AppText variant="h2">Ramesh K.</AppText><DemoTag label="DEMO PARTNER" />
                  </View>
                  <AppText variant="body" color={colors.textMuted}>Delivery Partner</AppText>
                </View>
                <PressableScale onPress={() => toast('Demo: calling is not connected', 'info')} accessibilityLabel="Call delivery partner" style={styles.contactBtn}>
                  <Ionicons name="call" size={18} color={colors.primary} /><AppText variant="buttonSm" color={colors.primary}>Call</AppText>
                </PressableScale>
              </View>
            </Reveal>
          )}

          <View style={styles.mapNote}>
            <Ionicons name="map-outline" size={24} color={colors.textMuted} />
            <AppText variant="label" color={colors.textMuted} style={{ flex: 1 }}>A live rider map appears here only once a real delivery tracking integration is connected. No fake location is ever shown.</AppText>
          </View>

          <View style={styles.addr}>
            <Ionicons name="location" size={28} color={colors.secondary} />
            <View style={{ flex: 1 }}>
              <AppText variant="h2">Delivery Address</AppText>
              <AppText variant="body" color={colors.textMuted}>{order.address.line1}, {order.address.area}, {order.address.city} - {order.address.pincode}</AppText>
            </View>
            <PressableScale onPress={() => setDetails(true)} accessibilityLabel="Order details" style={styles.detailBtn}>
              <Ionicons name="clipboard-outline" size={18} color={colors.primary} />
              <AppText variant="weight" color={colors.primary}>Order Details</AppText>
            </PressableScale>
          </View>

          {!live && !cancelled && !delivered && (
            <View style={styles.demo}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="flask-outline" size={20} color={colors.text} />
                <AppText variant="cardTitle">Status simulator</AppText><DemoTag label="DEMO" />
              </View>
              <AppText variant="caption" color={colors.textMuted} style={{ marginTop: 4 }}>In production, only staff or verified integrations can change status. Use these controls to demo the timeline.</AppText>
              <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center', marginTop: 10 }}>
                <Button title="Advance status" size="sm" icon="play-forward" style={{ flex: 1 }} onPress={() => advance(order.id)} disabled={!nextStatus(order.status)} />
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <AppText variant="bodyMedium">Auto</AppText>
                  <Switch value={auto} onValueChange={setAuto} trackColor={{ true: colors.primary, false: colors.border }} thumbColor={colors.white} accessibilityLabel="Auto-advance status" />
                </View>
              </View>
            </View>
          )}

          {live && myRequest && (
            <View style={styles.pendingBanner} accessibilityLiveRegion="polite">
              <Ionicons name="information-circle" size={20} color={colors.warning} />
              <AppText variant="bodyMedium" style={{ flex: 1 }}>
                {myRequest.kind === 'RETURN' ? 'Return' : 'Cancellation'} request: {myRequest.status === 'REQUESTED' ? 'waiting for the store to review it.' : myRequest.status === 'APPROVED' ? 'approved. Any refund is being processed by the store.' : myRequest.status === 'REFUNDED' ? `refunded${myRequest.refundAmount ? ' ' + rupee(myRequest.refundAmount) : ''}.` : 'not approved by the store.'}
              </AppText>
            </View>
          )}

          <View style={{ gap: 10 }}>
            {delivered && <Button title="Order Again" icon="repeat" onPress={doReorder} />}
            {live && delivered && !open && myRequest?.status !== 'REFUNDED' && (returnClosed
              ? <AppText variant="caption" color={colors.textMuted} align="center">The return period has ended: returns are accepted within {store?.returnWindowDays} day(s) of delivery.</AppText>
              : <Button title="Request a return" variant="outline" icon="return-down-back" onPress={() => setRequest('RETURN')} />)}
            {canCancel && !open && <Button title={live && !instantCancel ? 'Request cancellation' : 'Cancel Order'} variant="outline" onPress={() => (live && !instantCancel ? setRequest('CANCELLATION') : setConfirmCancel(true))} />}
            <Button title="Help with this order" variant="ghost" icon="headset-outline" onPress={help} />
          </View>
        </ScrollView>
      </Sheet>

      <BottomSheet visible={details} onClose={() => setDetails(false)} title={`Order #${order.number}`}>
        <ScrollView style={{ maxHeight: Math.round(winH * 0.55) }} showsVerticalScrollIndicator={false}>
          <View style={{ gap: 12 }}>
            {order.items.map((it, i) => (
              <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <ProductImage image={it.imageUri ? { id: 'x', uri: it.imageUri } : it.imageKey} style={{ width: 52, height: 52, borderRadius: radius.md }} />
                <View style={{ flex: 1 }}>
                  <AppText variant="bodyMedium" weight="semi">{it.name}</AppText>
                  <AppText variant="caption" color={colors.textMuted}>{it.variantLabel} × {it.qty} · {it.sku}</AppText>
                </View>
                <AppText variant="bodyMedium" weight="semi">{rupee(it.unitPrice * it.qty)}</AppText>
              </View>
            ))}
            <View style={styles.sep} />
            <Row l="Item total (MRP)" v={rupee(order.totals.mrpTotal)} />
            <Row l="Item discount" v={`– ${rupee(order.totals.itemDiscount)}`} g />
            {order.totals.couponDiscount > 0 && <Row l={`Coupon (${order.couponCode})`} v={`– ${rupee(order.totals.couponDiscount)}`} g />}
            {order.totals.rewardDiscount > 0 && <Row l={live ? 'Reward points' : 'Reward points (demo)'} v={`– ${rupee(order.totals.rewardDiscount)}`} g />}
            <Row l="Delivery" v={order.totals.deliveryFee ? rupee(order.totals.deliveryFee) : 'Free'} />
            <Row l="Total" v={rupee(order.totals.total)} b />
            <AppText variant="caption" color={colors.textMuted}>Payment: {order.payment.method.toUpperCase()} · {order.payment.status.replace('_', ' ')} · ref {order.payment.reference} {order.payment.simulated ? '(simulated)' : ''}</AppText>
          </View>
        </ScrollView>
      </BottomSheet>

      {live && <ReturnRequestSheet visible={!!request} kind={request ?? 'RETURN'} orderId={order.id} orderNumber={order.number} onClose={() => setRequest(null)} onDone={() => { setRequest(null); sync(); }} />}

      <ConfirmDialog
        visible={confirmCancel}
        title="Cancel this order?"
        message={live ? 'The order will be cancelled right away. You have not paid anything for it, so nothing is charged.' : 'You can cancel before the store starts preparing it. Refunds follow the store’s policy (to be confirmed).'}
        confirmLabel="Cancel Order"
        cancelLabel="Keep Order"
        onCancel={() => setConfirmCancel(false)}
        onConfirm={async () => {
          setConfirmCancel(false);
          if (!live) { cancel(order.id); toast('Order cancelled'); return; }
          try {
            upsertOrder(await api.account!.cancelOrder(order.id));
            toast('Order cancelled', 'success');
          } catch (e) {
            // For example the store confirmed it a moment ago: show the real state and the request option.
            toast((e as Error).message || 'Could not cancel the order. Please try again.', 'error');
            sync();
          }
        }}
      />
    </View>
  );
}

function Row({ l, v, g, b }: { l: string; v: string; g?: boolean; b?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
      <AppText variant="body" color={g ? colors.success : colors.text} style={b ? { fontFamily: fonts.bold } : null}>{l}</AppText>
      <AppText variant="bodyMedium" color={g ? colors.success : colors.text} style={{ fontFamily: b ? fonts.bold : fonts.medium }}>{v}</AppText>
    </View>
  );
}

function Step({ i, last, done, current, title, subtitle, icon }: { i: number; last: boolean; done: boolean; current: boolean; title: string; subtitle: string; icon: keyof typeof Ionicons.glyphMap }) {
  const line = useSharedValue(0);
  const pulse = useSharedValue(1);
  const pop = useSharedValue(done ? 1 : 0.85);
  const reduceMotion = useReducedMotion();
  useEffect(() => { line.value = withTiming(done ? 1 : 0, { duration: 600 }); }, [done, line]);
  useEffect(() => { pop.value = withTiming(done || current ? 1 : 0.9, timingConfig(duration.card)); }, [done, current, pop]);
  useEffect(() => {
    // A slow, small glow on the current step only (no pulse at all when the phone asks for reduced motion).
    if (current && !reduceMotion) pulse.value = withRepeat(withSequence(withTiming(1.2, { duration: 1400, easing: Easing.inOut(Easing.ease) }), withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.ease) })), -1);
    else pulse.value = 1;
  }, [current, reduceMotion, pulse]);
  const lineStyle = useAnimatedStyle(() => ({ height: `${line.value * 100}%` }));
  const ring = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }], opacity: current && !reduceMotion ? 2 - pulse.value : 0 }));
  const dot = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }));

  return (
    <Animated.View entering={FadeIn.delay(i * 70)} style={[styles.step, current && { backgroundColor: colors.primarySoft }]}>
      <View style={{ width: 34, alignItems: 'center' }}>
        <Animated.View style={[styles.ring, ring]} />
        <Animated.View style={[styles.dot, done && { backgroundColor: colors.success, borderColor: colors.success }, current && { borderColor: colors.primary, backgroundColor: colors.white }, dot]}>
          {done ? <Ionicons name="checkmark" size={18} color={colors.white} /> : current ? <View style={styles.inner} /> : null}
        </Animated.View>
        {!last && (
          <View style={styles.lineTrack}><Animated.View style={[{ width: 3, backgroundColor: colors.success }, lineStyle]} /></View>
        )}
      </View>
      <View style={{ flex: 1, paddingVertical: 4 }}>
        <AppText variant="cardTitle" color={done || current ? colors.text : colors.textMuted}>{title}</AppText>
        <AppText variant="body" color={colors.textMuted}>{subtitle}</AppText>
      </View>
      <Ionicons name={icon} size={30} color={done || current ? colors.primary : colors.border} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  meta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 10 },
  status: { flexDirection: 'row', alignItems: 'center', borderRadius: radius.lg, overflow: 'hidden', padding: 16, minHeight: 150, ...shadow.card },
  eta: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', backgroundColor: colors.successSoft, paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.pill, marginTop: 12 },
  scooter: { width: 96, height: 88, borderRadius: radius.md, position: 'absolute', right: 8, bottom: 8 },
  pendingBanner: { flexDirection: 'row', gap: 10, alignItems: 'center', backgroundColor: colors.accentSoft, borderRadius: radius.md, padding: 12 },
  timeline: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: 6, ...shadow.card },
  step: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingHorizontal: 10, paddingVertical: 10, borderRadius: radius.md },
  dot: { width: 30, height: 30, borderRadius: 15, borderWidth: 2, borderColor: colors.border, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center', zIndex: 2 },
  inner: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.primary },
  ring: { position: 'absolute', top: 0, width: 30, height: 30, borderRadius: 15, backgroundColor: alpha.primary(0.25) },
  lineTrack: { position: 'absolute', top: 34, bottom: -30, width: 3, backgroundColor: colors.border, zIndex: 1, overflow: 'hidden' },
  partner: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface, borderRadius: radius.lg, padding: 14, ...shadow.card },
  contactBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 44, paddingHorizontal: 16, borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.primary },
  mapNote: { flexDirection: 'row', gap: 10, alignItems: 'center', backgroundColor: colors.backgroundAlt, borderRadius: radius.md, padding: 14 },
  addr: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface, borderRadius: radius.lg, padding: 14, ...shadow.card },
  detailBtn: { alignItems: 'center', gap: 2, backgroundColor: colors.primarySoft, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 8, minHeight: 56, justifyContent: 'center' },
  demo: { backgroundColor: colors.accentSoft, borderRadius: radius.md, padding: 14 },
  sep: { height: 1, backgroundColor: colors.border },
});
