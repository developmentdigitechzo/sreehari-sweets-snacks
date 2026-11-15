import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { PressableScale } from '../animations/PressableScale';
import { trackBanner } from '../services/bannerEvents';
import { colors, radius, shadow, spacing, alpha } from '../theme';
import type { Banner } from '../types';
import { AppText } from './AppText';
import { ProductImage } from './ProductImage';

/** Highlighted promotional sections (admin: Banners & Campaigns > Promotional Sections). One tappable card each. */
export function PromoSections({ sections, onPress }: { sections: Banner[] | undefined; onPress: (b: Banner) => void }) {
  useEffect(() => { sections?.forEach((s) => trackBanner(s.id, 'view')); }, [sections]);
  if (!sections?.length) return null;
  return (
    <View style={{ paddingHorizontal: spacing.lg, gap: spacing.md }}>
      {sections.map((s) => (
        <PressableScale key={s.id} onPress={() => { trackBanner(s.id, 'click'); onPress(s); }} accessibilityLabel={`${s.title} ${s.accent ?? ''}. ${s.cta}`} style={styles.card}>
          <ProductImage image={s.imageUri ? { id: s.id, uri: s.imageUri } : s.imageKey} style={StyleSheet.absoluteFill} />
          <LinearGradient colors={[alpha.red(0.88), alpha.red(0.1)]} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={StyleSheet.absoluteFill} pointerEvents="none" />
          <View style={{ width: '82%', gap: 2 }}>
            {!!s.eyebrow && <AppText variant="eyebrow" color={colors.accent} numberOfLines={2}>{s.eyebrow}</AppText>}
            <AppText variant="h1" color={colors.white} numberOfLines={3}>{s.title}</AppText>
            {!!s.accent && <AppText variant="h2" color={colors.accent} numberOfLines={1}>{s.accent}</AppText>}
            <View style={styles.cta}><AppText variant="buttonSm" color={colors.onAccent}>{s.cta}  →</AppText></View>
          </View>
        </PressableScale>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { minHeight: 132, borderRadius: radius.lg, overflow: 'hidden', justifyContent: 'center', padding: spacing.lg, backgroundColor: colors.primaryPressed, ...shadow.card },
  cta: { alignSelf: 'flex-start', marginTop: spacing.sm, backgroundColor: colors.accent, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 6 },
});
