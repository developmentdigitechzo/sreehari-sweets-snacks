import { useFocusEffect, useNavigation } from '@react-navigation/native';
import React, { useCallback, useMemo, useState } from 'react';
import { FlatList, RefreshControl, View } from 'react-native';
import { Reveal } from '../animations/Reveal';
import { BrandHeader, Sheet } from '../components/BrandHeader';
import { OrderCard } from '../components/OrderCard';
import { SegmentedTabs } from '../components/SegmentedTabs';
import { EmptyState } from '../components/States';
import { refreshOrders } from '../services/accountSync';
import { api } from '../services/api';
import { useAuth } from '../store/useAuth';
import { useShop } from '../store/useShop';
import { useCatalog } from '../store/useCatalog';
import { toast } from '../store/useToast';
import { colors, layout, spacing } from '../theme';
import type { Order } from '../types';

type Tab = 'active' | 'past';
/** An order is "past" once it is delivered or cancelled. */
export const isPast = (o: Order) => o.status === 'delivered' || o.status === 'cancelled';

export function OrdersScreen() {
  const nav = useNavigation();
  const orders = useShop((s) => s.orders);
  const user = useAuth((s) => s.user);
  const reorder = useShop((s) => s.reorder);
  const products = useCatalog((s) => s.products);
  const [refreshing, setRefreshing] = useState(false);
  const [picked, setPicked] = useState<Tab | null>(null);
  // Live backend: show the status the store has set every time this tab is opened, and on pull-to-refresh.
  useFocusEffect(useCallback(() => { refreshOrders().catch(() => {}); }, []));

  const { active, past } = useMemo(() => ({ active: orders.filter((o) => !isPast(o)), past: orders.filter(isPast) }), [orders]);
  // Open on Active when something is on its way, otherwise on Past; the customer's own choice wins once made.
  const tab: Tab = picked ?? (active.length > 0 || past.length === 0 ? 'active' : 'past');
  const list = tab === 'active' ? active : past;

  const doReorder = (o: Order) => {
    const n = reorder(o.id, (pid, label, sku) => {
      const vs = products.find((p) => p.id === pid)?.variants ?? [];
      return (vs.find((v) => !!sku && v.sku === sku && v.stock > 0) ?? vs.find((v) => v.label === label && v.stock > 0))?.id;
    });
    toast(n ? `${n} item${n > 1 ? 's' : ''} added to cart` : 'These items are currently unavailable', n ? 'success' : 'error');
    if (n) nav.navigate('Cart');
  };

  const empty = !user
    ? <EmptyState icon="lock-closed-outline" title="Log in to see your orders" message="Your order history and tracking live in your account." actionLabel="Log in" onAction={() => nav.navigate('Login')} secondaryLabel="Create an account" onSecondary={() => nav.navigate('Signup')} />
    : orders.length === 0
      ? <EmptyState icon="receipt-outline" title="No orders yet" message="When you place an order it will show up here with live status." actionLabel="Start Shopping" onAction={() => nav.navigate('Main', { screen: 'Home' })} />
      : tab === 'active'
        ? <EmptyState icon="bicycle-outline" title="Nothing on its way" message="Your delivered and cancelled orders are under Past." actionLabel="Start Shopping" onAction={() => nav.navigate('Main', { screen: 'Home' })} />
        : <EmptyState icon="checkmark-done-outline" title="No past orders yet" message="Delivered and cancelled orders will be listed here." />;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <BrandHeader left="none" actions={['cart']} title="My Orders" subtitle="Track and reorder your favourites" />
      <Sheet>
        {!!user && orders.length > 0 && (
          <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.md }}>
            <SegmentedTabs<Tab> value={tab} onChange={setPicked} tabs={[{ id: 'active', label: 'Active', count: active.length }, { id: 'past', label: 'Past', count: past.length }]} />
          </View>
        )}
        <FlatList
          data={user ? list : []}
          refreshControl={api.account && user ? <RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await refreshOrders().catch(() => {}); setRefreshing(false); }} tintColor={colors.primary} /> : undefined}
          keyExtractor={(o) => o.id}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: layout.scrollBottom, gap: spacing.md, flexGrow: 1 }}
          ListEmptyComponent={empty}
          renderItem={({ item: o, index }) => (
            <Reveal index={index}>
              <OrderCard order={o} onOpen={() => nav.navigate('OrderTracking', { orderId: o.id })} onReorder={() => doReorder(o)} />
            </Reveal>
          )}
        />
      </Sheet>
    </View>
  );
}
