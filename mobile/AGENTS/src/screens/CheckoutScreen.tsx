import { useEnsureCatalog } from '../store/useCatalog';
import { layoutTransition } from '../animations/motion';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PressableScale } from '../animations/PressableScale';
import { Reveal } from '../animations/Reveal';
import { AddressFormSheet } from '../components/AddressFormSheet';
import { AppText } from '../components/AppText';
import { BrandHeader, Sheet } from '../components/BrandHeader';
import { Button } from '../components/Button';
import { CheckoutSteps } from '../components/CheckoutSteps';
import { ProductImage } from '../components/ProductImage';
import { EmptyState } from '../components/States';
import { PriceSummary } from '../components/Summary';
import { useStickyBar } from '../hooks/useStickyBar';
import { useCartView, useDeliverySlots } from '../hooks/useShopData';
import { API_MODE, api } from '../services/api';
import { dayLabel, slotAvailability } from '../services/deliveryDates';
import { SlotOption } from '../components/SlotOption';
import { useShop } from '../store/useShop';
import { toast } from '../store/useToast';
import { colors, fonts, radius, spacing } from '../theme';
import type { Address } from '../types';
import { rupee } from '../utils/format';

type Serv = { state: 'busy' | 'ok' | 'bad'; msg?: string };

export function CheckoutScreen() {
  useEnsureCatalog(); // prices, stock and availability are re-read whenever this screen becomes active
  const nav = useNavigation();
  const insets = useSafeAreaInsets();
  const sticky = useStickyBar();
  const { lines, totals, coupon, freeDeliveryThreshold, slot: activeSlot, deliveryDate, dates, timing, now } = useCartView();
  const slots = useDeliverySlots();
  const addresses = useShop((s) => s.addresses);
  const selectedId = useShop((s) => s.selectedAddressId);
  const selectAddress = useShop((s) => s.selectAddress);
  const setDeliveryDate = useShop((s) => s.setDeliveryDate);
  const setSlot = useShop((s) => s.setSlot);
  const couponCode = useShop((s) => s.couponCode);

  const [formOpen, setFormOpen] = useState(false);
  const [gpsStart, setGpsStart] = useState(false);
  const [editing, setEditing] = useState<Address | null>(null);
  const [itemsOpen, setItemsOpen] = useState(false);
  const [serv, setServ] = useState<Serv>({ state: 'busy' });

  const selected = addresses.find((a) => a.id === selectedId);

  // Serviceability is verified before the customer can proceed to pay (BRD 06).
  useEffect(() => {
    if (!selected) return;
    let live = true;
    setServ({ state: 'busy' });
    api.checkPincode(selected.pincode).then((r) => live && setServ({ state: r.serviceable ? 'ok' : 'bad', msg: r.message }));
    return () => { live = false; };
  }, [selected?.pincode, selected?.id]); // eslint-disable-line

  const progress = useSharedValue(0);
  const pct = freeDeliveryThreshold > 0 ? Math.min(1, totals.subtotal / freeDeliveryThreshold) : 1;
  useEffect(() => { progress.value = withTiming(pct, { duration: 600 }); }, [pct, progress]);
  const barStyle = useAnimatedStyle(() => ({ width: `${progress.value * 100}%` }));

  const canContinue = !!selected && serv.state === 'ok' && lines.length > 0;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <BrandHeader title="Checkout">
        <CheckoutSteps step={1} />
      </BrandHeader>
      <Sheet>
        {lines.length === 0 ? (
          <EmptyState title="Nothing to check out" message="Your cart is empty." actionLabel="Start Shopping" onAction={() => nav.navigate('Main')} />
        ) : (
          <>
            <ScrollView testID="screen-scroll" showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: spacing.lg, paddingBottom: sticky.clearance, gap: spacing.lg }}>
              <View style={styles.headRow}>
                <View style={styles.head}><Ionicons name="location" size={28} color={colors.secondary} /><AppText variant="sectionTitle">Delivery Address</AppText></View>
                <PressableScale onPress={() => { setEditing(null); setGpsStart(false); setFormOpen(true); }} accessibilityLabel="Add new address" style={{ minHeight: 44, justifyContent: 'center' }}>
                  <AppText variant="bodyMedium" color={colors.primary} weight="semi">+ Add New</AppText>
                </PressableScale>
              </View>

              <PressableScale onPress={() => { setEditing(null); setGpsStart(true); setFormOpen(true); }} accessibilityLabel="Use my current location" style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52, paddingHorizontal: 14, borderRadius: radius.md, backgroundColor: colors.primarySoft }}>
                <Ionicons name="locate" size={22} color={colors.primary} />
                <AppText variant="bodyMedium" color={colors.primary} style={{ fontFamily: fonts.semi, flex: 1 }}>Use my current location</AppText>
                <Ionicons name="chevron-forward" size={18} color={colors.primary} />
              </PressableScale>

              <View style={{ gap: 10 }}>
                {addresses.map((a, i) => {
                  const on = a.id === selectedId;
                  return (
                    <Reveal key={a.id} index={i}>
                      <PressableScale onPress={() => selectAddress(a.id)} accessibilityState={{ selected: on }} accessibilityLabel={`${a.label} address, ${a.line1}, ${a.area}, ${a.pincode}`} style={[styles.addr, on && styles.addrOn]}>
                        <Ionicons name={on ? 'radio-button-on' : 'radio-button-off'} size={24} color={on ? colors.primary : colors.textMuted} />
                        <Ionicons name={a.label === 'Office' ? 'briefcase-outline' : a.label === 'Home' ? 'home-outline' : 'location-outline'} size={26} color={colors.secondary} />
                        <View style={{ flex: 1 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <AppText variant="h2">{a.label}</AppText>
                            {a.isDefault && <View style={styles.default}><AppText variant="captionMedium" color={colors.text}>Default</AppText></View>}
                          </View>
                          <AppText variant="body" color={colors.textMuted}>{a.line1}, {a.area}, {a.city} - {a.pincode}</AppText>
                        </View>
                        <PressableScale onPress={() => { setEditing(a); setFormOpen(true); }} accessibilityLabel={`Edit ${a.label} address`} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
                          <Ionicons name="create-outline" size={22} color={colors.secondary} />
                        </PressableScale>
                      </PressableScale>
                    </Reveal>
                  );
                })}
              </View>

              {selected && (
                <Animated.View key={serv.state} entering={FadeInDown.duration(250)} style={[styles.serv, serv.state === 'ok' ? { backgroundColor: colors.successSoft } : serv.state === 'bad' ? { backgroundColor: colors.errorSoft } : { backgroundColor: colors.backgroundAlt }]}>
                  <Ionicons name={serv.state === 'ok' ? 'checkmark-circle' : serv.state === 'bad' ? 'close-circle' : 'time-outline'} size={22} color={serv.state === 'ok' ? colors.success : serv.state === 'bad' ? colors.error : colors.textMuted} />
                  <AppText variant="bodyMedium" color={serv.state === 'ok' ? colors.success : serv.state === 'bad' ? colors.error : colors.textMuted} style={{ flex: 1 }}>
                    {serv.state === 'busy' ? 'Checking delivery availability…' : serv.msg}
                    {serv.state === 'bad' ? ' Choose or add another address to continue.' : ''}
                  </AppText>
                </Animated.View>
              )}

              <View>
                <View style={[styles.head, { marginBottom: 10 }]}><Ionicons name="bicycle" size={30} color={colors.primary} /><AppText variant="sectionTitle">{dates.length > 1 ? 'Choose Delivery Day & Slot' : 'Choose Delivery Slot'}</AppText></View>
                {dates.length > 1 && (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 10 }} accessibilityRole="radiogroup">
                    {dates.map((d) => {
                      const on = d === deliveryDate;
                      return (
                        <PressableScale key={d} onPress={() => setDeliveryDate(d)} accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={`Deliver ${dayLabel(d, dates[0]!)}`} style={[styles.dateChip, on && styles.slotOn]}>
                          <AppText variant="bodyMedium" weight={on ? 'bold' : 'semi'} color={on ? colors.primary : colors.text}>{dayLabel(d, dates[0]!)}</AppText>
                        </PressableScale>
                      );
                    })}
                  </ScrollView>
                )}
                <View style={{ gap: 10 }} accessibilityRole="radiogroup">
                  {slots.map((s) => {
                    const av = slotAvailability(s, deliveryDate, now, timing);
                    return <SlotOption key={s.id} slot={s} selected={s.id === activeSlot.id} unavailableReason={av.ok ? undefined : av.reason} onPress={() => setSlot(s.id)} />;
                  })}
                </View>
                {API_MODE === 'mock' && <AppText variant="caption" color={colors.textMuted} style={{ marginTop: 6 }}>Slots and fees are demo configuration, to be confirmed by the business.</AppText>}
              </View>

              <Animated.View layout={layoutTransition}>
                <View style={styles.summaryHead}>
                  <View style={styles.head}><Ionicons name="bag-handle-outline" size={28} color={colors.primary} /><AppText variant="sectionTitle">Order Summary</AppText></View>
                  <PressableScale onPress={() => setItemsOpen((o) => !o)} accessibilityLabel="Toggle items" style={{ flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 44 }}>
                    <AppText variant="bodyMedium" color={colors.primary} weight="semi">View Items ({totals.itemCount})</AppText>
                    <Ionicons name={itemsOpen ? 'chevron-up' : 'chevron-down'} size={18} color={colors.primary} />
                  </PressableScale>
                </View>
                {itemsOpen && (
                  <Animated.View entering={FadeInDown.duration(220)} style={styles.items}>
                    {lines.map((l) => (
                      <View key={l.variant.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                        <ProductImage image={l.product.images[0]} style={{ width: 48, height: 40, borderRadius: 8 }} />
                        <AppText variant="bodyMedium" style={{ flex: 1 }} numberOfLines={1}>{l.product.name} · {l.variant.label} × {l.qty}</AppText>
                        <AppText variant="bodyMedium" weight="semi">{rupee(l.linePrice)}</AppText>
                      </View>
                    ))}
                  </Animated.View>
                )}
                <PriceSummary totals={totals} couponCode={couponCode ?? coupon?.code} title="" totalLabel="Total Payable" />
              </Animated.View>

              <View style={styles.freeCard}>
                <Ionicons name="gift" size={34} color={colors.accent} />
                <View style={{ flex: 1 }}>
                  <AppText variant="bodyMedium" weight="semi">
                    {totals.freeDeliveryRemaining > 0 ? `You’re just ${rupee(totals.freeDeliveryRemaining)} away from Free Delivery!` : 'You’ve unlocked Free Delivery!'}
                  </AppText>
                  <View style={styles.track}><Animated.View style={[styles.fill, barStyle]} /></View>
                </View>
                <Ionicons name="bicycle" size={30} color={colors.primary} />
              </View>
            </ScrollView>

            <View testID="sticky-bar" onLayout={sticky.onLayout} style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
              {!canContinue && (
                <AppText variant="caption" color={colors.textMuted} align="center" style={{ marginBottom: 8 }}>
                  {!selected ? 'Select or add a delivery address to continue.' : serv.state === 'bad' ? 'Choose an address we deliver to, to continue.' : serv.state === 'busy' ? 'Checking delivery availability…' : ''}
                </AppText>
              )}
              <Button
                title={serv.state === 'bad' ? 'Address not serviceable' : 'Continue to Payment'}
                iconRight="arrow-forward"
                disabled={!canContinue}
                onPress={() => nav.navigate('Payment')}
              />
            </View>
          </>
        )}
      </Sheet>
      <AddressFormSheet visible={formOpen} editing={editing} startWithGps={gpsStart} onClose={() => { setFormOpen(false); setGpsStart(false); }} onSaved={(id) => { selectAddress(id); toast('Address selected', 'success'); }} />
    </View>
  );
}

const styles = StyleSheet.create({
  headRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', columnGap: 12 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  addr: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.surface, borderRadius: radius.md, padding: 14, borderWidth: 1.5, borderColor: colors.border },
  addrOn: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  default: { backgroundColor: colors.accentSoft, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 2 },
  serv: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: radius.md },
  dateChip: { minHeight: 44, paddingHorizontal: 16, borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  slotOn: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  summaryHead: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', columnGap: 12, marginBottom: 6 },
  items: { backgroundColor: colors.surface, borderRadius: radius.md, padding: 12, gap: 10, marginBottom: 10, borderWidth: 1, borderColor: colors.border },
  freeCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.primarySoft, borderRadius: radius.md, padding: 14 },
  track: { height: 8, borderRadius: 4, backgroundColor: colors.border, marginTop: 8, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4, backgroundColor: colors.primary },
  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: spacing.lg, paddingTop: 12, backgroundColor: colors.background, borderTopWidth: 1, borderTopColor: colors.border },
});
