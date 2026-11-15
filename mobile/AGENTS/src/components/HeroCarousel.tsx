import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useRef, useState } from 'react';
import { FlatList, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { SharedValue, interpolate, useAnimatedScrollHandler, useAnimatedStyle, useReducedMotion, useSharedValue } from 'react-native-reanimated';
import { PressableScale } from '../animations/PressableScale';
import { colors, gradients, layout, radius, spacing, alpha } from '../theme';
import type { Banner } from '../types';
import { AppText } from './AppText';
import { trackBanner } from '../services/bannerEvents';
import { ProductImage } from './ProductImage';

const AnimatedList = Animated.createAnimatedComponent(FlatList<Banner>);

type Props = { banners: Banner[]; onPress: (b: Banner) => void };

/** Swipeable, auto-advancing hero carousel with parallax image and animated pagination dots. */
export function HeroCarousel({ banners, onPress }: Props) {
  const { width } = useWindowDimensions();
  const itemW = Math.min(width, layout.maxContentWidth) - layout.gutter * 2;
  const snap = itemW + layout.cardGap;
  const x = useSharedValue(0);
  const ref = useRef<FlatList<Banner>>(null);
  const [idx, setIdx] = useState(0);
  const idxRef = useRef(0);
  const reduce = useReducedMotion();
  const paused = useRef(false);

  // Report the banner that is on screen (once per session each).
  useEffect(() => {
    if (banners[idx]) trackBanner(banners[idx].id, 'view');
  }, [idx, banners]);

  const onScroll = useAnimatedScrollHandler((e) => { x.value = e.contentOffset.x; });

  useEffect(() => {
    if (reduce || banners.length < 2) return;
    const t = setInterval(() => {
      if (paused.current) return;
      const next = (idxRef.current + 1) % banners.length;
      ref.current?.scrollToOffset({ offset: next * snap, animated: true });
      idxRef.current = next;
      setIdx(next);
    }, 4500);
    return () => clearInterval(t);
  }, [banners.length, snap, reduce]);

  return (
    <View>
      <AnimatedList
        ref={ref}
        data={banners}
        horizontal
        snapToInterval={snap}
        decelerationRate="fast"
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: layout.gutter, gap: layout.cardGap }}
        keyExtractor={(b) => b.id}
        onScroll={onScroll}
        scrollEventThrottle={16}
        onScrollBeginDrag={() => { paused.current = true; }}
        onScrollEndDrag={() => { setTimeout(() => { paused.current = false; }, 3000); }}
        onMomentumScrollEnd={(e) => {
          const i = Math.round(e.nativeEvent.contentOffset.x / snap);
          idxRef.current = i;
          setIdx(i);
        }}
        renderItem={({ item, index }) => <Slide banner={item} index={index} w={itemW} snap={snap} x={x} onPress={() => { trackBanner(item.id, 'click'); onPress(item); }} />}
      />
      <View style={styles.dots} accessibilityLabel={`Banner ${idx + 1} of ${banners.length}`}>
        {banners.map((b, i) => <Dot key={b.id} i={i} snap={snap} x={x} />)}
      </View>
    </View>
  );
}

function Slide({ banner, index, w, snap, x, onPress }: { banner: Banner; index: number; w: number; snap: number; x: SharedValue<number>; onPress: () => void }) {
  const parallax = useAnimatedStyle(() => ({
    transform: [{ translateX: interpolate(x.value, [(index - 1) * snap, index * snap, (index + 1) * snap], [-34, 0, 34]) }, { scale: 1.12 }],
  }));
  return (
    <PressableScale onPress={onPress} scaleTo={0.98} accessibilityLabel={`${banner.title} ${banner.accent ?? ''}. ${banner.cta}`} style={[styles.slide, { width: w }]}>
      <LinearGradient colors={gradients.festive} style={StyleSheet.absoluteFill} />
      <Animated.View style={[styles.imageBox, parallax]}>
        <ProductImage image={banner.imageUri ? { id: banner.id, uri: banner.imageUri } : banner.imageKey} style={{ width: '100%', height: '100%' }} />
      </Animated.View>
      <LinearGradient colors={[alpha.red(1), alpha.red(0.92), alpha.red(0)]} start={{ x: 0.0, y: 0.5 }} end={{ x: 0.75, y: 0.5 }} style={StyleSheet.absoluteFill} pointerEvents="none" />
      <View style={styles.text}>
        <AppText variant="eyebrow" color={colors.accent}>— {banner.eyebrow} —</AppText>
        <AppText variant="hero" color={colors.white} style={{ marginTop: spacing.xs + 2 }}>{banner.title}</AppText>
        {!!banner.accent && <AppText variant="hero" color={colors.accent}>{banner.accent}</AppText>}
        <View style={styles.cta}>
          <AppText variant="buttonSm" color={colors.onAccent}>{banner.cta}  →</AppText>
        </View>
      </View>
    </PressableScale>
  );
}

function Dot({ i, snap, x }: { i: number; snap: number; x: SharedValue<number> }) {
  const st = useAnimatedStyle(() => ({
    width: interpolate(x.value, [(i - 1) * snap, i * snap, (i + 1) * snap], [7, 20, 7], 'clamp'),
    backgroundColor: x.value > (i - 0.5) * snap && x.value < (i + 0.5) * snap ? colors.primary : colors.border,
  }));
  return <Animated.View style={[{ height: 7, borderRadius: 4 }, st]} />;
}

const styles = StyleSheet.create({
  slide: { height: 168, borderRadius: radius.lg, overflow: 'hidden' },
  imageBox: { position: 'absolute', right: 0, top: 0, bottom: 0, width: '68%' },
  text: { position: 'absolute', left: 16, top: 0, bottom: 0, justifyContent: 'center', width: '62%' },
  cta: { marginTop: spacing.md, alignSelf: 'flex-start', backgroundColor: colors.accent, borderRadius: radius.pill, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm + 1 },
  dots: { flexDirection: 'row', alignSelf: 'center', gap: 6, marginTop: spacing.md },
});
