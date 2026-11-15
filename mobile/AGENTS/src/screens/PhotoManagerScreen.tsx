import { layoutTransition } from '../animations/motion';
import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { ActivityIndicator, FlatList, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { PressableScale } from '../animations/PressableScale';
import { AppText } from '../components/AppText';
import { Chip, DemoTag } from '../components/Atoms';
import { BrandHeader, Sheet } from '../components/BrandHeader';
import { Button } from '../components/Button';
import { ProductImage } from '../components/ProductImage';
import { useProducts } from '../hooks/useShopData';
import { api } from '../services/api';
import { useCatalog } from '../store/useCatalog';
import { useShop } from '../store/useShop';
import { toast } from '../store/useToast';
import { colors, radius, shadow, spacing } from '../theme';
import type { ImageRef } from '../types';
import { uid } from '../utils/format';
import { pickImage } from '../utils/pickImage';

const MAX_IMAGES = 8;

/** Demo of the product-photo workflow: add (gallery/camera), replace, remove, primary, reorder. */
export function PhotoManagerScreen() {
  const products = useProducts();
  const base = useCatalog((s) => s.products);
  const setImages = useShop((s) => s.setImages);
  const [pid, setPid] = useState(products[0]?.id);
  const [busy, setBusy] = useState(false);
  const product = products.find((p) => p.id === pid);
  const images = product?.images ?? [];
  const isOverridden = !!useShop((s) => (pid ? s.imageOverrides[pid] : undefined));

  const commit = (next: ImageRef[]) => pid && setImages(pid, next);

  const add = async (src: 'library' | 'camera', replaceId?: string) => {
    if (!replaceId && images.length >= MAX_IMAGES) return toast(`Up to ${MAX_IMAGES} photos per product`, 'error');
    const r = await pickImage(src);
    if (r.ok === 'cancelled') return;
    if (r.ok === false) return toast(r.reason, 'error');
    setBusy(true);
    try {
      const up = await api.uploadImage(r.uri); // swap for object storage in production
      const ref: ImageRef = { id: uid('img'), uri: up.uri };
      commit(replaceId ? images.map((im) => (im.id === replaceId ? ref : im)) : [...images, ref]);
      toast(replaceId ? 'Photo replaced' : 'Photo added', 'success');
    } catch (e) {
      toast((e as Error).message || 'Upload failed', 'error');
    } finally {
      setBusy(false);
    }
  };

  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= images.length) return;
    const next = [...images];
    [next[i], next[j]] = [next[j], next[i]];
    commit(next);
  };
  const makePrimary = (i: number) => { const next = [...images]; const [x] = next.splice(i, 1); commit([x, ...next]); toast('Primary photo updated', 'success'); };
  const remove = (i: number) => {
    if (images.length <= 1) return toast('A product needs at least one photo', 'error');
    commit(images.filter((_, k) => k !== i));
    toast('Photo removed');
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <BrandHeader title="Product Photos" subtitle="Demo admin tool" />
      <Sheet>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: spacing.lg, paddingBottom: 80, gap: spacing.lg }}>
          <View style={styles.note}>
            <Ionicons name="flask-outline" size={20} color={colors.text} />
            <AppText variant="caption" style={{ flex: 1 }}>Changes are stored on this device only (<DemoTag label="DEMO" />). Photos are compressed on selection, limited to 5 MB, and referenced by URI — never stored as Base64. The upload service is a replaceable seam for object storage.</AppText>
          </View>

          <FlatList horizontal data={products} keyExtractor={(p) => p.id} showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} renderItem={({ item }) => <Chip label={item.name} active={item.id === pid} onPress={() => setPid(item.id)} />} />

          {product && (
            <>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <AppText variant="h1">{product.name} <AppText variant="body" color={colors.textMuted}>({images.length}/{MAX_IMAGES})</AppText></AppText>
                {busy && <ActivityIndicator color={colors.primary} />}
              </View>

              <View style={{ gap: 10 }}>
                {images.map((im, i) => (
                  <Animated.View key={im.id} layout={layoutTransition} entering={FadeIn} style={styles.item}>
                    <ProductImage image={im} style={{ width: 92, height: 74, borderRadius: radius.md }} />
                    <View style={{ flex: 1, gap: 6 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <AppText variant="bodyMedium" weight="semi">Photo {i + 1}</AppText>
                        {i === 0 && <View style={styles.primary}><Ionicons name="star" size={11} color={colors.onAccent} /><AppText variant="badge" color={colors.onAccent}>Primary</AppText></View>}
                        {im.uri && <AppText variant="caption" color={colors.textMuted}>(uploaded)</AppText>}
                      </View>
                      <View style={{ flexDirection: 'row', gap: 4, flexWrap: 'wrap' }}>
                        <Mini icon="arrow-up" label="Move up" onPress={() => move(i, -1)} disabled={i === 0} />
                        <Mini icon="arrow-down" label="Move down" onPress={() => move(i, 1)} disabled={i === images.length - 1} />
                        <Mini icon="star-outline" label="Make primary" onPress={() => makePrimary(i)} disabled={i === 0} />
                        <Mini icon="swap-horizontal" label="Replace" onPress={() => add('library', im.id)} />
                        <Mini icon="trash-outline" label="Remove" onPress={() => remove(i)} danger />
                      </View>
                    </View>
                  </Animated.View>
                ))}
              </View>

              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Button title="From gallery" icon="images-outline" style={{ flex: 1 }} size="sm" onPress={() => add('library')} loading={busy} />
                <Button title="Use camera" icon="camera-outline" variant="outline" style={{ flex: 1 }} size="sm" onPress={() => add('camera')} />
              </View>
              {isOverridden && <Button title="Reset to demo images" variant="ghost" onPress={() => { const orig = base.find((p) => p.id === pid); if (orig && pid) { useShop.setState((s) => { const { [pid]: _x, ...rest } = s.imageOverrides; return { imageOverrides: rest }; }); toast('Reset to demo images'); } }} />}
            </>
          )}
        </ScrollView>
      </Sheet>
    </View>
  );
}

function Mini({ icon, label, onPress, disabled, danger }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; disabled?: boolean; danger?: boolean }) {
  return (
    <PressableScale onPress={disabled ? undefined : onPress} disabled={disabled} accessibilityLabel={label} style={[styles.mini, disabled && { opacity: 0.35 }]}>
      <Ionicons name={icon} size={18} color={danger ? colors.error : colors.primary} />
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  note: { flexDirection: 'row', gap: 10, backgroundColor: colors.accentSoft, borderRadius: radius.md, padding: 12 },
  item: { flexDirection: 'row', gap: 12, alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.md, padding: 10, ...shadow.card },
  primary: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: colors.accent, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 },
  mini: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
});
