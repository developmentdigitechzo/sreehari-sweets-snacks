import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import React, { memo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { PressableScale } from '../animations/PressableScale';
import { Reveal } from '../animations/Reveal';
import { useShop } from '../store/useShop';
import { toast } from '../store/useToast';
import { cardSize, colors, control, radius, shadow, spacing, type, alpha } from '../theme';
import type { Product } from '../types';
import { lineKey } from '../utils/cart';
import { percentOff, rupee } from '../utils/format';
import { AppText } from './AppText';
import { HeartButton, OffPill, ProductBadgePill } from './Atoms';
import { ProductImage } from './ProductImage';
import { QuantityStepper } from './QuantityStepper';
import { VariantSheet } from './VariantSheet';

type Props = {
  product: Product;
  index?: number;
  width?: number;
};

const NAME_LINES = 2;
const NAME_HEIGHT = type.productName.lineHeight! * NAME_LINES;
const WEIGHT_HEIGHT = 32;

/**
 * Product card: ONE design for every shelf and grid. Every row has a fixed height (image ratio, two-line name,
 * size row, price row, action row) so cards in a row always match, whatever the product name or discount.
 * Controls (heart, size, add, stepper) are siblings of the tappable image/name areas, never nested inside
 * them, so every control has its own clean hit area on iOS, Android and web.
 */
function ProductCardBase({ product, index = 0, width }: Props) {
  const nav = useNavigation();
  const wished = useShop((s) => s.wishlist.includes(product.id));
  const toggleWishlist = useShop((s) => s.toggleWishlist);
  const addToCart = useShop((s) => s.addToCart);
  const setQty = useShop((s) => s.setQty);

  const firstAvailable = product.variants.find((v) => v.stock > 0) ?? product.variants[0];
  const [chosenId, setChosenId] = useState<string | undefined>();
  const [picking, setPicking] = useState(false);
  const shown = product.variants.find((v) => v.id === chosenId) ?? firstAvailable;
  const plainKey = lineKey({ variantId: shown.id });
  const inCart = useShop((s) => s.cart.find((l) => lineKey(l) === plainKey)?.qty ?? 0);
  const allOut = product.variants.every((v) => v.stock <= 0);
  const off = percentOff(shown.mrp, shown.price);
  const open = () => nav.navigate('ProductDetail', { productId: product.id });
  const needsOptions = !!product.cake?.flavours?.length;
  const unavailable = allOut || shown.stock <= 0;

  const onAdd = () => {
    // Cakes with a required flavour go to the product page; several sizes ask for the size first.
    if (needsOptions) return open();
    if (product.variants.length > 1 && !chosenId) return setPicking(true);
    const r = addToCart(product.id, shown.id, 1);
    if (r === 'soldout') toast(`${product.name} is out of stock`, 'error');
    else if (r === 'capped') toast(`Only ${shown.stock} available`, 'info');
    else toast(`${product.name} added to cart`, 'success');
  };

  return (
    <Reveal index={index} style={{ width: width ?? undefined, flex: width ? undefined : 1 }}>
      <View style={styles.card}>
        <View>
          <PressableScale onPress={open} scaleTo={0.99} accessibilityLabel={`Open ${product.name}`}>
            <ProductImage image={product.images[0]} style={styles.image} label={product.name} />
          </PressableScale>
          {!!product.badge && <ProductBadgePill label={product.badge} style={styles.badge} />}
          <View style={styles.heart}>
            <HeartButton active={wished} onPress={() => toggleWishlist(product.id)} size={18} />
          </View>
          {allOut && (
            <View style={styles.soldOut} pointerEvents="none"><AppText variant="captionMedium" color={colors.white}>Out of stock</AppText></View>
          )}
        </View>

        <View style={styles.body}>
          <PressableScale onPress={open} scaleTo={0.99} accessibilityLabel={`${product.name}, ${shown.label}, ${rupee(shown.price)}`}>
            <AppText variant="productName" numberOfLines={NAME_LINES} style={styles.name}>{product.name}</AppText>
          </PressableScale>

          <View style={styles.metaRow}>
            <PressableScale onPress={() => setPicking(true)} accessibilityLabel={`Pack size ${shown.label}. Change`} style={styles.weight} scaleTo={0.96}>
              <AppText variant="weight" numberOfLines={1} style={{ flexShrink: 1 }}>{shown.label}</AppText>
              <Ionicons name="chevron-down" size={14} color={colors.text} />
            </PressableScale>
            {!!product.demoRating && (
              <View style={styles.rating} accessibilityLabel={`Demo rating ${product.demoRating}`}>
                <Ionicons name="star" size={12} color={colors.accent} />
                <AppText variant="captionMedium">{product.demoRating}</AppText>
              </View>
            )}
          </View>

          <View style={styles.priceRow}>
            <AppText variant="productPrice" color={colors.primary}>{rupee(shown.price)}</AppText>
            {off > 0 && <AppText variant="productMrp" color={colors.textMuted} style={styles.strike}>{rupee(shown.mrp)}</AppText>}
          </View>

          <View style={styles.actionRow}>
            {off > 0 && inCart === 0 ? <View style={{ flexShrink: 0 }}><OffPill off={off} /></View> : <View />}
            {inCart > 0 ? (
              <QuantityStepper value={inCart} onChange={(n) => setQty(plainKey, n)} label={product.name} height={control.buttonSm} btn={30} max={Math.max(1, Math.min(20, shown.stock))} />
            ) : (
              <PressableScale
                onPress={unavailable ? undefined : onAdd}
                disabled={unavailable}
                haptic
                accessibilityLabel={needsOptions ? `Add ${product.name}, choose options first` : `Add ${product.name} to cart`}
                style={[styles.add, unavailable && { opacity: 0.4 }]}
              >
                <Ionicons name="add" size={16} color={colors.white} />
                <AppText variant="buttonSm" color={colors.white}>Add</AppText>
              </PressableScale>
            )}
          </View>
        </View>
      </View>

      <VariantSheet product={picking ? product : null} initialVariantId={chosenId ?? shown.id} onClose={() => setPicking(false)} onChosen={setChosenId} />
    </Reveal>
  );
}

export const ProductCard = memo(ProductCardBase);

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, overflow: 'hidden', ...shadow.card },
  image: { width: '100%', aspectRatio: cardSize.productImageRatio },
  badge: { position: 'absolute', left: spacing.sm, top: spacing.sm },
  heart: { position: 'absolute', right: 6, top: 6 },
  soldOut: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: alpha.ink(0.7), alignItems: 'center', paddingVertical: 4 },
  body: { padding: spacing.md, gap: spacing.sm },
  name: { height: NAME_HEIGHT },
  metaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, height: WEIGHT_HEIGHT },
  weight: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flexShrink: 1, height: WEIGHT_HEIGHT, paddingHorizontal: 10, borderRadius: radius.pill, backgroundColor: colors.backgroundAlt },
  rating: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6, height: type.productPrice.lineHeight },
  strike: { textDecorationLine: 'line-through' },
  actionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: control.buttonSm },
  add: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 2, flexShrink: 0, height: control.buttonSm, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: colors.primary },
});
