import { layoutTransition, softIn } from '../animations/motion';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { FadeIn, FadeOutLeft } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PressableScale } from '../animations/PressableScale';
import { AppText } from '../components/AppText';
import { HeartButton, OffPill, SectionHeader } from '../components/Atoms';
import { BottomSheet } from '../components/BottomSheet';
import { BrandHeader, Sheet } from '../components/BrandHeader';
import { Button } from '../components/Button';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { CouponSheet } from '../components/CouponSheet';
import { ProductImage } from '../components/ProductImage';
import { QuantityStepper } from '../components/QuantityStepper';
import { EmptyState } from '../components/States';
import { PriceSummary } from '../components/Summary';
import { useStickyBar } from '../hooks/useStickyBar';
import { useCartView } from '../hooks/useShopData';
import { slotLabel } from '../services/deliveryDates';
import { evaluateCoupon, isCouponActive } from '../services/pricing';
import { getRules } from '../services/rules';
import { useCatalog, useEnsureCatalog } from '../store/useCatalog';
import { useAuth } from '../store/useAuth';
import { useShop } from '../store/useShop';
import { toast } from '../store/useToast';
import { colors, radius, shadow, spacing } from '../theme';
import type { PricedLine } from '../types';
import { percentOff, rupee } from '../utils/format';

export function CartScreen() {
  useEnsureCatalog(); // prices, stock and availability are re-read whenever this screen becomes active
  const nav = useNavigation();
  const insets = useSafeAreaInsets();
  const sticky = useStickyBar();
  const { width: winW } = useWindowDimensions();
  const { lines, totals, coupon, slot, deliveryDate } = useCartView();
  const coupons = useCatalog((s) => s.coupons);
  const activeCoupons = useMemo(() => coupons.filter((c) => isCouponActive(c)), [coupons]);
  const freeThreshold = getRules().freeDeliveryThreshold;
  const user = useAuth((s) => s.user);
  const couponCode = useShop((s) => s.couponCode);
  const setCoupon = useShop((s) => s.setCoupon);
  const setQty = useShop((s) => s.setQty);
  const clearCart = useShop((s) => s.clearCart);
  const wishlist = useShop((s) => s.wishlist);
  const toggleWishlist = useShop((s) => s.toggleWishlist);
  const changeVariant = useShop((s) => s.changeVariant);
  const address = useShop((s) => s.addresses.find((a) => a.id === s.selectedAddressId));

  const [couponOpen, setCouponOpen] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [editing, setEditing] = useState<PricedLine | null>(null);

  const blocked = lines.some((l) => l.variant.stock < l.qty);
  const itemsCount = lines.reduce((n, l) => n + l.qty, 0);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <BrandHeader>
        <View style={styles.titleRow}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Ionicons name="cart-outline" size={32} color={colors.secondary} />
            <AppText variant="pageTitle" color={colors.text}>My Cart</AppText>
            <AppText variant="body" color={colors.textMuted}>({itemsCount} {itemsCount === 1 ? 'Item' : 'Items'})</AppText>
          </View>
          {lines.length > 0 && (
            <PressableScale onPress={() => setConfirmClear(true)} accessibilityLabel="Clear cart" style={styles.clear}>
              <Ionicons name="trash-outline" size={18} color={colors.primary} />
              <AppText variant="bodyMedium" color={colors.primary}>Clear Cart</AppText>
            </PressableScale>
          )}
        </View>
      </BrandHeader>

      <Sheet>
        {lines.length === 0 ? (
          <EmptyState icon="cart-outline" title="Your cart is empty" message="Add a few sweets or snacks and they’ll show up here." actionLabel="Start Shopping" onAction={() => nav.navigate('Main')} secondaryLabel="View offers" onSecondary={() => nav.navigate('Offers')} />
        ) : (
          <>
            <ScrollView testID="screen-scroll" showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: spacing.md, paddingBottom: sticky.clearance, gap: spacing.lg }}>
              <View style={styles.linesCard}>
                {lines.map((l, i) => {
                  const out = l.variant.stock < l.qty;
                  const off = percentOff(l.variant.mrp, l.variant.price);
                  return (
                    <Animated.View
                      key={l.key}
                      layout={layoutTransition}
                      entering={FadeIn.delay(i * 50)}
                      exiting={FadeOutLeft.duration(220)}
                      style={[styles.line, i > 0 && { borderTopWidth: 1, borderTopColor: colors.border }]}
                    >
                      <PressableScale onPress={() => nav.navigate('ProductDetail', { productId: l.product.id })} accessibilityLabel={`Open ${l.product.name}`}>
                        <ProductImage image={l.product.images[0]} style={styles.thumb} />
                      </PressableScale>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <View style={{ flex: 1 }}>
                            <AppText variant="h2" numberOfLines={2}>{l.product.name}</AppText>
                            <AppText variant="caption" color={colors.textMuted} numberOfLines={1}>{l.product.tagline}</AppText>
                          </View>
                          <HeartButton active={wishlist.includes(l.product.id)} onPress={() => toggleWishlist(l.product.id)} dark={false} size={22} />
                        </View>
                        <PressableScale onPress={() => setEditing(l)} accessibilityLabel={`Change pack size, currently ${l.variant.label}`} style={styles.weight} scaleTo={0.94}>
                          <AppText variant="bodyMedium" weight="semi">{l.variant.label}</AppText>
                          <Ionicons name="chevron-down" size={14} color={colors.text} />
                        </PressableScale>
                        <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 8, gap: 6 }}>
                          <View style={{ flexShrink: 1, gap: 4 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
                              <AppText variant="productPrice" color={colors.primary}>{rupee(l.variant.price)}</AppText>
                              {off > 0 && <AppText variant="caption" color={colors.textMuted} style={{ textDecorationLine: 'line-through' }}>{rupee(l.variant.mrp)}</AppText>}
                            </View>
                            {off > 0 && <View style={{ alignSelf: 'flex-start' }}><OffPill off={off} /></View>}
                          </View>
                          <QuantityStepper value={l.qty} onChange={(n) => setQty(l.key!, n)} tone="outline" label={l.product.name} height={40} btn={32} max={Math.max(1, Math.min(20, l.variant.stock))} />
                        </View>
                        {(l.options?.flavour || l.options?.message) && (
                          <AppText variant="caption" color={colors.textMuted} numberOfLines={2} style={{ marginTop: 4 }}>
                            {[l.options.flavour, l.options.message ? `“${l.options.message}”` : null].filter(Boolean).join(' · ')}
                          </AppText>
                        )}
                        {out && <AppText variant="captionMedium" color={colors.error} style={{ marginTop: 4 }}>{l.variant.stock <= 0 ? 'Out of stock — remove to continue' : `Only ${l.variant.stock} available — reduce quantity`}</AppText>}
                      </View>
                      
                    </Animated.View>
                  );
                })}
              </View>

              {totals.deliveryFee > 0 && freeThreshold > 0 && totals.subtotal < freeThreshold && (
                <View style={styles.freeShip} accessible accessibilityLabel={`Add ${rupee(freeThreshold - totals.subtotal)} more for free delivery`}>
                  <Ionicons name="bicycle" size={26} color={colors.primary} />
                  <View style={{ flex: 1, gap: 6 }}>
                    <AppText variant="bodyMedium" color={colors.text}>Add <AppText variant="bodyMedium" color={colors.primary} weight="bold">{rupee(freeThreshold - totals.subtotal)}</AppText> more for FREE delivery</AppText>
                    <View style={styles.track}><View style={[styles.fill, { width: `${Math.max(6, Math.min(100, (totals.subtotal / freeThreshold) * 100))}%` }]} /></View>
                  </View>
                </View>
              )}

              <PressableScale onPress={() => setCouponOpen(true)} accessibilityLabel="Apply coupon" style={styles.couponRow}>
                <View style={styles.giftIcon}><Ionicons name="gift" size={26} color={colors.accent} /></View>
                <View style={{ flex: 1 }}>
                  <AppText variant="sectionTitle" color={colors.primary}>{couponCode && coupon ? `${couponCode} applied` : 'Apply Coupon'}</AppText>
                  <AppText variant="caption" color={colors.textMuted}>{couponCode && coupon ? 'Tap to change or remove' : 'Get exciting offers on your order'}</AppText>
                </View>
                {couponCode && totals.coupon?.eligible ? (
                  <Animated.View entering={softIn}><Ionicons name="checkmark-circle" size={26} color={colors.success} /></Animated.View>
                ) : (
                  <Ionicons name="chevron-forward" size={22} color={colors.primary} />
                )}
              </PressableScale>
              {couponCode && totals.coupon && !totals.coupon.eligible && (
                <Animated.View entering={FadeIn} style={{ flexDirection: 'row', gap: 6, marginTop: -8, paddingHorizontal: 6 }}>
                  <Ionicons name="alert-circle" size={18} color={colors.error} />
                  <AppText variant="caption" color={colors.error} style={{ flex: 1 }}>{couponCode} is not applied: {totals.coupon.reason}</AppText>
                </Animated.View>
              )}

              {activeCoupons.length > 0 && (
              <View>
                <SectionHeader title="Available Offers" icon="star" iconColor={colors.accent} action="View All" onAction={() => nav.navigate('Offers')} />
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingHorizontal: 4, paddingVertical: 4 }}>
                  {activeCoupons.slice(0, 3).map((c) => {
                    const ev = evaluateCoupon(c, totals.subtotal);
                    const on = couponCode === c.code && ev.eligible;
                    return (
                      <PressableScale
                        key={c.code}
                        onPress={() => (ev.eligible ? (setCoupon(on ? null : c.code), toast(on ? `${c.code} removed` : `${c.code} applied`, on ? 'info' : 'success')) : toast(ev.reason ?? 'Not eligible', 'error'))}
                        accessibilityState={{ selected: on }}
                        accessibilityLabel={`${c.code}: ${c.description}${ev.eligible ? '' : `. ${ev.reason}`}`}
                        style={[styles.offerCard, { width: Math.min(262, winW - 72) }, on ? { borderColor: colors.primary } : { borderStyle: 'dashed' }, !ev.eligible && { opacity: 0.65 }]}
                      >
                        <View style={styles.codeTag}><AppText variant="captionMedium" color={colors.primaryPressed} weight="bold">{c.code}</AppText></View>
                        <View style={{ flex: 1 }}>
                          <AppText variant="productName" numberOfLines={2}>{c.title}</AppText>
                          <AppText variant="caption" color={colors.textMuted} numberOfLines={2}>{ev.eligible ? c.description : (ev.reason ?? '').replace(` to use ${c.code}`, '').replace(/\s*\(min order [^)]*\)\.?/, '')}</AppText>
                        </View>
                        <Ionicons name={on ? 'checkmark-circle' : 'ellipse-outline'} size={26} color={on ? colors.primary : colors.textMuted} />
                      </PressableScale>
                    );
                  })}
                </ScrollView>
              </View>
              )}

              <PriceSummary totals={totals} couponCode={couponCode} />
            </ScrollView>

            <View testID="sticky-bar" onLayout={sticky.onLayout} style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
              <PressableScale onPress={() => nav.navigate('Addresses')} accessibilityLabel="Change delivery address" style={{ flex: 1, minWidth: 0 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={styles.barPin}><Ionicons name="location" size={20} color={colors.secondary} /></View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                      <AppText variant="bodyMedium" weight="bold" numberOfLines={1} style={{ flexShrink: 1 }}>{address ? `${address.area}, ${address.city}` : 'Add address'}</AppText>
                      <Ionicons name="chevron-down" size={16} color={colors.text} />
                    </View>
                    <AppText variant="caption" color={colors.success} numberOfLines={1}>{slotLabel({ ...slot, date: deliveryDate })}</AppText>
                  </View>
                </View>
              </PressableScale>
              <Button
                title={blocked ? 'Fix cart' : 'Checkout'}
                iconRight="arrow-forward"
                disabled={blocked}
                onPress={() => (user ? nav.navigate('Checkout') : nav.navigate('Login', { redirect: 'Checkout' }))}
                style={{ flexShrink: 0, minWidth: 150 }}
              />
            </View>
          </>
        )}
      </Sheet>

      <CouponSheet visible={couponOpen} onClose={() => setCouponOpen(false)} subtotal={totals.subtotal} />
      <ConfirmDialog
        visible={confirmClear}
        title="Clear your cart?"
        message="All items will be removed from your cart."
        confirmLabel="Clear Cart"
        onCancel={() => setConfirmClear(false)}
        onConfirm={() => { clearCart(); setConfirmClear(false); toast('Cart cleared'); }}
      />
      <BottomSheet visible={!!editing} onClose={() => setEditing(null)} title={editing ? `Pack size — ${editing.product.name}` : ''}>
        <View style={{ gap: 10 }}>
          {editing?.product.variants.map((v) => {
            const on = v.id === editing.variant.id;
            const sold = v.stock <= 0;
            return (
              <PressableScale
                key={v.id}
                disabled={sold}
                onPress={() => { changeVariant(editing.key!, editing.product.id, v.id); setEditing(null); toast(`Changed to ${v.label}`); }}
                accessibilityState={{ selected: on, disabled: sold }}
                style={[styles.opt, on && { borderColor: colors.primary, backgroundColor: colors.primarySoft }, sold && { opacity: 0.5 }]}
              >
                <Ionicons name={on ? 'radio-button-on' : 'radio-button-off'} size={22} color={on ? colors.primary : colors.textMuted} />
                <AppText variant="h2" style={{ flex: 1, marginLeft: 12 }}>{v.label}{sold ? ' · Out of stock' : ''}</AppText>
                <AppText variant="h2">{rupee(v.price)}</AppText>
              </PressableScale>
            );
          })}
        </View>
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', rowGap: 8, marginTop: 8 },
  clear: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 44, paddingHorizontal: 14, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.primary },
  linesCard: { backgroundColor: colors.surface, borderRadius: radius.lg, overflow: 'hidden', ...shadow.card },
  line: { flexDirection: 'row', gap: 12, padding: 14, alignItems: 'stretch' },
  thumb: { width: 96, height: 72, borderRadius: radius.md },
  weight: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', marginTop: 6, backgroundColor: colors.backgroundAlt, borderRadius: radius.pill, paddingHorizontal: 12, height: 34 },
  couponRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.primarySoft, borderRadius: radius.lg, padding: 14 },
  giftIcon: { width: 48, height: 48, borderRadius: 14, backgroundColor: colors.accentLight, alignItems: 'center', justifyContent: 'center' },
  offerCard: { width: 262, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.surface, borderRadius: radius.md, padding: 12, borderWidth: 1.5, borderColor: colors.border },
  codeTag: { backgroundColor: colors.accentSoft, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 8 },
  barPin: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.secondarySoft, alignItems: 'center', justifyContent: 'center' },
  freeShip: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.accentSoft, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.accentLight, padding: 14 },
  track: { height: 8, borderRadius: 4, backgroundColor: colors.surface, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4, backgroundColor: colors.primary },
  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: spacing.lg, paddingTop: 12, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border },
  opt: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.border },
});
