import { Ionicons } from '@expo/vector-icons';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { duration, timingConfig } from '../animations/motion';
import { PressableScale } from '../animations/PressableScale';
import { AppText } from '../components/AppText';
import { CartBar } from '../components/CartBar';
import { colors, control, hairline, layout, radius, spacing } from '../theme';

type Glyph = keyof typeof Ionicons.glyphMap;
const ICONS: Record<string, { on: Glyph; off: Glyph; label: string; cartBar: boolean }> = {
  Home: { on: 'home', off: 'home-outline', label: 'Home', cartBar: true },
  Categories: { on: 'grid', off: 'grid-outline', label: 'Categories', cartBar: true },
  OffersTab: { on: 'pricetag', off: 'pricetag-outline', label: 'Offers', cartBar: true },
  Orders: { on: 'bag-handle', off: 'bag-handle-outline', label: 'Orders', cartBar: false },
  Account: { on: 'person', off: 'person-outline', label: 'Account', cartBar: false },
};

/**
 * Five equal tabs. The selected tab only changes colour, weight and a soft pill behind the icon: no resizing or
 * sliding, so the bar never shifts under the finger. The cart summary sits directly above it on shopping tabs.
 */
export function TabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const activeName = state.routes[state.index]?.name;
  const showCartBar = ICONS[activeName]?.cartBar ?? false;

  return (
    <View>
      <CartBar hidden={!showCartBar} onPress={() => navigation.navigate('Cart' as never)} />
      <View style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, spacing.sm) }]} accessibilityRole="tablist">
        <View style={styles.inner}>
          {state.routes.map((route, i) => {
            const focused = state.index === i;
            const meta = ICONS[route.name];
            return (
              <TabItem
                key={route.key}
                focused={focused}
                meta={meta}
                onPress={() => {
                  const e = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
                  if (!focused && !e.defaultPrevented) navigation.navigate(route.name as never);
                }}
              />
            );
          })}
        </View>
      </View>
    </View>
  );
}

function TabItem({ focused, meta, onPress }: { focused: boolean; meta: (typeof ICONS)[string]; onPress: () => void }) {
  const reduce = useReducedMotion();
  const on = useSharedValue(focused ? 1 : 0);
  useEffect(() => {
    on.value = withTiming(focused ? 1 : 0, timingConfig(reduce ? 0 : duration.small));
  }, [focused, reduce, on]);
  const pill = useAnimatedStyle(() => ({ opacity: on.value }));

  return (
    <PressableScale
      accessibilityRole="tab"
      accessibilityState={{ selected: focused }}
      accessibilityLabel={meta.label}
      haptic
      scaleTo={0.96}
      onPress={onPress}
      style={styles.tab}
    >
      <View style={styles.iconBox}>
        <Animated.View style={[styles.pill, pill]} />
        <Ionicons name={focused ? meta.on : meta.off} size={layout.tabIcon} color={focused ? colors.primary : colors.secondary} />
      </View>
      <AppText variant={focused ? 'navLabelActive' : 'navLabel'} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} color={focused ? colors.primary : colors.secondary}>
        {meta.label}
      </AppText>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  wrap: { backgroundColor: colors.surface, paddingTop: spacing.xs, ...hairline },
  inner: { flexDirection: 'row', alignSelf: 'center', width: '100%', maxWidth: layout.maxContentWidth, paddingHorizontal: spacing.xs },
  tab: { flex: 1, minHeight: control.minTouch + 8, alignItems: 'center', justifyContent: 'center', gap: 2 },
  iconBox: { width: 56, height: 30, alignItems: 'center', justifyContent: 'center' },
  pill: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, borderRadius: radius.pill, backgroundColor: colors.primarySoft },
});
