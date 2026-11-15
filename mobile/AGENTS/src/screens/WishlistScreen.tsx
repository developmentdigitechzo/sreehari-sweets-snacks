import { useNavigation } from '@react-navigation/native';
import React from 'react';
import { FlatList, View } from 'react-native';
import { BrandHeader, Sheet } from '../components/BrandHeader';
import { CartBar } from '../components/CartBar';
import { ProductCard } from '../components/ProductCard';
import { EmptyState } from '../components/States';
import { useCardWidth } from '../hooks/useCardWidth';
import { useProducts } from '../hooks/useShopData';
import { useShop } from '../store/useShop';
import { colors, layout, spacing } from '../theme';

export function WishlistScreen() {
  const nav = useNavigation();
  const cardW = useCardWidth();
  const ids = useShop((s) => s.wishlist);
  const products = useProducts();
  const items = ids.map((id) => products.find((p) => p.id === id)).filter(Boolean) as typeof products;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <BrandHeader actions={['cart']} title="My Wishlist" subtitle={`${items.length} saved ${items.length === 1 ? 'item' : 'items'}`} />
      <Sheet>
        <FlatList
          data={items}
          numColumns={2}
          keyExtractor={(p) => p.id}
          columnWrapperStyle={{ gap: layout.cardGap, paddingHorizontal: layout.gutter, marginBottom: layout.cardGap }}
          contentContainerStyle={{ paddingTop: spacing.lg, paddingBottom: layout.scrollBottom, flexGrow: 1 }}
          renderItem={({ item, index }) => <ProductCard product={item} index={index} width={cardW} />}
          ListEmptyComponent={<EmptyState icon="heart-outline" title="Your wishlist is empty" message="Tap the heart on any product to save it here." actionLabel="Browse products" onAction={() => nav.navigate('Listing', { title: 'All Products' })} />}
        />
      </Sheet>
      <CartBar safeBottom onPress={() => nav.navigate('Cart')} />
    </View>
  );
}
