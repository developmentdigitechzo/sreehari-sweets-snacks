import { duration, timingConfig } from '../animations/motion';
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect } from 'react';
import { StyleProp, StyleSheet, TextInput, TextInputProps, View, ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import { PressableScale } from '../animations/PressableScale';
import { colors, control, inputType, radius, spacing, alpha, type as t, fontScale } from '../theme';
import { percentOff, rupee } from '../utils/format';
import { AppText } from './AppText';

/* ------------------------------------------------------------------ Price */
export function PriceRow({ price, mrp, size = 'md' }: { price: number; mrp: number; size?: 'sm' | 'md' | 'lg' }) {
  const off = percentOff(mrp, price);
  const priceStyle = size === 'lg' ? t.priceLg : size === 'md' ? t.priceMd : t.priceSm;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 }} accessible accessibilityLabel={`${rupee(price)}${off ? `, was ${rupee(mrp)}, ${off} percent off` : ''}`}>
      <AppText style={[priceStyle, { color: colors.text }]}>{rupee(price)}</AppText>
      {off > 0 && (
        <>
          <AppText variant="caption" color={colors.textMuted} style={[styles.mrpStrike, size === 'lg' ? t.mrpLg : null]}>{rupee(mrp)}</AppText>
          <OffPill off={off} large={size === 'lg'} />
        </>
      )}
    </View>
  );
}

export function OffPill({ off, large }: { off: number; large?: boolean }) {
  return (
    <View style={[styles.offPill, large && { paddingHorizontal: 14, paddingVertical: 7 }]}>
      <AppText variant="badge" color={colors.error} numberOfLines={1} style={large ? t.badgeLg : undefined}>{off}% OFF</AppText>
    </View>
  );
}

/* ---------------------------------------------------------------- Badges */
const BADGE_ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  Bestseller: 'ribbon',
  'Special Offer': 'pricetag',
  'New Arrival': 'leaf',
  'Family Pack': 'people',
};
export function ProductBadgePill({ label, style }: { label: string; style?: StyleProp<ViewStyle> }) {
  const special = label === 'Special Offer';
  return (
    <View style={[styles.badge, special && { backgroundColor: colors.error }, style]}>
      <Ionicons name={BADGE_ICON[label] ?? 'star'} size={13} color={special ? colors.white : colors.onAccent} />
      <AppText variant="badge" color={special ? colors.white : colors.onAccent}>{label}</AppText>
    </View>
  );
}

export function DemoTag({ label = 'DEMO' }: { label?: string }) {
  return (
    <View style={styles.demoTag} accessibilityLabel="Demo data">
      <AppText variant="badge" color={colors.text} style={{ letterSpacing: 0.6 }}>{label}</AppText>
    </View>
  );
}

/* ----------------------------------------------------------------- Heart */
export function HeartButton({ active, onPress, dark: _dark = true, size = 20 }: { active: boolean; onPress: () => void; dark?: boolean; size?: number }) {
  const s = useSharedValue(1);
  useEffect(() => {
    s.value = withSequence(withTiming(1.12, timingConfig(duration.press)), withTiming(1, timingConfig(duration.release)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);
  const a = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  return (
    <PressableScale
      onPress={onPress}
      accessibilityLabel={active ? 'Remove from wishlist' : 'Add to wishlist'}
      accessibilityState={{ selected: active }}
      style={[styles.heart, { backgroundColor: active ? colors.primarySoft : alpha.white(0.92) }]}
      scaleTo={0.85}
      haptic
    >
      <Animated.View style={a}>
        <Ionicons name={active ? 'heart' : 'heart-outline'} size={size} color={colors.primary} />
      </Animated.View>
    </PressableScale>
  );
}

/* ------------------------------------------------------------------ Chip */
export function Chip({ label, active, onPress, icon, trailing }: { label: string; active?: boolean; onPress?: () => void; icon?: keyof typeof Ionicons.glyphMap; trailing?: keyof typeof Ionicons.glyphMap }) {
  return (
    <PressableScale
      onPress={onPress}
      accessibilityState={{ selected: !!active }}
      style={[styles.chip, active ? { backgroundColor: colors.primary, borderColor: colors.primary } : null]}
    >
      {icon && <Ionicons name={icon} size={18} color={active ? colors.white : colors.primary} />}
      <AppText variant="link" color={active ? colors.white : colors.text}>{label}</AppText>
      {trailing && <Ionicons name={trailing} size={14} color={active ? colors.white : colors.text} />}
    </PressableScale>
  );
}

/* -------------------------------------------------------------- Sections */
export function SectionHeader({ title, subtitle, icon, action, onAction, iconColor = colors.primary }: {
  title: string; subtitle?: string; icon?: keyof typeof Ionicons.glyphMap; action?: string; onAction?: () => void; iconColor?: string;
}) {
  return (
    <View style={styles.sectionRow}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
        {icon && <Ionicons name={icon} size={26} color={iconColor} />}
        <View style={{ flex: 1, minWidth: 0 }}>
          <AppText variant="sectionTitle" accessibilityRole="header">{title}</AppText>
          {!!subtitle && <AppText variant="sectionSubtitle" color={colors.textMuted}>{subtitle}</AppText>}
        </View>
      </View>
      {!!action && (
        <PressableScale onPress={onAction} accessibilityLabel={`${action}: ${title}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: control.minTouch, marginLeft: spacing.sm }}>
          <AppText variant="link" color={colors.primary}>{action}</AppText>
          <Ionicons name="arrow-forward" size={16} color={colors.primary} />
        </PressableScale>
      )}
    </View>
  );
}

/* ----------------------------------------------------------------- Input */
export function SearchBar({ value, onChangeText, onClear, onSubmit, placeholder, autoFocus, onPress, mic, onMic, listening }: {
  value: string; onChangeText?: (t: string) => void; onClear?: () => void; onSubmit?: () => void; placeholder?: string; autoFocus?: boolean; onPress?: () => void;
  /** Show the microphone. Give it `onMic` (and `listening` while recording) to make it work. */
  mic?: boolean; onMic?: () => void; listening?: boolean;
}) {
  const content = (
    <View style={styles.search}>
      <Ionicons name="search-outline" size={22} color={colors.primary} />
      {onPress ? (
        <AppText variant="body" color={colors.textMuted} style={{ flex: 1 }} numberOfLines={1}>{placeholder}</AppText>
      ) : (
        <TextInput
        maxFontSizeMultiplier={fontScale.max}
          value={value}
          onChangeText={onChangeText}
          onSubmitEditing={onSubmit}
          placeholder={placeholder}
          placeholderTextColor={colors.textMuted}
          autoFocus={autoFocus}
          returnKeyType="search"
          accessibilityLabel="Search products"
          style={styles.searchInput}
        />
      )}
      {!onPress && !!value && (
        <PressableScale onPress={onClear} accessibilityLabel="Clear search" style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="close" size={22} color={colors.grey} />
        </PressableScale>
      )}
      {mic && (
        <PressableScale
          onPress={onMic}
          disabled={!onMic}
          accessibilityLabel={listening ? 'Stop listening' : 'Search by voice'}
          accessibilityState={{ selected: !!listening }}
          style={[styles.mic, listening && { backgroundColor: colors.primarySoft }]}
        >
          <Ionicons name={listening ? 'mic' : 'mic-outline'} size={22} color={listening ? colors.primary : colors.ink} />
        </PressableScale>
      )}
    </View>
  );
  return onPress ? <PressableScale onPress={onPress} accessibilityLabel={placeholder} scaleTo={0.98}>{content}</PressableScale> : content;
}

export function Field({ label, error, ...rest }: TextInputProps & { label: string; error?: string }) {
  return (
    <View style={{ marginBottom: spacing.md }}>
      <AppText variant="captionMedium" color={colors.textMuted} style={{ marginBottom: 6 }}>{label}</AppText>
      <TextInput
        maxFontSizeMultiplier={fontScale.max}
        placeholderTextColor={colors.textMuted}
        accessibilityLabel={label}
        {...rest}
        style={[styles.field, !!error && { borderColor: colors.error }, rest.multiline && { height: 84, textAlignVertical: 'top', paddingTop: 12 }]}
      />
      {!!error && <AppText variant="caption" color={colors.error} style={{ marginTop: 4 }}>{error}</AppText>}
    </View>
  );
}

const styles = StyleSheet.create({
  mic: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  mrpStrike: { textDecorationLine: 'line-through', textDecorationStyle: 'solid' },
  offPill: { backgroundColor: colors.accent, borderRadius: radius.pill, paddingHorizontal: 9, paddingVertical: 4 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: colors.accent, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 6 },
  demoTag: { borderWidth: 1, borderColor: colors.accent, borderRadius: 4, paddingHorizontal: 4, paddingVertical: 1, backgroundColor: colors.accentSoft },
  heart: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 8, height: control.chip, paddingHorizontal: 16, borderRadius: radius.pill,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
  },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, marginBottom: spacing.sm },
  search: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, height: control.input, backgroundColor: colors.surface, borderRadius: radius.pill, paddingHorizontal: spacing.lg },
  searchInput: { flex: 1, ...inputType.regular, color: colors.text, height: '100%', outlineStyle: 'none' } as object,
  field: {
    height: 50, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.surface,
    paddingHorizontal: 14, ...inputType.regular, color: colors.text,
  },
});
