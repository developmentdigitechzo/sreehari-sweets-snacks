import { duration, ease } from './motion';
import React from 'react';
import { StyleProp, ViewStyle } from 'react-native';
import Animated, { FadeInDown, FadeInUp, ReduceMotion } from 'react-native-reanimated';

/** Items past this position appear together with the last staggered one, so a long list never makes the customer wait for the bottom. */
export const MAX_STAGGERED = 5;

type Props = {
  index?: number;
  from?: 'bottom' | 'top';
  step?: number;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
};

/** Staggered entrance. Honours the system "reduce motion" setting. */
export function Reveal({ index = 0, from = 'bottom', step = 70, style, children }: Props) {
  const base = from === 'bottom' ? FadeInDown : FadeInUp;
  return (
    <Animated.View
      entering={base.delay(Math.min(index, MAX_STAGGERED) * step).duration(duration.card).easing(ease).reduceMotion(ReduceMotion.System)}
      style={style}
    >
      {children}
    </Animated.View>
  );
}
