import { useEnsureCatalog } from '../store/useCatalog';
import { API_MODE } from '../services/api';
import { layoutTransition, softIn, riseIn } from '../animations/motion';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import React, { useEffect, useMemo, useState } from 'react';
import { FlatList, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PressableScale } from '../animations/PressableScale';
import { AppText } from '../components/AppText';
import { Chip, DemoTag, Field, HeartButton, OffPill } from '../components/Atoms';
import { BrandHeader, Sheet } from '../components/BrandHeader';
import { Button } from '../components/Button';
import { ImageGallery } from '../components/ImageGallery';
import { ProductCard } from '../components/ProductCard';
import { QuantityStepper } from '../components/QuantityStepper';
import { EmptyState } from '../components/States';
import { useProduct, useProducts } from '../hooks/useShopData';
import { useStickyBar } from '../hooks/useStickyBar';
import type { RootScreenProps } from '../navigation/types';
import { useShop } from '../store/useShop';
import { toast } from '../store/useToast';
import { useCardWidth } from '../hooks/useCardWidth';
import { colors, layout, radius, shadow, spacing } from '../theme';
import { percentOff, rupee } from '../utils/format';

const TABS = ['About', 'Ingredients', 'Nutrition', 'Reviews'] as const;

export function ProductDetailScreen({ route }: RootScreenProps<'ProductDetail'>) {
  useEnsureCatalog(); // prices, stock and availability are re-read whenever this screen becomes active
  const nav = useNavigation();
  const insets = useSafeAreaInsets();
  const sticky = useStickyBar();
  const cardW = useCardWidth();
  const product = useProduct(route.params.productId);
  const all = useProducts();
  const wished = useShop((s) => s.wishlist.includes(route.params.productId));
  const toggleWishlist = useShop((s) => s.toggleWishlist);
  const addToCart = useShop((s) => s.addToCart);
  const markViewed = useShop((s) => s.markViewed);
  const address = useShop((s) => s.addresses.find((a) => a.id === s.selectedAddressId));

  const firstOk = product?.variants.find((v) => v.stock > 0) ?? product?.variants[0];
  const [variantId, setVariantId] = useState<string | undefined>(firstOk?.id);
  const [qty, setQty] = useState(1);
  const [tab, setTab] = useState<(typeof TABS)[number]>('About');
  const [added, setAdded] = useState(false);
  const [flavour, setFlavour] = useState<string | undefined>();
  const [message, setMessage] = useState('');

  useEffect(() => { setVariantId(firstOk?.id); setQty(1); setAdded(false); setTab('About'); setMessage(''); setFlavour(undefined); markViewed(route.params.productId); }, [route.params.productId]); // eslint-disable-line

  const variant = product?.variants.find((v) => v.id === variantId) ?? firstOk;
  // The price, MRP and discount must always describe the same pack: no count-up animation here (it made the price lag behind the MRP/discount when switching products).
  const priceShown = variant?.price ?? 0;
  const related = useMemo(() => {
    if (!product) return [];
    const isCake = !!product.cake;
    const others = all.filter((p) => p.id !== product.id && !!p.cake === isCake && p.variants.some((v) => v.stock > 0));
    // Same category first, then the rest of the same family (cakes with cakes, sweets/snacks with sweets/snacks).
    return [...others.filter((p) => p.categoryId === product.categoryId), ...others.filter((p) => p.categoryId !== product.categoryId)].slice(0, 6);
  }, [all, product]);

  if (!product || !variant) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <BrandHeader />
        <Sheet><EmptyState icon="alert-circle-outline" title="Product not found" message="This product may have been archived." actionLabel="Back to shop" onAction={() => nav.navigate('Main')} /></Sheet>
      </View>
    );
  }

  const out = variant.stock <= 0;
  const off = percentOff(variant.mrp, variant.price);
  const max = Math.min(20, variant.stock);

  const cake = product.cake;
  const needsFlavour = !!cake?.flavours?.length;
  const cakeOptions = cake ? { flavour: needsFlavour ? flavour : undefined, message: cake.allowsMessage && message.trim() ? message.trim() : undefined } : undefined;

  const add = (goCheckout = false) => {
    if (out) return;
    if (needsFlavour && !flavour) return toast('Please choose a flavour first', 'error');
    const r = addToCart(product.id, variant.id, qty, cakeOptions);
    if (r === 'soldout') return toast('This size is out of stock', 'error');
    if (r === 'capped') toast(`Only ${variant.stock} available. Added the maximum.`, 'info');
    if (goCheckout) { nav.navigate('Cart'); return; }
    setAdded(true);
    if (r !== 'capped') toast(`${qty} × ${product.name} (${variant.label}) added`, 'success');
    setTimeout(() => setAdded(false), 1800);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <BrandHeader actions={['wishlist', 'cart']} />
      <Sheet>
        <ScrollView testID="screen-scroll" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: sticky.clearance }}>
          <ImageGallery images={product.images} badge={product.badge} shareText={`${product.name} — Shree Hari Sweets & Snacks`} />

          <View style={{ paddingHorizontal: spacing.lg, gap: spacing.lg }}>
            <Animated.View entering={riseIn.delay(60)}>
              <View style={styles.titleRow}>
                <View style={{ flex: 1 }}>
                  <AppText variant="hero" color={colors.primary} accessibilityRole="header">{product.name}</AppText>
                  <AppText variant="bodyLg" color={colors.textMuted}>{product.tagline}</AppText>
                </View>
                <HeartButton active={wished} onPress={() => toggleWishlist(product.id)} dark={false} size={24} />
              </View>
              {!!product.demoRating && (
                <PressableScale onPress={() => setTab('Reviews')} accessibilityLabel="See reviews" style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, minHeight: 36 }}>
                  <Ionicons name="star" size={20} color={colors.accent} />
                  <AppText variant="cardTitle">{product.demoRating}</AppText>
                  <AppText variant="body" color={colors.textMuted}>({product.demoRatingCount} reviews)</AppText>
                  <DemoTag label="DEMO RATING" />
                  <Ionicons name="arrow-forward" size={16} color={colors.primary} />
                </PressableScale>
              )}
            </Animated.View>

            <View style={styles.priceRow}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap', flex: 1 }}>
                <AppText variant="amountXl" color={colors.primary}>{rupee(priceShown)}</AppText>
                {off > 0 && <AppText variant="bodyLg" color={colors.textMuted} style={styles.mrp}>{rupee(variant.mrp)}</AppText>}
                {off > 0 && <OffPill off={off} large />}
              </View>
              {off > 0 && (
                <View style={styles.offerCard}>
                  <Ionicons name="flash" size={26} color={colors.error} />
                  <View>
                    <AppText variant="weight" color={colors.error}>Special price</AppText>
                    <AppText variant="caption" color={colors.text}>You save {rupee(variant.mrp - variant.price)}</AppText>
                  </View>
                </View>
              )}
            </View>

            <View style={{ gap: spacing.lg }}>
              <View>
                <AppText variant="h2" style={{ marginBottom: 14 }}>Select Weight</AppText>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {product.variants.map((v) => {
                    const on = v.id === variant.id;
                    const sold = v.stock <= 0;
                    return (
                      <PressableScale
                        key={v.id}
                        onPress={() => { setVariantId(v.id); setQty(1); }}
                        accessibilityState={{ selected: on, disabled: sold }}
                        accessibilityLabel={`${v.label}, ${rupee(v.price)}${sold ? ', out of stock' : ''}`}
                        style={[styles.weight, on && styles.weightOn, sold && { opacity: 0.5 }]}
                      >
                        {v.popular && !sold && <View style={styles.popular}><AppText variant="badge" color={colors.onAccent}>Popular</AppText></View>}
                        <AppText variant="sectionTitle">{v.label}</AppText>
                        <AppText variant="body" color={colors.textMuted} style={sold ? { textDecorationLine: 'line-through' } : null}>{rupee(v.price)}</AppText>
                        {on && (
                          <Animated.View entering={softIn} style={styles.tick}><Ionicons name="checkmark" size={14} color={colors.white} /></Animated.View>
                        )}
                      </PressableScale>
                    );
                  })}
                </View>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <AppText variant="h2">Quantity</AppText>
                <QuantityStepper value={qty} min={1} max={Math.max(1, max)} onChange={setQty} tone="outline" height={52} label="quantity" />
              </View>
            </View>

            {!!cake && (
              <View style={{ gap: spacing.md }}>
                {needsFlavour && (
                  <View>
                    <AppText variant="h2" style={{ marginBottom: 8 }}>Flavour</AppText>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                      {cake.flavours!.map((fl) => <Chip key={fl} label={fl} active={flavour === fl} onPress={() => setFlavour(fl)} />)}
                    </View>
                  </View>
                )}
                {cake.allowsMessage && (
                  <View>
                    <Field label={`Message on cake (optional, up to ${cake.messageMaxLength} characters)`} value={message} onChangeText={(t) => setMessage(t.slice(0, cake.messageMaxLength))} placeholder="e.g. Happy Birthday Anu" maxLength={cake.messageMaxLength} />
                    <AppText variant="caption" color={colors.textMuted} style={{ marginTop: -8 }}>{message.length}/{cake.messageMaxLength}</AppText>
                  </View>
                )}
                <View style={styles.notice}>
                  <Ionicons name="information-circle-outline" size={22} color={colors.text} />
                  <AppText variant="label" color={colors.text} style={{ flex: 1 }}>{cake.notice} Delivery date and time selection is not available yet.</AppText>
                </View>
              </View>
            )}

            <View style={styles.deliver}>
              <Ionicons name="bicycle-outline" size={34} color={colors.primary} />
              <PressableScale onPress={() => nav.navigate('Addresses')} style={{ flex: 1 }} accessibilityLabel="Change delivery address">
                <AppText variant="bodyMedium" weight="semi" numberOfLines={1}>Deliver to {address ? `${address.area}, ${address.city}` : 'select address'}  ⌄</AppText>
                <AppText variant="bodyMedium" color={colors.success}>Delivery in 30 – 45 mins {API_MODE === 'mock' && <AppText variant="caption" color={colors.textMuted}>(demo slot)</AppText>}</AppText>
              </PressableScale>
              <View style={styles.divider} />
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name={out ? 'close-circle' : 'checkmark-circle'} size={26} color={out ? colors.error : colors.success} />
                <View>
                  <AppText variant="bodyMedium" color={out ? colors.error : colors.success} weight="bold">{out ? 'Out of Stock' : 'In Stock'}</AppText>
                  {!out && API_MODE === 'mock' && <AppText variant="caption" color={colors.textMuted}>Demo inventory</AppText>}
                </View>
              </View>
            </View>

            <View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {TABS.map((t) => (
                  <PressableScale key={t} onPress={() => setTab(t)} accessibilityState={{ selected: tab === t }} style={[styles.tab, tab === t && { backgroundColor: colors.primary }]}>
                    <AppText variant="bodyMedium" color={tab === t ? colors.white : colors.text} weight="semi">{t === 'Reviews' && product.demoRatingCount ? `Reviews (${product.demoRatingCount})` : t}</AppText>
                  </PressableScale>
                ))}
              </ScrollView>
              <Animated.View key={tab} entering={FadeIn.duration(250)} exiting={FadeOut.duration(100)} style={{ marginTop: spacing.md }}>
                {tab === 'About' && <AppText variant="bodyLg">{product.description}</AppText>}
                {tab === 'Ingredients' && <Notice icon="document-text-outline" text="Ingredients and allergen information will be shown here once supplied and approved by Shree Hari." />}
                {tab === 'Nutrition' && <Notice icon="nutrition-outline" text="Nutrition information has not been supplied yet. It will appear here once verified by the business." />}
                {tab === 'Reviews' && <Notice icon="chatbubbles-outline" text={API_MODE === 'mock' ? 'Verified customer reviews open after real orders. The star rating shown on this demo is sample data only.' : 'Verified customer reviews open after real orders.'} />}
              </Animated.View>
            </View>

            {product.highlights.length > 0 && (
              <View style={styles.highlights}>
                {product.highlights.map((h, i) => (
                  <View key={h.label} style={[styles.hl, i > 0 && { borderLeftWidth: 1, borderLeftColor: colors.border }]}>
                    <View style={styles.hlIcon}><Ionicons name={h.icon as keyof typeof Ionicons.glyphMap} size={26} color={colors.primary} /></View>
                    <AppText variant="caption" align="center" style={{ marginTop: 6 }}>{h.label}</AppText>
                  </View>
                ))}
              </View>
            )}
          </View>

          {related.length > 0 && (
            <View style={{ marginTop: spacing.xl }}>
              <AppText variant="h1" style={{ paddingHorizontal: spacing.lg, marginBottom: spacing.md }}>You may also like</AppText>
              <FlatList
                horizontal
                data={related}
                keyExtractor={(p) => p.id}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: layout.gutter, gap: layout.cardGap, paddingBottom: spacing.sm }}
                renderItem={({ item, index }) => <ProductCard product={item} index={index} width={cardW} />}
              />
            </View>
          )}
        </ScrollView>

        <View testID="sticky-bar" onLayout={sticky.onLayout} style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <Animated.View layout={layoutTransition} style={{ flex: 1 }}>
            {added ? (
              <Animated.View entering={softIn}>
                <Button title="Added — View Cart" icon="checkmark-circle" variant="soft" onPress={() => nav.navigate('Cart')} />
              </Animated.View>
            ) : (
              <Button title="Add to Cart" icon="cart-outline" variant="outline" disabled={out} onPress={() => add()} />
            )}
          </Animated.View>
          <View style={{ flex: 1 }}>
            <Button title={out ? 'Unavailable' : 'Buy Now'} icon="flash" disabled={out} onPress={() => add(true)} />
          </View>
        </View>
      </Sheet>
    </View>
  );
}

function Notice({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
  return (
    <View style={styles.notice}>
      <Ionicons name={icon} size={22} color={colors.text} />
      <AppText variant="body" color={colors.textMuted} style={{ flex: 1 }}>{text}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  mrp: { textDecorationLine: 'line-through', textDecorationStyle: 'solid' },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginTop: 4 },
  priceRow: { gap: 12 },
  offerCard: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.primarySoft, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 10, alignSelf: 'flex-start' },
  weight: { flex: 1, minWidth: 82, alignItems: 'center', paddingVertical: 12, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.border, minHeight: 64, justifyContent: 'center' },
  weightOn: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  popular: { position: 'absolute', top: -11, backgroundColor: colors.accent, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 2 },
  tick: { position: 'absolute', right: 8, bottom: 8, width: 22, height: 22, borderRadius: 11, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  deliver: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.backgroundAlt, borderRadius: radius.md, padding: 14, ...shadow.card },
  divider: { width: 1, alignSelf: 'stretch', backgroundColor: colors.border },
  tab: { minHeight: 44, paddingHorizontal: 18, borderRadius: radius.pill, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border },
  notice: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', backgroundColor: colors.accentSoft, borderRadius: radius.md, padding: 14 },
  highlights: { flexDirection: 'row', backgroundColor: colors.surface, borderRadius: radius.md, paddingVertical: 14 },
  hl: { flex: 1, alignItems: 'center', paddingHorizontal: 4 },
  hlIcon: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', gap: 12, paddingHorizontal: spacing.lg, paddingTop: 12, backgroundColor: colors.background, borderTopWidth: 1, borderTopColor: colors.border },
});
