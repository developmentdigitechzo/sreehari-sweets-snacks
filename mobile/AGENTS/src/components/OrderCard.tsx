import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { PressableScale } from '../animations/PressableScale';
import { slotLabel } from '../services/deliveryDates';
import { colors, control, hairline, radius, shadow, spacing } from '../theme';
import type { Order } from '../types';
import { formatDateTime, rupee } from '../utils/format';
import { AppText } from './AppText';
import { Button } from './Button';
import { ProductImage } from './ProductImage';
import { StatusChip } from './StatusChip';

/** Thumbnails shown before the "+N" tile. */
export const MAX_THUMBS = 4;
/** One size for every thumbnail and for the "+N" tile, so the row is always even. */
export const THUMB = 52;

const finished = (o: Order) => o.status === 'delivered' || o.status === 'cancelled';

/**
 * One order in the Orders list. Always the same three sections, separated by a hairline, each with the same side padding:
 *   1. who/when and the status      2. the items, total and delivery     3. two equal action buttons
 * Nothing changes height with the content except the number of text lines, so a list of cards stays even.
 */
export function OrderCard({ order, onOpen, onReorder }: { order: Order; onOpen: () => void; onReorder: () => void }) {
  const shown = order.items.slice(0, MAX_THUMBS);
  const more = order.items.length - shown.length;
  return (
    <PressableScale onPress={onOpen} scaleTo={0.99} accessibilityLabel={`Order ${order.number}, ${order.status.replace(/_/g, ' ')}, ${rupee(order.totals.total)}`} style={styles.card}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <AppText variant="cardTitle" numberOfLines={1}>Order #{order.number}</AppText>
          <AppText variant="caption" color={colors.textMuted} numberOfLines={1}>{formatDateTime(order.createdAt)} · {order.totals.itemCount} {order.totals.itemCount === 1 ? 'item' : 'items'}</AppText>
        </View>
        <StatusChip status={order.status} />
      </View>

      <View style={styles.body}>
        <View style={styles.thumbs}>
          {shown.map((it, i) => (
            <ProductImage key={i} image={it.imageUri ? { id: 'u', uri: it.imageUri } : it.imageKey} style={styles.thumb} />
          ))}
          {more > 0 && (
            <View style={[styles.thumb, styles.more]} accessibilityLabel={`and ${more} more`}>
              <AppText variant="bodyMedium" weight="bold" color={colors.primary}>+{more}</AppText>
            </View>
          )}
        </View>
        <View style={styles.total}>
          <AppText variant="caption" color={colors.textMuted}>Total</AppText>
          <AppText variant="price" color={colors.primary}>{rupee(order.totals.total)}</AppText>
        </View>
      </View>
      {!finished(order) && (
        <View style={styles.delivery}>
          <Ionicons name="bicycle-outline" size={18} color={colors.success} />
          <AppText variant="captionMedium" color={colors.success} numberOfLines={1} style={{ flex: 1 }}>{slotLabel(order.slot)}</AppText>
        </View>
      )}

      <View style={styles.actions}>
        <Button title={finished(order) ? 'View details' : 'Track order'} size="sm" variant="soft" icon={finished(order) ? 'receipt-outline' : 'navigate-outline'} style={styles.action} onPress={onOpen} />
        <Button title="Reorder" size="sm" variant="outline" icon="repeat" style={styles.action} onPress={onReorder} />
      </View>
    </PressableScale>
  );
}

const PAD = spacing.lg;
const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, overflow: 'hidden', ...shadow.card },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, paddingHorizontal: PAD, paddingVertical: spacing.md },
  headerText: { flex: 1, minWidth: 0, gap: 2 },
  body: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, paddingHorizontal: PAD, paddingVertical: spacing.md, ...hairline },
  thumbs: { flexDirection: 'row', gap: spacing.sm, flexShrink: 1 },
  thumb: { width: THUMB, height: THUMB, borderRadius: radius.md },
  more: { backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  total: { alignItems: 'flex-end', flexShrink: 0 },
  delivery: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: PAD, paddingBottom: spacing.md },
  actions: { flexDirection: 'row', gap: spacing.md, paddingHorizontal: PAD, paddingVertical: spacing.md, ...hairline },
  action: { flex: 1, minHeight: control.buttonSm },
});
