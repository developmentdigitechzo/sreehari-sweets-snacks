import { riseIn } from '../animations/motion';
import { API_MODE } from '../services/api';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useRef, useState } from 'react';
import { FlatList, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { SharedValue, FadeInDown, FadeInUp, interpolate, useAnimatedStyle, useSharedValue, useAnimatedScrollHandler } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from '../components/AppText';
import { Button } from '../components/Button';
import { PressableScale } from '../animations/PressableScale';
import { ProductImage } from '../components/ProductImage';
import { Logo } from '../components/BrandHeader';
import { useShop } from '../store/useShop';
import { colors, gradients, radius, alpha } from '../theme';
import type { RootScreenProps } from '../navigation/types';

const PAGES = [
  { image: 'festive-hero', eyebrow: 'WELCOME', title: 'Traditional sweets, made premium', body: 'Browse Shree Hari’s signature sweets and snacks with clear pack sizes and prices.' },
  { image: 'cat-gift', eyebrow: 'GIFTING', title: 'Gift boxes for every occasion', body: 'Festive boxes and curated combos, ready to gift.' },
  { image: 'mixture', eyebrow: 'QUICK CHECKOUT', title: 'From craving to doorstep, fast', body: API_MODE === 'mock' ? 'Add to cart, pick a slot and pay. This POC simulates payment and delivery — nothing real is charged.' : 'Add to cart, pick a delivery slot and place your order.' },
];

const AnimatedFlatList = Animated.createAnimatedComponent(FlatList<(typeof PAGES)[number]>);

export function OnboardingScreen({ navigation }: RootScreenProps<'Onboarding'>) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const setOnboarded = useShop((s) => s.setOnboarded);
  const [page, setPage] = useState(0);
  const x = useSharedValue(0);
  const ref = useRef<FlatList>(null);
  const onScroll = useAnimatedScrollHandler((e) => { x.value = e.contentOffset.x; });

  const finish = () => { setOnboarded(); navigation.replace('Main'); };
  // Scroll by offset and set the page here: a button press does not always produce a 'momentum end' event, so the page must not depend on it.
  const next = () => {
    if (page === PAGES.length - 1) return finish();
    ref.current?.scrollToOffset({ offset: (page + 1) * width, animated: true });
    setPage(page + 1);
  };

  return (
    <LinearGradient colors={gradients.header} style={{ flex: 1, paddingTop: insets.top + 8 }}>
      <StatusBar style="light" />
      <View style={styles.top}>
        <Logo width={120} onDark />
        <PressableScale onPress={finish} accessibilityLabel="Skip onboarding" style={{ padding: 12 }}>
          <AppText variant="bodyMedium" color={alpha.white(0.85)}>Skip</AppText>
        </PressableScale>
      </View>

      <AnimatedFlatList
        ref={ref as never}
        data={PAGES}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={(p) => p.title}
        onScroll={onScroll}
        scrollEventThrottle={16}
        onMomentumScrollEnd={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / width))}
        renderItem={({ item, index }) => (
          <Slide item={item} index={index} width={width} x={x} active={page === index} />
        )}
      />

      <View style={[styles.footer, { paddingBottom: insets.bottom + 24 }]}>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {PAGES.map((_, i) => <Dot key={i} i={i} x={x} width={width} />)}
        </View>
        <Button title={page === PAGES.length - 1 ? 'Get Started' : 'Next'} variant="gold" iconRight="arrow-forward" onPress={next} style={{ minWidth: 150 }} />
      </View>
    </LinearGradient>
  );
}

function Slide({ item, index, width, x, active }: { item: (typeof PAGES)[number]; index: number; width: number; x: SharedValue<number>; active: boolean }) {
  const img = useAnimatedStyle(() => ({
    transform: [{ translateX: interpolate(x.value, [(index - 1) * width, index * width, (index + 1) * width], [60, 0, -60]) }, { scale: interpolate(x.value, [(index - 1) * width, index * width, (index + 1) * width], [0.9, 1, 0.9]) }],
    opacity: interpolate(x.value, [(index - 1) * width, index * width, (index + 1) * width], [0.4, 1, 0.4]),
  }));
  return (
    <View style={{ width, paddingHorizontal: 24 }}>
      <Animated.View style={[styles.imageWrap, img]}>
        <ProductImage image={item.image} style={{ width: '100%', height: '100%' }} />
      </Animated.View>
      {active && (
        <View key={`t${index}`} style={{ marginTop: 28 }}>
          <Animated.View entering={FadeInUp.delay(80).duration(450)}><AppText variant="captionMedium" color={colors.accent} style={{ letterSpacing: 2 }}>{item.eyebrow}</AppText></Animated.View>
          <Animated.View entering={riseIn.delay(180)}><AppText variant="display" color={colors.white} style={{ marginTop: 6 }}>{item.title}</AppText></Animated.View>
          <Animated.View entering={FadeInDown.delay(320).duration(500)}><AppText variant="bodyXl" color={alpha.white(0.82)} style={{ marginTop: 10 }}>{item.body}</AppText></Animated.View>
        </View>
      )}
    </View>
  );
}

function Dot({ i, x, width }: { i: number; x: SharedValue<number>; width: number }) {
  const st = useAnimatedStyle(() => ({
    width: interpolate(x.value, [(i - 1) * width, i * width, (i + 1) * width], [8, 26, 8], 'clamp'),
    opacity: interpolate(x.value, [(i - 1) * width, i * width, (i + 1) * width], [0.45, 1, 0.45], 'clamp'),
  }));
  return <Animated.View style={[{ height: 8, borderRadius: 4, backgroundColor: colors.accent }, st]} />;
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20 },
  imageWrap: { height: 300, borderRadius: radius.xl, overflow: 'hidden', borderWidth: 2, borderColor: alpha.accent(0.55), marginTop: 12 },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24 },
});
