import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useRef, useState } from 'react';
import { FlatList, Modal, Share, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { PressableScale } from '../animations/PressableScale';
import { colors, radius, spacing, alpha } from '../theme';
import type { ImageRef } from '../types';
import { AppText } from './AppText';
import { ProductBadgePill } from './Atoms';
import { ProductImage } from './ProductImage';

const clamp = (v: number, lo: number, hi: number) => {
  'worklet';
  return Math.min(Math.max(v, lo), hi);
};

function ZoomImage({ image, width, height }: { image: ImageRef; width: number; height: number }) {
  const scale = useSharedValue(1);
  const saved = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const sx = useSharedValue(0);
  const sy = useSharedValue(0);

  const pinch = Gesture.Pinch()
    .onUpdate((e) => {
      scale.value = clamp(saved.value * e.scale, 1, 4);
    })
    .onEnd(() => {
      saved.value = scale.value;
      if (scale.value <= 1.02) {
        tx.value = withTiming(0, { duration: 220 });
        ty.value = withTiming(0, { duration: 220 });
      }
    });
  const pan = Gesture.Pan()
    .minPointers(1)
    .onUpdate((e) => {
      if (scale.value > 1) {
        tx.value = sx.value + e.translationX;
        ty.value = sy.value + e.translationY;
      }
    })
    .onEnd(() => {
      sx.value = tx.value;
      sy.value = ty.value;
    });
  const dbl = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      const to = scale.value > 1 ? 1 : 2.4;
      scale.value = withTiming(to, { duration: 240 });
      saved.value = to;
      if (to === 1) {
        tx.value = withTiming(0, { duration: 220 }); ty.value = withTiming(0, { duration: 220 }); sx.value = 0; sy.value = 0;
      }
    });
  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: scale.value }],
  }));

  return (
    <GestureDetector gesture={Gesture.Simultaneous(pinch, pan, dbl)}>
      <Animated.View style={[{ width, height, alignItems: 'center', justifyContent: 'center' }, style]}>
        <ProductImage image={image} contentFit="contain" style={{ width, height: width }} />
      </Animated.View>
    </GestureDetector>
  );
}

function Viewer({ images, startIndex, visible, onClose }: { images: ImageRef[]; startIndex: number; visible: boolean; onClose: () => void }) {
  const { width, height } = useWindowDimensions();
  const [i, setI] = useState(startIndex);
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.ink }}>
        <FlatList
          data={images}
          horizontal
          pagingEnabled
          initialScrollIndex={startIndex}
          getItemLayout={(_, k) => ({ length: width, offset: width * k, index: k })}
          keyExtractor={(im) => im.id}
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={(e) => setI(Math.round(e.nativeEvent.contentOffset.x / width))}
          renderItem={({ item }) => <ZoomImage image={item} width={width} height={height} />}
        />
        <PressableScale onPress={onClose} accessibilityLabel="Close viewer" style={styles.viewerClose}>
          <Ionicons name="close" size={26} color={colors.white} />
        </PressableScale>
        <View style={styles.viewerCount}>
          <AppText variant="captionMedium" color={colors.white}>{i + 1} / {images.length} · pinch or double-tap to zoom</AppText>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

type Props = { images: ImageRef[]; badge?: string; shareText: string };

export function ImageGallery({ images, badge, shareText }: Props) {
  const { width } = useWindowDimensions();
  const [index, setIndex] = useState(0);
  const [viewer, setViewer] = useState(false);
  const list = useRef<FlatList>(null);
  const h = Math.min(width * 0.82, 420);

  const go = useCallback((k: number) => {
    setIndex(k);
    list.current?.scrollToIndex({ index: k, animated: true });
  }, []);

  return (
    <View>
      <View style={{ height: h, backgroundColor: colors.primaryPressed }}>
        <FlatList
          ref={list}
          data={images}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          keyExtractor={(im) => im.id}
          getItemLayout={(_, k) => ({ length: width, offset: width * k, index: k })}
          onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
          renderItem={({ item }) => (
            <PressableScale onPress={() => setViewer(true)} scaleTo={1} accessibilityLabel="Open image viewer" style={{ width, height: h }}>
              <ProductImage image={item} style={{ width, height: h }} priority="high" />
            </PressableScale>
          )}
        />
        {!!badge && <ProductBadgePill label={badge} style={{ position: 'absolute', left: 16, top: 16 }} />}
        <View style={styles.overlayBtns}>
          <PressableScale
            accessibilityLabel="Share product"
            style={styles.roundBtn}
            onPress={() => Share.share({ message: shareText }).catch(() => {})}
          >
            <Ionicons name="share-social-outline" size={22} color={colors.white} />
          </PressableScale>
          <PressableScale accessibilityLabel="Expand image" style={styles.roundBtn} onPress={() => setViewer(true)}>
            <Ionicons name="expand-outline" size={22} color={colors.white} />
          </PressableScale>
        </View>
        <View style={styles.counter}>
          <AppText variant="captionMedium" color={colors.white}>{index + 1} / {images.length}</AppText>
        </View>
      </View>

      {images.length > 1 && (
        <FlatList
          data={images}
          horizontal
          showsHorizontalScrollIndicator={false}
          keyExtractor={(im) => im.id}
          contentContainerStyle={{ padding: spacing.md, gap: 10 }}
          renderItem={({ item, index: k }) => (
            <PressableScale onPress={() => go(k)} accessibilityLabel={`Image ${k + 1}`} accessibilityState={{ selected: k === index }}>
              <ProductImage
                image={item}
                style={{ width: 76, height: 58, borderRadius: radius.sm, borderWidth: 2, borderColor: k === index ? colors.primary : 'transparent', opacity: k === index ? 1 : 0.8 }}
              />
            </PressableScale>
          )}
        />
      )}
      <Viewer images={images} startIndex={index} visible={viewer} onClose={() => setViewer(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  overlayBtns: { position: 'absolute', right: 14, top: 14, gap: 10 },
  roundBtn: { width: 46, height: 46, borderRadius: 23, backgroundColor: alpha.ink(0.6), alignItems: 'center', justifyContent: 'center' },
  counter: { position: 'absolute', right: 14, bottom: 14, backgroundColor: alpha.ink(0.6), borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 6 },
  viewerClose: { position: 'absolute', top: 54, right: 20, width: 46, height: 46, borderRadius: 23, backgroundColor: alpha.white(0.18), alignItems: 'center', justifyContent: 'center' },
  viewerCount: { position: 'absolute', bottom: 48, alignSelf: 'center', backgroundColor: alpha.white(0.14), borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 6 },
});
