import { duration, timingConfig } from './motion';
import * as Haptics from 'expo-haptics';
import React from 'react';
import { GestureResponderEvent, Platform, Pressable, PressableProps, StyleProp, ViewStyle } from 'react-native';
import { hitSlop as defaultHitSlop } from '../theme';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type Props = Omit<PressableProps, 'style'> & {
  style?: StyleProp<ViewStyle>;
  scaleTo?: number;
  haptic?: boolean;
};

/** Press feedback used by every tappable surface: spring scale on the UI thread. */
export function PressableScale({ style, scaleTo = 0.96, haptic = false, onPressIn, onPressOut, onPress, children, ...rest }: Props) {
  const scale = useSharedValue(1);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <AnimatedPressable
      accessibilityRole="button"
      hitSlop={defaultHitSlop}
      {...rest}
      onPressIn={(e) => {
        scale.value = withTiming(scaleTo, timingConfig(duration.press));
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        scale.value = withTiming(1, timingConfig(duration.release));
        onPressOut?.(e);
      }}
      onPress={(e: GestureResponderEvent) => {
        if (haptic && Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});
        onPress?.(e);
      }}
      style={[style, anim]}
    >
      {children}
    </AnimatedPressable>
  );
}
