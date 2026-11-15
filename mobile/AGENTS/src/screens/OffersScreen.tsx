import { layoutTransition } from '../animations/motion';
import { API_MODE } from '../services/api';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import React, { useMemo, useState } from 'react';
import { ScrollView, Share, StyleSheet, Switch, View, useWindowDimensions } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { PressableScale } from '../animations/PressableScale';
import { Reveal } from '../animations/Reveal';
import { AppText } from '../components/AppText';
import { DemoTag } from '../components/Atoms';
import { BottomSheet } from '../components/BottomSheet';
import { BrandHeader, Sheet } from '../components/BrandHeader';
import { Button } from '../components/Button';
import { CampaignCards } from '../components/CampaignCards';
import { HeroCarousel } from '../components/HeroCarousel';
import { DEMO_CONFIG } from '../data/config';
import { getRewardRules } from '../services/rules';
import { useCartView, useRewardsBalance } from '../hooks/useShopData';
import { evaluateCoupon, isCouponActive } from '../services/pricing';
import { useCatalog } from '../store/useCatalog';
import { useShop } from '../store/useShop';
import { toast } from '../store/useToast';
import { colors, fonts, radius, shadow, spacing, alpha } from '../theme';
import type { Banner } from '../types';
import { formatDateTime, rupee } from '../utils/format';

const TABS = [
  { id: 'all', label: 'All Offers', icon: 'pricetag-outline' },
  { id: 'rewards', label: 'My Rewards', icon: 'layers-outline' },
  { id: 'how', label: 'How It Works', icon: 'information-circle-outline' },
] as const;

export function OffersScreen() {
  const { width } = useWindowDimensions();
  const nav = useNavigation();
  const isTab = useRoute().name === 'OffersTab';
  const [tab, setTab] = useState<(typeof TABS)[number]['id']>('all');
  const [redeemOpen, setRedeemOpen] = useState(false);
  const coupons = useCatalog((s) => s.coupons);
  const activeCoupons = useMemo(() => coupons.filter((c) => isCouponActive(c)), [coupons]);
  const banners = useCatalog((s) => s.banners);
  const campaigns = useCatalog((s) => s.campaigns);
  const applied = useShop((s) => s.couponCode);
  const setCoupon = useShop((s) => s.setCoupon);
  const redeem = useShop((s) => s.redeemPoints);
  const setRedeem = useShop((s) => s.setRedeem);
  const ledger = useShop((s) => s.ledger);
  const { totals } = useCartView();
  const { points, rupees } = useRewardsBalance();

  const onBanner = (b: Banner) => {
    if (b.target.type === 'collection') nav.navigate('Listing', { collectionId: b.target.id, title: b.title });
    else nav.navigate('Listing', { title: 'Offers' });
  };

  const apply = (code: string) => {
    const c = coupons.find((x) => x.code === code);
    if (!c) return;
    const ev = evaluateCoupon(c, totals.subtotal);
    if (!ev.eligible) return toast(ev.reason ?? 'Not eligible', 'error');
    setCoupon(applied === code ? null : code);
    toast(applied === code ? `${code} removed` : `${code} applied to your cart`, applied === code ? 'info' : 'success');
  };

  const invite = async () => {
    try { await Share.share({ message: `Join me on Shree Hari Sweets & Snacks (demo). Use code ${DEMO_CONFIG.referralCode} for ${DEMO_CONFIG.referralPoints} demo points.` }); }
    catch { toast('Sharing is not available here', 'info'); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <BrandHeader title="Offers & Rewards" left={isTab ? 'none' : 'back'} actions={['wishlist', 'cart']}>
        <View style={styles.tabs}>
          {TABS.map((t) => {
            const on = tab === t.id;
            return (
              <PressableScale key={t.id} onPress={() => setTab(t.id)} accessibilityState={{ selected: on }} style={[styles.tab, on && { backgroundColor: colors.primary }]}>
                <Ionicons name={t.icon} size={18} color={on ? colors.onPrimary : colors.secondary} />
                <AppText variant="weight" color={on ? colors.onPrimary : colors.secondary} numberOfLines={2} style={{ flexShrink: 1, textAlign: 'center' }}>{t.label}</AppText>
              </PressableScale>
            );
          })}
        </View>
      </BrandHeader>

      <Sheet>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: spacing.md, paddingBottom: 60, gap: spacing.lg }}>
          <Reveal>
            <View style={styles.points}>
              <View style={{ alignItems: 'center', width: 68 }}>
                <Ionicons name="ribbon" size={30} color={colors.primary} />
                <AppText variant="weight" color={colors.primary} align="center">Shree Hari{'\n'}Rewards</AppText>
              </View>
              <View style={{ width: 1, alignSelf: 'stretch', backgroundColor: alpha.primary(0.15) }} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <AppText variant="h2" color={colors.primary} numberOfLines={1}>{points} Points</AppText>
                <AppText variant="caption" color={colors.textMuted} numberOfLines={1}>≈ {rupee(rupees)} Savings</AppText>
                {API_MODE === 'mock' && <View style={{ alignSelf: 'flex-start', marginTop: 2 }}><DemoTag label="DEMO" /></View>}
              </View>
              <Button title="Redeem Now" size="sm" variant="gold" iconRight={width >= 400 ? 'arrow-forward' : undefined} onPress={() => setRedeemOpen(true)} />
            </View>
          </Reveal>

          {tab === 'all' && (
            <Animated.View entering={FadeIn.duration(250)} exiting={FadeOut.duration(100)} style={{ gap: spacing.lg }}>
              <View>
                <View style={styles.head}><Ionicons name="gift-outline" size={30} color={colors.accent} /><AppText variant="sectionTitle">Today’s Special Offers</AppText></View>
                <HeroCarousel banners={banners} onPress={onBanner} />
              </View>

              {!!campaigns?.length && (
                <View>
                  <View style={styles.head}><Ionicons name="megaphone-outline" size={28} color={colors.primary} /><AppText variant="sectionTitle">Running campaigns</AppText></View>
                  <CampaignCards campaigns={campaigns} />
                </View>
              )}

              <View>
                <View style={styles.head}><Ionicons name="pricetag-outline" size={28} color={colors.primary} /><AppText variant="sectionTitle">Available Offers</AppText></View>
                <View style={styles.list}>
                  {activeCoupons.length === 0 && (
                    <View style={styles.offer}><AppText variant="body" color={colors.textMuted}>No offers are running right now. Check back soon.</AppText></View>
                  )}
                  {activeCoupons.map((c, i) => {
                    const ev = evaluateCoupon(c, totals.subtotal);
                    const expired = !!c.expiresAt && new Date(c.expiresAt) < new Date();
                    const on = applied === c.code && ev.eligible;
                    return (
                      <Animated.View key={c.code} layout={layoutTransition} style={[styles.offer, i > 0 && { borderTopWidth: 1, borderTopColor: colors.border, borderStyle: 'dashed' }, expired && { opacity: 0.55 }]}>
                        <View style={[styles.ticket, { backgroundColor: colors.primary }]}>
                          <Ionicons name={c.type === 'freeship' ? 'bicycle-outline' : 'pricetag'} size={26} color={colors.white} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <AppText variant="cardTitle" color={colors.primary}>{c.code}</AppText>
                          <AppText variant="body" numberOfLines={2}>{c.description}</AppText>
                          {(expired || !ev.eligible) && (
                            <AppText variant="caption" color={expired ? colors.error : colors.textMuted} style={{ marginTop: 2 }}>
                              {expired ? 'Expired' : ev.reason?.replace(` to use ${c.code}`, '').replace(/\s*\(min order [^)]*\)\.?/, '')}
                            </AppText>
                          )}
                        </View>
                        <Button title={expired ? 'Expired' : on ? 'Applied ✓' : 'Apply'} size="sm" variant={on ? 'soft' : 'gold'} disabled={expired} onPress={() => apply(c.code)} style={{ minWidth: 80 }} />
                      </Animated.View>
                    );
                  })}
                </View>
              </View>
            </Animated.View>
          )}

          {tab === 'rewards' && (
            <Animated.View entering={FadeIn.duration(250)} style={{ gap: spacing.md }}>
              <View style={styles.head}><Ionicons name="layers-outline" size={28} color={colors.primary} /><AppText variant="sectionTitle">Points history</AppText></View>
              <View style={styles.list}>
                {ledger.map((l, i) => (
                  <View key={l.id} style={[styles.offer, i > 0 && { borderTopWidth: 1, borderTopColor: colors.border }]}>
                    <View style={{ flex: 1 }}>
                      <AppText variant="bodyMedium" weight="semi">{l.note}</AppText>
                      <AppText variant="caption" color={colors.textMuted}>{formatDateTime(l.at)}</AppText>
                    </View>
                    <AppText variant="cardTitle" color={l.points >= 0 ? colors.success : colors.error}>{l.points >= 0 ? '+' : ''}{l.points}</AppText>
                  </View>
                ))}
              </View>
              <AppText variant="caption" color={colors.textMuted}>History is an append-only ledger: entries are added, never edited.</AppText>
            </Animated.View>
          )}

          {tab === 'how' && (
            <Animated.View entering={FadeIn.duration(250)} style={{ gap: spacing.md }}>
              {[
                { icon: 'cart-outline', t: 'Earn on every order', d: `Earn 1 point for every ₹${Math.round(1 / getRewardRules().earnPerRupee)} spent.` },
                { icon: 'swap-horizontal-outline', t: 'Redeem for discounts', d: `${Math.round(1 / getRewardRules().pointsToRupee)} points = ₹1 off your next order.` },
                { icon: 'people-outline', t: 'Refer & earn', d: `Invite friends and get ${DEMO_CONFIG.referralPoints} points each (demo rule).` },
              ].filter((x) => API_MODE === 'mock' || x.t !== 'Refer & earn').map((x) => (
                <View key={x.t} style={styles.how}>
                  <View style={styles.ticket}><Ionicons name={x.icon as keyof typeof Ionicons.glyphMap} size={26} color={colors.primary} /></View>
                  <View style={{ flex: 1 }}><AppText variant="h2">{x.t}</AppText><AppText variant="body" color={colors.textMuted}>{x.d}</AppText></View>
                </View>
              ))}
              {API_MODE === 'mock' && (<View style={{ backgroundColor: colors.accentSoft, borderRadius: radius.md, padding: 14 }}>
                <AppText variant="body">The loyalty programme, earning and redemption values, expiry and referral rewards are “business to confirm” items. These numbers are placeholders for the demo only.</AppText>
              </View>)}
            </Animated.View>
          )}

          <View style={styles.rewardsRow}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <Ionicons name="layers-outline" size={26} color={colors.primary} /><AppText variant="sectionTitle">Your Rewards</AppText>
            </View>
            <View style={{ flexDirection: 'row' }}>
              {[
                { i: 'layers-outline', t: `${points}`, s: 'Points' },
                { i: 'gift-outline', t: 'Redeem', s: 'for Discounts' },
                { i: 'refresh-outline', t: 'Earn on', s: 'Every Order' },
                { i: 'ribbon-outline', t: 'Exclusive', s: 'Member Offers' },
              ].map((x, k) => (
                <View key={x.s} style={[{ flex: 1, alignItems: 'center', paddingVertical: 6 }, k > 0 && { borderLeftWidth: 1, borderLeftColor: alpha.primary(0.12) }]}>
                  <Ionicons name={x.i as keyof typeof Ionicons.glyphMap} size={30} color={colors.primary} />
                  <AppText variant="cardTitle" color={colors.primary}>{x.t}</AppText>
                  <AppText variant="caption" color={colors.textMuted} align="center">{x.s}</AppText>
                </View>
              ))}
            </View>
          </View>

          {API_MODE === 'mock' && (
          <View style={styles.refer}>
            <View style={{ width: 66, height: 66, borderRadius: 18, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="gift" size={36} color={colors.accent} /></View>
            <View style={{ flex: 1 }}>
              <AppText variant="hero" color={colors.primary}>Refer & Earn</AppText>
              <AppText variant="body">Invite your friends to Shree Hari and get <AppText style={{ fontFamily: fonts.bold, backgroundColor: colors.accentSoft }}> {DEMO_CONFIG.referralPoints} Points </AppText> each!</AppText>
            </View>
            <Button title="Invite Now" size="sm" iconRight={width >= 400 ? 'arrow-forward' : undefined} onPress={invite} />
          </View>
          )}
        </ScrollView>
      </Sheet>

      <BottomSheet visible={redeemOpen} onClose={() => setRedeemOpen(false)} title="Redeem points">
        <View style={{ backgroundColor: colors.surface, borderRadius: radius.md, padding: 16, gap: 6, ...shadow.card }}>
          <AppText variant="h1" color={colors.primary}>{points} points ≈ {rupee(rupees)}</AppText>
          <AppText variant="body" color={colors.textMuted}>Use your points as a discount on your next order. {Math.round(1 / getRewardRules().pointsToRupee)} points = ₹1.</AppText>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: spacing.lg }}>
          <View style={{ flex: 1 }}>
            <AppText variant="h2">Apply to my cart</AppText>
            <AppText variant="caption" color={colors.textMuted}>{totals.itemCount === 0 ? 'Add items to the cart to see the saving.' : `Takes up to ${rupee(Math.min(rupees, totals.subtotal - totals.couponDiscount))} off this order.`}</AppText>
          </View>
          <Switch value={redeem} onValueChange={(v) => { setRedeem(v); toast(v ? 'Points will be applied at checkout' : 'Points not applied'); }} trackColor={{ true: colors.primary, false: colors.border }} thumbColor={colors.white} accessibilityLabel="Apply reward points to cart" />
        </View>
        <Button title={totals.itemCount ? 'Go to Cart' : 'Start Shopping'} onPress={() => { setRedeemOpen(false); nav.navigate(totals.itemCount ? 'Cart' : 'Main'); }} />
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  tabs: { flexDirection: 'row', marginTop: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, borderRadius: radius.pill, padding: 3 },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 44, paddingVertical: 4, borderRadius: radius.pill, paddingHorizontal: 6 },
  points: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.accentSoft, borderRadius: radius.lg, padding: 14, ...shadow.card },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10, paddingHorizontal: 4 },
  list: { backgroundColor: colors.surface, borderRadius: radius.lg, overflow: 'hidden', borderWidth: 1, borderColor: colors.border },
  offer: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 14 },
  ticket: { width: 46, height: 46, borderRadius: 12, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  how: { flexDirection: 'row', gap: 12, alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.md, padding: 14, ...shadow.card },
  rewardsRow: { backgroundColor: colors.primarySoft, borderRadius: radius.lg, padding: 14 },
  refer: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.accentSoft, borderRadius: radius.lg, padding: 14 },
});
