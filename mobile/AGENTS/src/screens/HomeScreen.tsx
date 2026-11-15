import { API_MODE } from '../services/api';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import React, { useCallback, useMemo, useState } from 'react';
import { FlatList, RefreshControl, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { PressableScale } from '../animations/PressableScale';
import { Reveal } from '../animations/Reveal';
import { Skeleton } from '../animations/Skeleton';
import { AppText } from '../components/AppText';
import { SearchBar, SectionHeader, DemoTag } from '../components/Atoms';
import { BrandHeader, Sheet } from '../components/BrandHeader';
import { FeatureBanner } from '../components/FeatureBanner';
import { HeroCarousel } from '../components/HeroCarousel';
import { CampaignCards } from '../components/CampaignCards';
import { OfferPopup } from '../components/OfferPopup';
import { PromoSections } from '../components/PromoSections';
import { ProductCard } from '../components/ProductCard';
import { ProductImage } from '../components/ProductImage';
import { ErrorState } from '../components/States';
import { useCardWidth } from '../hooks/useCardWidth';
import { useProducts } from '../hooks/useShopData';
import { percentOff } from '../utils/format';
import { useCatalog, useEnsureCatalog } from '../store/useCatalog';
import { collectionCategoryIds } from '../utils/collections';
import { useShop } from '../store/useShop';
import { cardSize, colors, control, fonts, layout, radius, shadow, spacing } from '../theme';
import type { Banner } from '../types';

const HOME_TILES = [
  { id: 'sweets', label: 'Sweets', image: 'milk-sweets', collection: 'sweets' },
  { id: 'cakes', label: 'Cakes', image: 'cake-chocolate', collection: 'cakes' },
  { id: 'snacks', label: 'Snacks', image: 'mixture', collection: 'snacks' },
  { id: 'savouries', label: 'Savouries', image: 'murukku', collection: 'savouries' },
  { id: 'gift', label: 'Gift Boxes', image: 'gift-boxes', collection: 'gift-boxes' },
  { id: 'combos', label: 'Combos', image: 'combo-packs', collection: 'combos' },
  { id: 'offers', label: 'Offers', image: '', collection: '' },
];

export function HomeScreen() {
  const { width } = useWindowDimensions();
  const nav = useNavigation();
  useEnsureCatalog();
  const { status, banners, popups, sections, campaigns, load, error, collections, categories } = useCatalog();
  const products = useProducts();
  const address = useShop((s) => s.addresses.find((a) => a.id === s.selectedAddressId));
  const [refreshing, setRefreshing] = useState(false);
  const recentIds = useShop((s) => s.recentlyViewed);
  const wishIds = useShop((s) => s.wishlist);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load({ silent: true });
    setRefreshing(false);
  }, [load]);

  // Biggest real discount in the catalogue (MRP vs selling price), so the strip never advertises a made-up number.
  const maxOff = useMemo(() => products.reduce((m, p) => p.variants.reduce((mm, v) => Math.max(mm, percentOff(v.mrp, v.price)), m), 0), [products]);

  const shelves = useMemo(() => {
    const byId = new Map(products.map((p) => [p.id, p]));
    const recent = recentIds.map((id) => byId.get(id)).filter(Boolean) as typeof products;
    // Recommended: same categories as what the customer viewed or saved; falls back to festive picks for new visitors.
    const interest = new Set([...recent.map((p) => p.categoryId), ...wishIds.map((id) => byId.get(id)?.categoryId).filter(Boolean) as string[]]);
    const seen = new Set([...recentIds, ...wishIds]);
    let rec = products.filter((p) => interest.has(p.categoryId) && !seen.has(p.id));
    if (rec.length < 4) rec = [...rec, ...products.filter((p) => p.featured?.festive && !rec.includes(p))];
    return {
      best: products.filter((p) => p.featured?.bestseller && !p.tags.includes('cake')),
      cakes: products.filter((p) => p.tags.includes('cake')),
      // The catalogue is ordered oldest to newest, so reverse it: the newest product is the first one in the New Arrivals shelf.
      fresh: products.filter((p) => p.featured?.newArrival).reverse(),
      festive: products.filter((p) => p.featured?.festive),
      recent,
      rec: rec.slice(0, 8),
    };
  }, [products, recentIds, wishIds]);

  // Show a category circle only when it has at least one product; "Offers" always stays.
  const tiles = useMemo(() => HOME_TILES.filter((t) => {
    if (t.id === 'offers') return true;
    const ids = collectionCategoryIds(t.collection, collections, categories);
    return products.some((p) => ids.includes(p.categoryId));
  }), [products, collections, categories]);
  const hasGift = useMemo(() => {
    const ids = collectionCategoryIds('gift-boxes', collections, categories);
    return products.some((p) => ids.includes(p.categoryId));
  }, [products, collections, categories]);

  const onBanner = (b: Banner) => {
    if (b.target.type === 'collection') nav.navigate('Listing', { collectionId: b.target.id, title: b.title });
    else if (b.target.type === 'offers') nav.navigate('Offers');
    else nav.navigate('Listing', { q: b.target.q });
  };

  const loading = status === 'loading' || status === 'idle';

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <BrandHeader left="none" actions={['wishlist', 'cart']}>
        <View style={styles.deliveryRow}>
          <PressableScale onPress={() => nav.navigate('Addresses')} style={styles.loc} accessibilityLabel="Change delivery address">
            <Ionicons name="location" size={24} color={colors.secondary} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                <AppText variant="link" color={colors.primary} numberOfLines={1} style={{ flexShrink: 1, fontFamily: fonts.bold }}>
                  {address ? `Deliver to ${address.label}` : 'Choose location'}
                </AppText>
                <Ionicons name="chevron-down" size={16} color={colors.text} />
              </View>
              <AppText variant="caption" color={colors.text} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>
                {address ? `${address.area}, ${address.city} - ${address.pincode}` : 'Use GPS or add address'}
              </AppText>
            </View>
          </PressableScale>
          <View style={styles.eta} accessibilityLabel={API_MODE === 'mock' ? 'Delivery in 30 to 45 minutes, demo slot' : 'Delivery in 30 to 45 minutes'}>
            <MaterialCommunityIcons name="moped" size={24} color={colors.primary} />
            <View>
              <AppText variant="caption" color={colors.text}>Delivery in</AppText>
              <AppText variant="link" color={colors.primary} weight="bold">30 – 45 mins</AppText>
            </View>
            {API_MODE === 'mock' && <View style={styles.etaTag}><DemoTag /></View>}
          </View>
        </View>
        <View style={{ marginTop: spacing.md }}>
          <SearchBar value="" placeholder="Search for sweets, snacks, combos…" onPress={() => nav.navigate('Listing', { focus: true })} mic onMic={() => nav.navigate('Listing', { focus: true, voice: true })} />
        </View>
      </BrandHeader>

      <Sheet>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingTop: spacing.lg, paddingBottom: layout.scrollBottom, gap: layout.sectionGap }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />}
        >
          {API_MODE === 'mock' && (
            <View style={styles.demoRibbon} accessibilityRole="alert">
              <AppText variant="captionMedium" color={colors.primaryPressed} style={{ textAlign: 'center' }}>Demo data. This app is not connected to the store, so products added in the admin panel will not appear here.</AppText>
            </View>
          )}
          {status === 'error' ? (
            <ErrorState message={error} onRetry={() => load()} />
          ) : (
            <>
              {/* <WeatherChip /> */}
              {loading ? (
                <View style={{ paddingHorizontal: spacing.lg }}><Skeleton height={168} radius={radius.lg} /></View>
              ) : (
                <Reveal><HeroCarousel banners={banners} onPress={onBanner} /></Reveal>
              )}

              {tiles.length > 1 && <View>
                <FlatList
                  data={tiles}
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  keyExtractor={(t) => t.id}
                  contentContainerStyle={{ paddingHorizontal: layout.gutter, gap: layout.cardGap }}
                  renderItem={({ item, index }) => (
                    <Reveal index={index} step={55}>
                      <PressableScale
                        accessibilityLabel={item.label}
                        onPress={() => (item.id === 'offers' ? nav.navigate('Offers') : nav.navigate('Listing', { collectionId: item.collection, title: item.label }))}
                        style={{ alignItems: 'center', width: 78 }}
                      >
                        <View style={styles.tile}>
                          {item.image ? <ProductImage image={item.image} style={{ width: '100%', height: '100%' }} /> : <Ionicons name="pricetag" size={40} color={colors.primary} />}
                        </View>
                        <AppText variant="label" style={{ marginTop: spacing.sm }} numberOfLines={1}>{item.label}</AppText>
                      </PressableScale>
                    </Reveal>
                  )}
                />
              </View>}

              <Reveal index={2} style={{ paddingHorizontal: spacing.lg }}>
                <PressableScale onPress={() => nav.navigate('Offers')} accessibilityLabel={maxOff > 0 ? `Today's offers, up to ${maxOff} percent off. Explore` : "Today's offers. Explore"} style={styles.offerStrip}>
                  <View style={styles.offerIcon}><AppText variant="h1" color={colors.white} weight="bold">%</AppText></View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <AppText variant="sectionTitle" color={colors.text} numberOfLines={2}>Today’s Offers</AppText>
                    <AppText variant="sectionSubtitle" color={colors.primary} numberOfLines={2}>Sweet deals you’ll love!</AppText>
                  </View>
                  {maxOff > 0 && (
                    <>
                      <View style={styles.offerDivider} />
                      <View style={{ alignItems: 'flex-start' }}>
                        <AppText variant="badge" color={colors.text} style={{ letterSpacing: 1 }}>UPTO</AppText>
                        <AppText variant="h2" color={colors.primary} weight="bold" numberOfLines={1}>{maxOff}% OFF</AppText>
                      </View>
                    </>
                  )}
                  <View style={styles.exploreBtn}>
                    <AppText variant="buttonSm" color={colors.onAccent}>Explore</AppText>
                    {width >= 400 && <Ionicons name="arrow-forward" size={16} color={colors.onAccent} />}
                  </View>
                </PressableScale>
              </Reveal>

              {!loading && !!campaigns?.length && <View style={{ paddingHorizontal: spacing.lg }}><CampaignCards campaigns={campaigns} onPress={() => nav.navigate('Offers')} /></View>}
              {!loading && <PromoSections sections={sections} onPress={onBanner} />}

              {shelves.recent.length > 0 && <Shelf title="Recently viewed" subtitle="Pick up where you left off" icon="time" iconColor={colors.primary} loading={false} items={shelves.recent} onAll={() => nav.navigate('Listing', { title: 'Recently viewed', productIds: shelves.recent.map((p) => p.id) })} />}
              <Shelf title="Bestsellers" subtitle="Our most loved sweets & snacks" icon="flame" loading={loading} items={shelves.best} onAll={() => nav.navigate('Listing', { title: 'Bestsellers', productIds: shelves.best.map((p) => p.id) })} />
              <Shelf title="Fresh Cakes" subtitle="For birthdays and celebrations" icon="cafe" iconColor={colors.primary} loading={loading} items={shelves.cakes} onAll={() => nav.navigate('Listing', { title: 'Cakes', productIds: shelves.cakes.map((p) => p.id) })} />
              <Shelf title="New Arrivals" subtitle="Fresh additions to the counter" icon="sparkles" iconColor={colors.accent} loading={loading} items={shelves.fresh} onAll={() => nav.navigate('Listing', { title: 'New Arrivals', productIds: shelves.fresh.map((p) => p.id) })} />

              {hasGift && (
                <Reveal style={{ paddingHorizontal: spacing.lg }}>
                  <FeatureBanner
                    title="Gift Happiness" subtitle="Premium sweet boxes for every occasion" image="cat-gift" icon="gift" cta="Shop gifts"
                    onPress={() => nav.navigate('Listing', { collectionId: 'gift-boxes', title: 'Gift Boxes' })}
                  />
                </Reveal>
              )}

              <Shelf title="Recommended for you" subtitle="Based on what you browse" icon="sparkles" iconColor={colors.accent} loading={loading} items={shelves.rec} onAll={() => nav.navigate('Listing', { title: 'Recommended', productIds: shelves.rec.map((p) => p.id) })} />
              <Shelf title="Festive Picks" subtitle="Seasonal favourites" icon="gift" iconColor={colors.primary} loading={loading} items={shelves.festive} onAll={() => nav.navigate('Listing', { title: 'Festive Picks', productIds: shelves.festive.map((p) => p.id) })} />
            </>
          )}
        </ScrollView>
      </Sheet>
      <OfferPopup popups={popups} ready={status === 'ready'} onOpen={onBanner} />
    </View>
  );
}

function Shelf({ title, subtitle, icon, iconColor, items, loading, onAll }: {
  title: string; subtitle: string; icon: keyof typeof Ionicons.glyphMap; iconColor?: string; items: ReturnType<typeof useProducts>; loading: boolean; onAll: () => void;
}) {
  const cardW = useCardWidth();
  if (!loading && items.length === 0) return null; // no products: no section
  return (
    <View>
      <SectionHeader title={title} subtitle={subtitle} icon={icon} iconColor={iconColor} action="View All" onAction={onAll} />
      {loading ? (
        <View style={{ flexDirection: 'row', gap: layout.cardGap, paddingHorizontal: layout.gutter }}>
          {[0, 1].map((i) => (
            <View key={i} style={{ width: cardW }}>
              <Skeleton height={cardW / cardSize.productImageRatio} radius={radius.lg} />
              <Skeleton height={16} width="70%" style={{ marginTop: spacing.md }} />
              <Skeleton height={14} width="45%" style={{ marginTop: spacing.sm }} />
              <Skeleton height={control.buttonSm} style={{ marginTop: spacing.md }} radius={radius.pill} />
            </View>
          ))}
        </View>
      ) : (
        <FlatList
          data={items}
          horizontal
          showsHorizontalScrollIndicator={false}
          keyExtractor={(p) => p.id}
          snapToInterval={cardW + layout.cardGap}
          decelerationRate="fast"
          contentContainerStyle={{ paddingHorizontal: layout.gutter, gap: layout.cardGap, paddingBottom: spacing.sm }}
          renderItem={({ item, index }) => <ProductCard product={item} index={index} width={cardW} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  demoRibbon: { marginHorizontal: spacing.lg, padding: 10, borderRadius: radius.md, backgroundColor: colors.accentSoft, borderWidth: 1, borderColor: colors.accent },
  deliveryRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  loc: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  eta: {
    flexShrink: 0, flexDirection: 'row', alignItems: 'center', gap: spacing.xs, backgroundColor: colors.accentSoft,
    borderWidth: 1, borderColor: colors.accent, borderRadius: radius.pill, paddingHorizontal: spacing.sm + 2, paddingVertical: spacing.sm,
  },
  etaTag: { position: 'absolute', top: -9, right: 10 },
  tile: { width: 78, height: 78, borderRadius: radius.md, backgroundColor: colors.backgroundAlt, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', ...shadow.card },
  offerStrip: {
    flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.accentSoft, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.accentLight, paddingVertical: 12, paddingHorizontal: 10,
  },
  offerIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '-8deg' }] },
  offerDivider: { width: 1, alignSelf: 'stretch', marginVertical: 4, backgroundColor: colors.accentLight },
  exploreBtn: { flexDirection: 'row', gap: 6, backgroundColor: colors.accent, borderRadius: radius.pill, paddingHorizontal: spacing.md, height: control.buttonSm, flexShrink: 0, alignItems: 'center', justifyContent: 'center' },
});
