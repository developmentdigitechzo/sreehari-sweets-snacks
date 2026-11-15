import { Ionicons } from '@expo/vector-icons';
import { API_MODE } from '../services/api';
import { useNavigation, useRoute } from '@react-navigation/native';
import React, { useEffect, useMemo, useState } from 'react';
import { FlatList, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PressableScale } from '../animations/PressableScale';
import { Skeleton } from '../animations/Skeleton';
import { AppText } from '../components/AppText';
import { Chip, SearchBar } from '../components/Atoms';
import { useVoiceSearch } from '../services/voiceSearch';
import { BottomSheet } from '../components/BottomSheet';
import { BrandHeader, Sheet } from '../components/BrandHeader';
import { Button } from '../components/Button';
import { CartBar } from '../components/CartBar';
import { ProductCard } from '../components/ProductCard';
import { EmptyState, ErrorState } from '../components/States';
import { useCardWidth } from '../hooks/useCardWidth';
import { useDebounce } from '../hooks/useDebounce';
import { useProducts } from '../hooks/useShopData';
import { useCatalog, useEnsureCatalog } from '../store/useCatalog';
import { useShop } from '../store/useShop';
import { colors, fonts, layout, radius, spacing, type } from '../theme';
import type { Product } from '../types';
import { percentOff } from '../utils/format';
import { POPULAR_SEARCHES, scoreProduct } from '../utils/search';
import { collectionCategoryIds } from '../utils/collections';

type Price = 'any' | 'u200' | 'mid' | 'o400';
type Weight = 'any' | '250 g' | '500 g' | '1 kg';
type Sort = 'relevance' | 'price_asc' | 'price_desc' | 'discount' | 'rating';
type Filters = { price: Price; weight: Weight; offers: boolean; inStock: boolean };
const NO_FILTERS: Filters = { price: 'any', weight: 'any', offers: false, inStock: false };

const PRICE_OPTS: { id: Price; label: string }[] = [
  { id: 'any', label: 'Any price' }, { id: 'u200', label: 'Under ₹200' }, { id: 'mid', label: '₹200 – ₹400' }, { id: 'o400', label: 'Above ₹400' },
];
const WEIGHT_OPTS: Weight[] = ['any', '250 g', '500 g', '1 kg'];
const SORT_OPTS: { id: Sort; label: string }[] = [
  { id: 'relevance', label: 'Relevance' }, { id: 'price_asc', label: 'Price: Low to High' }, { id: 'price_desc', label: 'Price: High to Low' },
  { id: 'discount', label: 'Biggest discount' },
  ...(API_MODE === 'mock' ? [{ id: 'rating' as const, label: 'Rating (demo data)' }] : []),
];
const PAGE = 6;

const startPrice = (p: Product) => Math.min(...p.variants.filter((v) => v.stock > 0).map((v) => v.price), ...p.variants.map((v) => v.price));
const bestOff = (p: Product) => Math.max(...p.variants.map((v) => percentOff(v.mrp, v.price)));

export function SearchScreen() {
  const nav = useNavigation();
  const route = useRoute();
  const params = (route.params ?? {}) as { q?: string; collectionId?: string; productIds?: string[]; categoryId?: string; title?: string; focus?: boolean; voice?: boolean };
  const isTab = route.name === 'Search';
  const insets = useSafeAreaInsets();
  const cardW = useCardWidth();

  useEnsureCatalog();
  const { collections, categories, status, load, error } = useCatalog();
  const products = useProducts();
  const recent = useShop((s) => s.recentSearches);
  const addRecent = useShop((s) => s.addRecent);
  const clearRecent = useShop((s) => s.clearRecent);

  const [q, setQ] = useState(params.q ?? '');
  const [collection, setCollection] = useState<string | undefined>(params.collectionId);
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [draft, setDraft] = useState<Filters>(NO_FILTERS);
  const [sort, setSort] = useState<Sort>('relevance');
  const [sheet, setSheet] = useState<null | 'filters' | 'price' | 'weight' | 'sort'>(null);
  const [page, setPage] = useState(1);

  // React to param changes when the tab is re-entered from Home search / category links.
  useEffect(() => {
    setQ(params.q ?? '');
    setCollection(params.collectionId);
    setFilters(NO_FILTERS);
    setSort('relevance');
    setPage(1);
  }, [params.q, params.collectionId, params.categoryId, params.title, params.productIds]);

  const dq = useDebounce(q, 250);
  useEffect(() => setPage(1), [dq, collection, filters, sort]);

  const catMap = useMemo(() => Object.fromEntries(categories.map((c) => [c.id, c])), [categories]);
  const scope = collections.find((c) => c.id === collection);
  // A collection must always narrow the list: if the store has no such collection, fall back to the category tree (never "everything").
  const scopeCategoryIds = useMemo(() => (collection ? collectionCategoryIds(collection, collections, categories) : null), [collection, collections, categories]);
  const productIdScope = useMemo(() => (params.productIds ? new Set(params.productIds) : null), [params.productIds]);

  const results = useMemo(() => {
    let list = products
      .map((p) => ({ p, s: scoreProduct(p, dq, catMap) }))
      .filter((x) => x.s > 0)
      .filter((x) => !scopeCategoryIds || scopeCategoryIds.includes(x.p.categoryId))
      .filter((x) => !productIdScope || productIdScope.has(x.p.id))
      .filter((x) => !params.categoryId || x.p.categoryId === params.categoryId);
    if (filters.price !== 'any') {
      list = list.filter(({ p }) => {
        const sp = startPrice(p);
        return filters.price === 'u200' ? sp < 200 : filters.price === 'mid' ? sp >= 200 && sp <= 400 : sp > 400;
      });
    }
    if (filters.weight !== 'any') list = list.filter(({ p }) => p.variants.some((v) => v.label === filters.weight));
    if (filters.offers) list = list.filter(({ p }) => bestOff(p) > 0);
    if (filters.inStock) list = list.filter(({ p }) => p.variants.some((v) => v.stock > 0));
    const sorters: Record<Sort, (a: { p: Product; s: number }, b: { p: Product; s: number }) => number> = {
      relevance: (a, b) => b.s - a.s,
      price_asc: (a, b) => startPrice(a.p) - startPrice(b.p),
      price_desc: (a, b) => startPrice(b.p) - startPrice(a.p),
      discount: (a, b) => bestOff(b.p) - bestOff(a.p),
      rating: (a, b) => (b.p.demoRating ?? 0) - (a.p.demoRating ?? 0),
    };
    return list.sort(sorters[sort]).map((x) => x.p);
  }, [products, dq, scopeCategoryIds, productIdScope, filters, sort, catMap, params.categoryId]);

  const activeFilterCount = (filters.price !== 'any' ? 1 : 0) + (filters.weight !== 'any' ? 1 : 0) + (filters.offers ? 1 : 0) + (filters.inStock ? 1 : 0);
  const hasScope = !!(params.collectionId || params.categoryId || params.title);
  const showDiscover = !dq && !hasScope && !collection && activeFilterCount === 0;
  const loading = status === 'loading' || status === 'idle';
  const typing = q.trim().length > 0 ? products.filter((p) => scoreProduct(p, q, catMap) > 0).slice(0, 4) : [];

  const submit = () => { if (q.trim()) addRecent(q.trim()); };
  // Voice search: words appear in the box as they are recognised; the finished sentence is kept in recent searches.
  const voice = useVoiceSearch((text, final) => { setQ(text); if (final) addRecent(text); });
  const startVoice = voice.start;
  useEffect(() => { if (params.voice) void startVoice(); }, [params.voice, startVoice]);
  const heading = dq ? <>Search Results for <AppText style={styles.hl}>“{dq}”</AppText></> : <>{params.title ?? scope?.name ?? 'All Products'}</>;
  const visible = results.slice(0, page * PAGE);

  const header = (
    <View>
      {showDiscover && (
        <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.lg, gap: spacing.lg }}>
          {recent.length > 0 && (
            <View>
              <View style={styles.rowBetween}>
                <AppText variant="h2">Recent searches</AppText>
                <PressableScale onPress={clearRecent} accessibilityLabel="Clear recent searches" style={{ minHeight: 36, justifyContent: 'center' }}>
                  <AppText variant="captionMedium" color={colors.primary}>Clear</AppText>
                </PressableScale>
              </View>
              <View style={styles.chips}>{recent.map((r) => <Chip key={r} icon="time-outline" label={r} onPress={() => setQ(r)} />)}</View>
            </View>
          )}
          <View>
            <AppText variant="h2" style={{ marginBottom: 8 }}>Popular searches <AppText variant="caption" color={colors.textMuted}>(sample)</AppText></AppText>
            <View style={styles.chips}>{POPULAR_SEARCHES.map((r) => <Chip key={r} icon="trending-up" label={r} onPress={() => { setQ(r); addRecent(r); }} />)}</View>
          </View>
        </View>
      )}

      {!showDiscover && (
        <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.lg }}>
          <AppText variant="sectionTitle" accessibilityRole="header">
            {heading}{'  '}
            <AppText variant="body" color={colors.textMuted}>({results.length} {results.length === 1 ? 'product' : 'products'})</AppText>
          </AppText>
        </View>
      )}

      <FlatList
        horizontal
        data={[{ id: 'all', name: 'All' }, ...collections]}
        showsHorizontalScrollIndicator={false}
        keyExtractor={(c) => c.id}
        contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingVertical: spacing.md, gap: 8 }}
        renderItem={({ item }) => (
          <Chip label={item.name} active={item.id === 'all' ? !collection : collection === item.id} onPress={() => setCollection(item.id === 'all' ? undefined : item.id)} />
        )}
      />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: 8, paddingBottom: spacing.md }}>
        <View>
          <Chip icon="options-outline" label="Filters" onPress={() => { setDraft(filters); setSheet('filters'); }} />
          {activeFilterCount > 0 && <View style={styles.dot}><AppText variant="badge" color={colors.onAccent}>{activeFilterCount}</AppText></View>}
        </View>
        <Chip label={filters.price === 'any' ? 'Price' : PRICE_OPTS.find((o) => o.id === filters.price)!.label} trailing="chevron-down" active={filters.price !== 'any'} onPress={() => setSheet('price')} />
        <Chip label={filters.weight === 'any' ? 'Weight' : filters.weight} trailing="chevron-down" active={filters.weight !== 'any'} onPress={() => setSheet('weight')} />
        <Chip label="Offers" active={filters.offers} onPress={() => setFilters((f) => ({ ...f, offers: !f.offers }))} />
        <Chip icon="swap-vertical" label="Sort By" trailing="chevron-down" active={sort !== 'relevance'} onPress={() => setSheet('sort')} />
      </ScrollView>
      {typing.length > 0 && dq !== q.trim() && (
        <View style={{ paddingHorizontal: spacing.lg, paddingBottom: 8 }}>
          <AppText variant="caption" color={colors.textMuted}>Suggestions</AppText>
          <View style={styles.chips}>{typing.map((p) => <Chip key={p.id} label={p.name} onPress={() => { setQ(p.name); addRecent(p.name); }} />)}</View>
        </View>
      )}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <BrandHeader left={isTab ? 'none' : 'back'} actions={['wishlist', 'cart']}>
        <View style={{ marginTop: spacing.md }}>
          <SearchBar value={q} onChangeText={setQ} onClear={() => setQ('')} onSubmit={submit} placeholder={voice.listening ? 'Listening… speak now' : 'Search sweets, snacks, combos…'} autoFocus={!!params.focus && !params.voice} mic onMic={voice.toggle} listening={voice.listening} />
        </View>
      </BrandHeader>
      <Sheet>
        {status === 'error' ? (
          <ErrorState message={error} onRetry={() => load()} />
        ) : (
          <FlatList
            data={loading ? [] : visible}
            numColumns={2}
            keyExtractor={(p) => p.id}
            ListHeaderComponent={header}
            columnWrapperStyle={{ gap: layout.cardGap, paddingHorizontal: layout.gutter, marginBottom: layout.cardGap }}
            contentContainerStyle={{ paddingBottom: insets.bottom + layout.scrollBottom }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            onEndReachedThreshold={0.4}
            onEndReached={() => { if (visible.length < results.length) setPage((p) => p + 1); }}
            refreshing={false}
            onRefresh={() => load({ silent: true })}
            renderItem={({ item, index }) => <ProductCard product={item} index={index % PAGE} width={cardW} />}
            ListEmptyComponent={
              loading ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: layout.cardGap, paddingHorizontal: layout.gutter }}>
                  {[0, 1, 2, 3].map((i) => (
                    <View key={i} style={{ width: cardW }}>
                      <Skeleton height={128} radius={radius.lg} />
                      <Skeleton height={16} width="70%" style={{ marginTop: 10 }} />
                      <Skeleton height={14} width="50%" style={{ marginTop: 8 }} />
                      <Skeleton height={34} radius={radius.pill} style={{ marginTop: 10 }} />
                    </View>
                  ))}
                </View>
              ) : (
                <EmptyState
                  icon="search-outline"
                  title={dq ? `No results for “${dq}”` : 'No products match'}
                  message={activeFilterCount ? 'Try removing a filter, or search something different.' : 'Try a different spelling, or browse our popular picks.'}
                  actionLabel={activeFilterCount ? 'Clear filters' : 'Clear search'}
                  onAction={() => { setFilters(NO_FILTERS); setQ(''); setCollection(undefined); }}
                  secondaryLabel="Browse categories"
                  onSecondary={() => nav.navigate('Main', { screen: 'Categories' })}
                />
              )
            }
            ListFooterComponent={visible.length < results.length ? <Skeleton height={20} width={120} style={{ alignSelf: 'center', marginVertical: 12 }} /> : undefined}
          />
        )}
      </Sheet>
      <CartBar safeBottom onPress={() => nav.navigate('Cart')} />

      <BottomSheet visible={sheet === 'filters'} onClose={() => setSheet(null)} title="Filters">
        <AppText variant="h2" style={{ marginBottom: 8 }}>Price</AppText>
        <View style={styles.chips}>{PRICE_OPTS.map((o) => <Chip key={o.id} label={o.label} active={draft.price === o.id} onPress={() => setDraft((d) => ({ ...d, price: o.id }))} />)}</View>
        <AppText variant="h2" style={{ marginVertical: 8 }}>Weight</AppText>
        <View style={styles.chips}>{WEIGHT_OPTS.map((w) => <Chip key={w} label={w === 'any' ? 'Any' : w} active={draft.weight === w} onPress={() => setDraft((d) => ({ ...d, weight: w }))} />)}</View>
        <AppText variant="h2" style={{ marginVertical: 8 }}>More</AppText>
        <View style={styles.chips}>
          <Chip icon="pricetag-outline" label="Offers only" active={draft.offers} onPress={() => setDraft((d) => ({ ...d, offers: !d.offers }))} />
          <Chip icon="checkmark-circle-outline" label="In stock only" active={draft.inStock} onPress={() => setDraft((d) => ({ ...d, inStock: !d.inStock }))} />
        </View>
        <View style={{ flexDirection: 'row', gap: 10, marginTop: spacing.xl }}>
          <Button title="Reset" variant="outline" style={{ flex: 1 }} onPress={() => { setDraft(NO_FILTERS); setFilters(NO_FILTERS); setSheet(null); }} />
          <Button title="Apply" style={{ flex: 1 }} onPress={() => { setFilters(draft); setSheet(null); }} />
        </View>
      </BottomSheet>

      <BottomSheet visible={sheet === 'price'} onClose={() => setSheet(null)} title="Price">
        <OptionList options={PRICE_OPTS.map((o) => ({ id: o.id, label: o.label }))} value={filters.price} onPick={(id) => { setFilters((f) => ({ ...f, price: id as Price })); setSheet(null); }} />
      </BottomSheet>
      <BottomSheet visible={sheet === 'weight'} onClose={() => setSheet(null)} title="Weight">
        <OptionList options={WEIGHT_OPTS.map((w) => ({ id: w, label: w === 'any' ? 'Any weight' : w }))} value={filters.weight} onPick={(id) => { setFilters((f) => ({ ...f, weight: id as Weight })); setSheet(null); }} />
      </BottomSheet>
      <BottomSheet visible={sheet === 'sort'} onClose={() => setSheet(null)} title="Sort by">
        <OptionList options={SORT_OPTS} value={sort} onPick={(id) => { setSort(id as Sort); setSheet(null); }} />
      </BottomSheet>
    </View>
  );
}

function OptionList({ options, value, onPick }: { options: { id: string; label: string }[]; value: string; onPick: (id: string) => void }) {
  return (
    <View style={{ gap: 8 }}>
      {options.map((o) => {
        const on = o.id === value;
        return (
          <PressableScale key={o.id} onPress={() => onPick(o.id)} accessibilityState={{ selected: on }} style={[styles.option, on && { borderColor: colors.primary, backgroundColor: colors.primarySoft }]}>
            <AppText variant="bodyMedium" style={{ flex: 1, fontFamily: on ? fonts.semi : fonts.medium }}>{o.label}</AppText>
            <Ionicons name={on ? 'radio-button-on' : 'radio-button-off'} size={22} color={on ? colors.primary : colors.textMuted} />
          </PressableScale>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  hl: { ...type.highlight, color: colors.primary },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  dot: { position: 'absolute', top: -2, right: -2, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  option: { flexDirection: 'row', alignItems: 'center', minHeight: 52, paddingHorizontal: 16, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.border },
});
