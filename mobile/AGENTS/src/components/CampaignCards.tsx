import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { PressableScale } from '../animations/PressableScale';
import { colors, radius, shadow, spacing } from '../theme';
import type { Campaign } from '../types';
import { AppText } from './AppText';

const KIND: Record<string, string> = { festive: 'Festive offer', flash_deal: 'Flash deal', acquisition: 'New customers', loyalty: 'Loyalty', other: 'Special offer' };

/** Running store campaigns (admin: Banners & Campaigns > Campaigns). The discount itself comes from the linked coupon at checkout. */
export function CampaignCards({ campaigns, onPress }: { campaigns: Campaign[] | undefined; onPress?: (c: Campaign) => void }) {
  if (!campaigns?.length) return null;
  return (
    <View style={{ gap: spacing.sm }}>
      {campaigns.map((c) => (
        <PressableScale key={c.id} onPress={() => onPress?.(c)} disabled={!onPress} accessibilityLabel={`${c.name}. ${c.offerText}${c.couponCode ? `. Use code ${c.couponCode}` : ''}`} style={styles.card}>
          <View style={styles.icon}><Ionicons name="megaphone" size={24} color={colors.white} /></View>
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <AppText variant="eyebrow" color={colors.accent} numberOfLines={1}>{KIND[c.kind] ?? KIND.other}</AppText>
            <AppText variant="cardTitle" color={colors.primary} numberOfLines={1}>{c.name}</AppText>
            <AppText variant="body" numberOfLines={2}>{c.offerText}</AppText>
            {(!!c.couponCode || !!c.endsAt || !!c.recurrence) && (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 4 }}>
                {!!c.couponCode && <View style={styles.code}><AppText variant="weight" color={colors.primary}>Code {c.couponCode}</AppText></View>}
                {(!!c.recurrence || !!c.endsAt) && <AppText variant="caption" color={colors.textMuted}>{c.recurrence ?? `Till ${new Date(c.endsAt as string).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}`}</AppText>}
              </View>
            )}
          </View>
          {!!onPress && <Ionicons name="chevron-forward" size={20} color={colors.primary} />}
        </PressableScale>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface, borderRadius: radius.lg, padding: 14, borderLeftWidth: 4, borderLeftColor: colors.accent, ...shadow.card },
  icon: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  code: { backgroundColor: colors.accentSoft, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 3 },
});
