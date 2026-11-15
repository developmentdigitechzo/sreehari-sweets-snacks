import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useState } from 'react';
import { DimensionValue, LayoutChangeEvent, StyleProp, View, ViewStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { colors, radius, alpha } from '../theme';

type Props = { width?: DimensionValue; height?: number; radius?: number; style?: StyleProp<ViewStyle> };

/** Shimmering placeholder. Static when reduce-motion is on. */
export function Skeleton({ width = '100%', height = 16, radius: r = radius.sm, style }: Props) {
  const [w, setW] = useState(0);
  const x = useSharedValue(-1);
  const reduce = useReducedMotion();

  useEffect(() => {
    if (reduce) return;
    x.value = withRepeat(withTiming(1, { duration: 1300, easing: Easing.inOut(Easing.quad) }), -1, false);
  }, [reduce, x]);

  const anim = useAnimatedStyle(() => ({ transform: [{ translateX: x.value * w }] }));

  return (
    <View
      onLayout={(e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width)}
      style={[{ width, height, borderRadius: r, backgroundColor: colors.backgroundAlt, overflow: 'hidden' }, style]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {!reduce && w > 0 && (
        <Animated.View style={[{ ...absoluteFill, width: w }, anim]}>
          <LinearGradient
            colors={[alpha.white(0), alpha.white(0.65), alpha.white(0)]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={{ flex: 1 }}
          />
        </Animated.View>
      )}
    </View>
  );
}

const absoluteFill = { position: 'absolute', top: 0, bottom: 0, left: 0 } as const;
