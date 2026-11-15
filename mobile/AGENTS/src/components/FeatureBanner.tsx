import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { PressableScale } from '../animations/PressableScale';
import { alpha, colors, gradients, radius, shadow, spacing } from '../theme';
import type { ImageRef } from '../types';
import { AppText } from './AppText';
import { ProductImage } from './ProductImage';

/** One height for every full-width banner, so stacked banners always line up. */
export const FEATURE_BANNER_HEIGHT = 128;

type Props = {
  title: string;
  subtitle: string;
  image: ImageRef | string;
  icon: keyof typeof Ionicons.glyphMap;
  /** Short call to action shown as a pill, for example "Shop cakes". */
  cta: string;
  /** `red` = festive gradient with light text; `cream` = soft cream card with dark text. */
  tone?: 'red' | 'cream';
  onPress: () => void;
  accessibilityLabel?: string;
};

/**
 * Full-width promotional banner used for Cakes, Gift Boxes and Build-your-own-combo.
 * Fixed height, one padding, one radius, text column on the left (58%) and the picture on the right (42%),
 * so every banner has the same structure whatever its content.
 */
export function FeatureBanner({ title, subtitle, image, icon, cta, tone = 'red', onPress, accessibilityLabel }: Props) {
  const dark = tone === 'red';
  const text = dark ? colors.white : colors.text;
  const muted = dark ? alpha.white(0.85) : colors.textMuted;
  return (
    <PressableScale onPress={onPress} accessibilityLabel={accessibilityLabel ?? `${title}. ${subtitle}`} style={[styles.card, !dark && { backgroundColor: colors.accentSoft }]}>
      {dark && <LinearGradient colors={gradients.festive} style={StyleSheet.absoluteFill} />}
      <ProductImage image={image} style={styles.image} />
      <LinearGradient
        colors={dark ? [alpha.red(1), alpha.red(0.95), alpha.red(0)] : [colors.accentSoft, alpha.lightIvory(0.9), alpha.lightIvory(0)]}
        start={{ x: 0.3, y: 0.5 }} end={{ x: 0.62, y: 0.5 }} style={StyleSheet.absoluteFill} pointerEvents="none"
      />
      <View style={styles.text}>
        <View style={styles.titleRow}>
          <Ionicons name={icon} size={24} color={dark ? colors.accent : colors.primary} />
          <AppText variant="h1" color={text} numberOfLines={2} style={{ flexShrink: 1 }}>{title}</AppText>
        </View>
        <AppText variant="caption" color={muted} numberOfLines={2}>{subtitle}</AppText>
        <View style={[styles.cta, dark ? { backgroundColor: colors.accent } : { backgroundColor: colors.primary }]}>
          <AppText variant="buttonSm" color={dark ? colors.onAccent : colors.white} numberOfLines={1}>{cta}</AppText>
          <Ionicons name="arrow-forward" size={16} color={dark ? colors.onAccent : colors.white} />
        </View>
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  card: { height: FEATURE_BANNER_HEIGHT, borderRadius: radius.lg, overflow: 'hidden', padding: spacing.lg, flexDirection: 'row', alignItems: 'center', ...shadow.card },
  image: { position: 'absolute', right: 0, top: 0, bottom: 0, width: '46%' },
  text: { width: '58%', gap: spacing.xs, justifyContent: 'center' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  cta: { marginTop: spacing.xs, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, height: 32, paddingHorizontal: spacing.md, borderRadius: radius.pill },
});
