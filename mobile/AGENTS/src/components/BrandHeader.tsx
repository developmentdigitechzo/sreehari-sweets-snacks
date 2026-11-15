import { duration, timingConfig } from '../animations/motion';
import { api } from '../services/api';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import React, { useEffect } from 'react';
import { Image, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PressableScale } from '../animations/PressableScale';
import { LOGO_COLOR, LOGO_COLOR_ASPECT } from '../assets/images';
import { useCartCount } from '../hooks/useShopData';
import { colors, radius, spacing } from '../theme';
import { AppText } from './AppText';
import { OfflineBanner } from './OfflineBanner';

/**
 * Brand mark: the full-colour logo (red lotus, blue wordmark, transparent background), drawn at its true proportions.
 * On the red splash and onboarding (`onDark`) the colours cannot sit straight on the red, so the same logo goes on a white rounded
 * card, the same shape as the native splash image. `width` is the width of whatever is drawn (the logo, or the card).
 */
export const LOGO_LABEL = 'Sree Hari Sweets, Infinite Quality';
/** Card proportions and how much of the card the logo fills; the native splash image (assets/splash-icon.png) uses the same. */
export const LOGO_CARD = { aspect: 1.6, fill: 0.8, radius: 0.07 } as const;

export function Logo({ width = 112, onDark = false }: { width?: number; onDark?: boolean }) {
  if (onDark) {
    const inner = width * LOGO_CARD.fill;
    return (
      <View testID="logo-card" accessible accessibilityLabel={LOGO_LABEL} style={{ width, height: width / LOGO_CARD.aspect, borderRadius: width * LOGO_CARD.radius, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' }}>
        <Image source={LOGO_COLOR} style={{ width: inner, height: inner / LOGO_COLOR_ASPECT }} resizeMode="contain" />
      </View>
    );
  }
  return <Image source={LOGO_COLOR} style={{ width, height: width / LOGO_COLOR_ASPECT }} resizeMode="contain" accessibilityLabel={LOGO_LABEL} />;
}

export function IconButton({ name, onPress, label, badge, color = colors.secondary, size = 26 }: {
  name: keyof typeof Ionicons.glyphMap; onPress?: () => void; label: string; badge?: number; color?: string; size?: number;
}) {
  const bump = useSharedValue(1);
  useEffect(() => {
    if (badge === undefined) return;
    bump.value = withSequence(withTiming(1.12, timingConfig(duration.press)), withTiming(1, timingConfig(duration.release)));
  }, [badge, bump]);
  const badgeStyle = useAnimatedStyle(() => ({ transform: [{ scale: bump.value }] }));
  return (
    <PressableScale onPress={onPress} accessibilityLabel={label} style={styles.iconBtn} scaleTo={0.88}>
      <Ionicons name={name} size={size} color={color} />
      {!!badge && badge > 0 && (
        <Animated.View style={[styles.badge, badgeStyle]}>
          <AppText variant="badge" color={colors.onAccent}>{badge}</AppText>
        </Animated.View>
      )}
    </PressableScale>
  );
}

export type HeaderAction = 'wishlist' | 'cart' | 'search' | 'bell' | 'help';

type Props = {
  left?: 'back' | 'menu' | 'none';
  actions?: HeaderAction[];
  title?: string;
  subtitle?: string;
  children?: React.ReactNode;
  onBack?: () => void;
  onMenu?: () => void;
};

export function BrandHeader({ left = 'back', actions = [], title, subtitle, children, onBack, onMenu }: Props) {
  const nav = useNavigation();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const cartCount = useCartCount();

  const renderAction = (a: HeaderAction) => {
    switch (a) {
      case 'wishlist': return <IconButton key={a} name="heart-outline" color={colors.primary} label="Wishlist" onPress={() => nav.navigate('Wishlist')} />;
      case 'cart': return <IconButton key={a} name="cart-outline" label={`Cart, ${cartCount} items`} badge={cartCount} onPress={() => nav.navigate('Cart')} />;
      case 'search': return <IconButton key={a} name="search-outline" color={colors.primary} label="Search" onPress={() => nav.navigate('Listing', { focus: true })} />;
      case 'bell': return <IconButton key={a} name="notifications-outline" label={api.account ? 'Messages from the store' : 'Offers and notifications'} onPress={() => nav.navigate(api.account ? 'Inbox' : 'Offers')} />;
      case 'help': return (
        <PressableScale key={a} onPress={() => nav.navigate('Main', { screen: 'Account' })} accessibilityLabel="Help" style={styles.helpBtn}>
          <Ionicons name="headset-outline" size={18} color={colors.secondary} />
          <AppText variant="buttonSm" color={colors.secondary}>Help</AppText>
        </PressableScale>
      );
    }
  };

  return (
    <View style={[styles.wrap, { paddingTop: insets.top + 6 }]}>
      <View style={styles.row}>
        <View style={[styles.side, { alignItems: 'flex-start' }]}>
          {left === 'back' && <IconButton name="arrow-back" label="Go back" onPress={onBack ?? (() => (nav.canGoBack() ? nav.goBack() : nav.navigate('Main')))} />}
          {left === 'menu' && <IconButton name="menu" label="Menu" onPress={onMenu} />}
        </View>
        <Logo width={width < 300 ? 92 : width < 340 ? 112 : 128} />
        <View style={[styles.side, { alignItems: 'flex-end', flexDirection: 'row', justifyContent: 'flex-end' }]}>{actions.map(renderAction)}</View>
      </View>
      {!!title && (
        <View style={{ alignItems: 'center', marginTop: spacing.xs }}>
          <AppText variant="pageTitle" color={colors.text} accessibilityRole="header">{title}</AppText>
          {!!subtitle && <AppText variant="body" color={colors.textMuted}>{subtitle}</AppText>}
        </View>
      )}
      {children}
    </View>
  );
}

/** Ivory sheet that overlaps the header (all screens share this). */
export function Sheet({ children, style }: { children: React.ReactNode; style?: object }) {
  return <View style={[styles.sheet, style]}><OfflineBanner />{children}</View>;
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: spacing.md, paddingBottom: 30, backgroundColor: colors.background },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  side: { flex: 1 }, // equal slots either side of the logo, so the logo stays centred and nothing clips on narrow phones
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  badge: {
    position: 'absolute', top: 2, right: 0, minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 5,
    backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: colors.background,
  },
  helpBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6, height: 40, paddingHorizontal: 14, borderRadius: radius.pill,
    borderWidth: 1, borderColor: colors.secondary,
  },
  sheet: { flex: 1, marginTop: -26, backgroundColor: colors.background, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, overflow: 'hidden' },
});
