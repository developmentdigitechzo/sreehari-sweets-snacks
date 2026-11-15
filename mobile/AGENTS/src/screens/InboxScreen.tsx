import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { PressableScale } from '../animations/PressableScale';
import { AppText } from '../components/AppText';
import { BrandHeader, Sheet } from '../components/BrandHeader';
import { EmptyState, ErrorState } from '../components/States';
import { api, type InboxItem } from '../services/api';
import { useAuth } from '../store/useAuth';
import { colors, radius, shadow, spacing } from '../theme';
import { formatDateTime } from '../utils/format';

/** Messages the store sent to this customer (order updates and offers). Real rows from the database; nothing is simulated. */
export function InboxScreen() {
  const user = useAuth((s) => s.user);
  const [items, setItems] = useState<InboxItem[] | null>(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!api.account || !user) return;
    try {
      setItems(await api.account.notifications());
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }, [user]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const open = (n: InboxItem) => {
    if (n.readAt || !api.account) return;
    setItems((cur) => cur?.map((x) => (x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x)) ?? cur);
    api.account.markNotificationRead(n.id).catch(() => {});
  };

  const body = !api.account ? (
    <EmptyState icon="mail-outline" title="Store messages" message="Messages from the store appear here once the app is connected to the store's system." />
  ) : !user ? (
    <EmptyState icon="lock-closed-outline" title="Log in to see your messages" message="Order updates and offers from the store are shown here." />
  ) : error && !items ? (
    <ErrorState message={error} onRetry={load} />
  ) : items && items.length === 0 ? (
    <EmptyState icon="mail-outline" title="No messages yet" message="Order updates and offers from the store will show up here." />
  ) : null;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <BrandHeader title="Messages" subtitle="Updates from the store" />
      <Sheet>
        {body ?? (
          <FlatList
            data={items ?? []}
            keyExtractor={(n) => n.id}
            contentContainerStyle={{ padding: spacing.lg, gap: 10, paddingBottom: 60 }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={colors.primary} />}
            renderItem={({ item }) => (
              <PressableScale onPress={() => open(item)} accessibilityLabel={`${item.readAt ? '' : 'Unread. '}${item.title}. ${item.body}`} style={[styles.card, !item.readAt && styles.unread]}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                  <AppText variant={item.readAt ? 'bodyLg' : 'cardTitle'} style={{ flex: 1 }}>{item.title}</AppText>
                  {!item.readAt && <View style={styles.dot} accessibilityElementsHidden />}
                </View>
                <AppText variant="body" color={colors.textMuted} style={{ marginTop: 2 }}>{item.body}</AppText>
                <AppText variant="caption" color={colors.textMuted} style={{ marginTop: 6 }}>{formatDateTime(item.createdAt)}</AppText>
              </PressableScale>
            )}
          />
        )}
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: 14, ...shadow.card },
  unread: { borderLeftWidth: 4, borderLeftColor: colors.primary },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary, marginTop: 4 },
});
