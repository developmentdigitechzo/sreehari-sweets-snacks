import { Ionicons } from '@expo/vector-icons';
import { Image, ImageContentFit } from 'expo-image';
import React, { useEffect, useState } from 'react';
import { StyleProp, View, ViewStyle } from 'react-native';
import { resolveImage } from '../assets/images';
import { colors } from '../theme';
import type { ImageRef } from '../types';

type Props = {
  image?: ImageRef | string;
  style?: StyleProp<ViewStyle>;
  contentFit?: ImageContentFit;
  label?: string;
  priority?: 'low' | 'normal' | 'high';
};

/** Image with a warm placeholder while loading and a graceful fallback on error. */
export function ProductImage({ image, style, contentFit = 'cover', label, priority }: Props) {
  const [failed, setFailed] = useState(false);
  const source = resolveImage(image);
  const key = typeof image === 'string' ? image : JSON.stringify(image ?? null);
  // a recycled list cell can get a new picture: forget the previous picture's failure
  useEffect(() => setFailed(false), [key]);
  if (!source || failed) {
    return (
      <View style={[{ backgroundColor: colors.backgroundAlt, alignItems: 'center', justifyContent: 'center' }, style]} accessibilityLabel={label ?? 'Image unavailable'}>
        <Ionicons name="image-outline" size={28} color={colors.textMuted} />
      </View>
    );
  }
  return (
    <Image
      source={source as never}
      style={[{ backgroundColor: colors.backgroundAlt }, style as object]}
      contentFit={contentFit}
      transition={280}
      priority={priority}
      cachePolicy="memory-disk"
      recyclingKey={key}
      onError={() => setFailed(true)}
      accessibilityLabel={label}
    />
  );
}
