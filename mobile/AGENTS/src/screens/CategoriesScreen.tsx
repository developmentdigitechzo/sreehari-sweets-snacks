import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { PressableScale } from '../animations/PressableScale';
import { Reveal } from '../animations/Reveal';
import { Skeleton } from '../animations/Skeleton';
import { AppText } from '../components/AppText';
import { SectionHeader } from '../components/Atoms';
import { BrandHeader, Sheet } from '../components/BrandHeader';
import { ProductImage } from '../components/ProductImage';
import { ErrorState } from '../components/States';
import { FeatureBanner } from '../components/FeatureBanner';
import { useCatalog, useEnsureCatalog } from '../store/useCatalog';
import { colors, gradients, layout, radius, shadow, spacing, alpha } from '../theme';
import type { Collection } from '../types';

const TILE_GAP = 10;

export function CategoriesScreen() {
  const nav = useNavigation();
  const { width: screenW } = useWindowDimensions();
  // 4 columns on phones, 5 on wide screens. Width is what is really left after the page padding and the gaps, so rows always fill the line.
  const cols = screenW >= 480 ? 5 : 4;
  const tileW = Math.floor((Math.min(screenW, layout.maxContentWidth) - spacing.lg * 2 - TILE_GAP * (cols - 1)) / cols);
  useEnsureCatalog();
  const { collections, categories, status, load, error } = useCatalog();
  const loading = status === 'loading' || status === 'idle';
  const WIDE = ['cakes', 'gift-boxes'];
  const grid = collections.filter((c) => !WIDE.includes(c.id));
  const wide = WIDE.map((id) => collections.find((c) => c.id === id)).filter(Boolean) as Collection[];
  const sub = categories.filter((c) => c.parentId);

  const open = (c: Collection) => nav.navigate('Listing', { collectionId: c.id, title: c.name });

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <BrandHeader actions={['search', 'cart']} title="Categories" subtitle="Explore our delightful range" left="none" />
      <Sheet>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: spacing.lg, paddingBottom: layout.scrollBottom, gap: spacing.xl }}>
          {status === 'error' ? (
            <ErrorState message={error} onRetry={() => load()} />
          ) : loading ? (
            <>
              <View style={styles.grid}>{[0, 1, 2, 3].map((i) => <Skeleton key={i} height={120} radius={radius.lg} style={{ width: '48%' }} />)}</View>
              <Skeleton height={110} radius={radius.lg} />
            </>
          ) : (
            <>
              <View style={styles.grid}>
                {grid.map((c, i) => <CollectionCard key={c.id} c={c} index={i} onPress={() => open(c)} />)}
              </View>
              {wide.map((c, i) => (
                <Reveal key={c.id} index={4 + i}>
                  <FeatureBanner
                    title={c.name} subtitle={c.subtitle} image={c.imageKey} icon={c.id === 'cakes' ? 'cafe-outline' : 'gift-outline'}
                    cta={c.id === 'cakes' ? 'Order cakes' : 'Shop gifts'} onPress={() => open(c)}
                  />
                </Reveal>
              ))}

              <View>
                <SectionHeader title="All Categories" icon="flame" action="View All Products" onAction={() => nav.navigate('Listing', { title: 'All Products' })} />
                <View style={styles.tiles}>
                  {sub.map((c, i) => (
                    <Reveal key={c.id} index={i} step={45} style={{ width: tileW }}>
                      <PressableScale onPress={() => nav.navigate('Listing', { categoryId: c.id, title: c.name })} accessibilityLabel={c.name} style={styles.tile}>
                        <ProductImage image={c.imageUri ? { id: c.id, uri: c.imageUri } : c.imageKey} style={{ width: '100%', aspectRatio: 1.15, borderRadius: radius.sm }} />
                        <AppText variant="navLabel" align="center" style={{ marginTop: 6, minHeight: 28 }} numberOfLines={2}>{c.name}</AppText>
                      </PressableScale>
                    </Reveal>
                  ))}
                </View>
              </View>

              <Reveal index={6}>
                <FeatureBanner
                  tone="cream" title="Build Your Own Combo" subtitle="Pick your favourites together" image="build-combo" icon="gift" cta="Create combo"
                  onPress={() => nav.navigate('Listing', { collectionId: 'combos', title: 'Combos' })} accessibilityLabel="Build your own combo. Pick your favourites"
                />
              </Reveal>
            </>
          )}
        </ScrollView>
      </Sheet>
    </View>
  );
}

function CollectionCard({ c, index, onPress }: { c: Collection; index: number; onPress: () => void }) {
  const dark = c.tone === 'burgundy';
  return (
    <Reveal index={index} style={{ width: '48%' }}>
      <PressableScale onPress={onPress} accessibilityLabel={`${c.name}. ${c.subtitle}`} style={[styles.collection, dark ? null : { backgroundColor: colors.backgroundAlt }]}>
        {dark && <LinearGradient colors={gradients.festive} style={StyleSheet.absoluteFill} />}
        <ProductImage image={c.imageKey} style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: '55%' }} />
        <LinearGradient
          colors={dark ? [alpha.red(1), alpha.red(0.85), alpha.red(0)] : [colors.backgroundAlt, alpha.lightIvory(0.9), alpha.lightIvory(0)]}
          start={{ x: 0.35, y: 0.5 }} end={{ x: 0.7, y: 0.5 }} style={StyleSheet.absoluteFill} pointerEvents="none"
        />
        <View style={{ flex: 1, justifyContent: 'space-between', width: '58%' }}>
          <View>
            <AppText variant="h1" color={dark ? colors.white : colors.text}>{c.name}</AppText>
            <AppText variant="caption" color={dark ? alpha.white(0.85) : colors.textMuted} numberOfLines={3} style={{ marginTop: 2 }}>{c.subtitle}</AppText>
          </View>
          <View style={[styles.arrow, !dark && { backgroundColor: alpha.primary(0.12) }]}>
            <Ionicons name="arrow-forward" size={20} color={dark ? colors.primary : colors.text} />
          </View>
        </View>
      </PressableScale>
    </Reveal>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 10, justifyContent: 'space-between' },
  collection: { height: 124, borderRadius: radius.lg, overflow: 'hidden', padding: 14, flexDirection: 'row', ...shadow.card },
  arrow: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: TILE_GAP },
  tile: { backgroundColor: colors.surface, borderRadius: radius.md, padding: 4, paddingBottom: 8, ...shadow.card },
});
