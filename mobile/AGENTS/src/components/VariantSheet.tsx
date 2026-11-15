import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { PressableScale } from '../animations/PressableScale';
import { useShop } from '../store/useShop';
import { toast } from '../store/useToast';
import { colors, radius, spacing } from '../theme';
import type { Product } from '../types';
import { percentOff, rupee } from '../utils/format';
import { AppText } from './AppText';
import { BottomSheet } from './BottomSheet';
import { Button } from './Button';

type Props = { product: Product | null; initialVariantId?: string; onClose: () => void; onChosen?: (variantId: string) => void };

/** Quick-add variant picker: required whenever a product has several purchasable variants (BRD 03). */
export function VariantSheet({ product, initialVariantId, onClose, onChosen }: Props) {
  const addToCart = useShop((s) => s.addToCart);
  const [sel, setSel] = useState<string | undefined>(initialVariantId);

  useEffect(() => {
    if (product) setSel(initialVariantId ?? product.variants.find((v) => v.stock > 0)?.id);
  }, [product, initialVariantId]);

  const variant = product?.variants.find((v) => v.id === sel);

  return (
    <BottomSheet visible={!!product} onClose={onClose} title={product ? `Choose pack size — ${product.name}` : ''}>
      {product && (
        <View style={{ gap: 10 }}>
          {product.variants.map((v) => {
            const out = v.stock <= 0;
            const active = v.id === sel;
            return (
              <PressableScale
                key={v.id}
                disabled={out}
                onPress={() => setSel(v.id)}
                accessibilityState={{ selected: active, disabled: out }}
                style={{
                  flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: radius.md, backgroundColor: colors.surface,
                  borderWidth: 1.5, borderColor: active ? colors.primary : colors.border, opacity: out ? 0.5 : 1,
                }}
              >
                <Ionicons name={active ? 'radio-button-on' : 'radio-button-off'} size={22} color={active ? colors.primary : colors.textMuted} />
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <AppText variant="h2">{v.label}</AppText>
                  <AppText variant="caption" color={out ? colors.error : colors.textMuted}>{out ? 'Out of stock' : 'In stock'}</AppText>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <AppText variant="h2">{rupee(v.price)}</AppText>
                  {percentOff(v.mrp, v.price) > 0 && (
                    <AppText variant="caption" color={colors.textMuted} style={{ textDecorationLine: 'line-through' }}>{rupee(v.mrp)}</AppText>
                  )}
                </View>
              </PressableScale>
            );
          })}
          <Button
            title={variant ? `Add to Cart • ${rupee(variant.price)}` : 'Select a pack size'}
            disabled={!variant || variant.stock <= 0}
            icon="cart-outline"
            style={{ marginTop: spacing.sm }}
            onPress={() => {
              if (!variant) return;
              const r = addToCart(product.id, variant.id, 1);
              if (r === 'soldout') return toast(`${product.name} (${variant.label}) is out of stock`, 'error');
              onChosen?.(variant.id);
              toast(r === 'capped' ? `Only ${variant.stock} available` : `${product.name} (${variant.label}) added to cart`, r === 'capped' ? 'info' : 'success');
              onClose();
            }}
          />
        </View>
      )}
    </BottomSheet>
  );
}
