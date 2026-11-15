import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { softIn } from '../animations/motion';
import { trackBanner } from '../services/bannerEvents';
import { colors, radius, shadow, spacing, alpha } from '../theme';
import type { Banner } from '../types';
import { AppText } from './AppText';
import { Button } from './Button';
import { ProductImage } from './ProductImage';

/** Popups already shown in this app session. A popup appears once per session, never again after the customer closes it. */
const shown = new Set<string>();

/**
 * The store's offer popup (created in the admin panel under Banners & Campaigns > Offer Popups).
 * Shows the first active popup after the home screen has loaded. The close button and tapping outside both dismiss it.
 * Views and taps are reported like banner events, so the admin panel shows real numbers.
 */
export function OfferPopup({ popups, ready, onOpen }: { popups: Banner[] | undefined; ready: boolean; onOpen: (b: Banner) => void }) {
  const [current, setCurrent] = useState<Banner | null>(null);

  useEffect(() => {
    if (!ready || current) return;
    const next = popups?.find((p) => !shown.has(p.id));
    if (!next) return;
    const t = setTimeout(() => { shown.add(next.id); setCurrent(next); trackBanner(next.id, 'view'); }, 1200); // let the home screen settle first
    return () => clearTimeout(t);
  }, [ready, popups, current]);

  if (!current) return null;
  const close = () => setCurrent(null);
  const go = () => { trackBanner(current.id, 'click'); close(); onOpen(current); };

  return (
    <Modal transparent visible animationType="none" statusBarTranslucent onRequestClose={close}>
      <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(140)} style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel="Close offer" accessibilityRole="button" />
        <Animated.View entering={softIn} style={styles.card} accessibilityViewIsModal accessibilityLabel={`Offer: ${current.title} ${current.accent ?? ''}`}>
          <View style={styles.imageWrap}>
            <ProductImage image={current.imageUri ? { id: current.id, uri: current.imageUri } : current.imageKey} style={{ width: '100%', height: '100%' }} />
          </View>
          <View style={styles.body}>
            {!!current.eyebrow && <AppText variant="eyebrow" color={colors.accent} align="center">{current.eyebrow}</AppText>}
            <AppText variant="h1" align="center" color={colors.primary}>{current.title}</AppText>
            {!!current.accent && <AppText variant="h2" align="center" color={colors.accent}>{current.accent}</AppText>}
            <View style={{ flexDirection: 'row', gap: 10, marginTop: spacing.lg }}>
              <Button title="Not now" variant="outline" size="sm" onPress={close} style={{ flex: 1 }} />
              <Button title={current.cta || 'Shop now'} size="sm" onPress={go} style={{ flex: 1.4 }} />
            </View>
          </View>
          <Pressable onPress={close} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close" style={styles.x}>
            <Ionicons name="close" size={20} color={colors.white} />
          </Pressable>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.overlay, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  card: { width: '100%', maxWidth: 380, backgroundColor: colors.surface, borderRadius: radius.xl, overflow: 'hidden', ...shadow.card },
  imageWrap: { width: '100%', aspectRatio: 16 / 10, backgroundColor: colors.primaryPressed },
  body: { padding: spacing.lg, gap: 4 },
  x: { position: 'absolute', top: 10, right: 10, width: 36, height: 36, borderRadius: 18, backgroundColor: alpha.ink(0.5), alignItems: 'center', justifyContent: 'center' },
});
