import { duration, timingConfig } from '../animations/motion';
import React, { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedProps,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Path } from 'react-native-svg';
import { colors } from '../theme';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedPath = Animated.createAnimatedComponent(Path);
const R = 44;
const CIRC = 2 * Math.PI * R;

const SPARKS = Array.from({ length: 10 }, (_, i) => i);

function Spark({ i, size, play }: { i: number; size: number; play: boolean }) {
  const p = useSharedValue(0);
  useEffect(() => {
    if (play) p.value = withDelay(500 + i * 25, withTiming(1, { duration: 900, easing: Easing.out(Easing.cubic) }));
  }, [play, i, p]);
  const angle = (i / SPARKS.length) * Math.PI * 2;
  const dist = size * 0.62;
  const st = useAnimatedStyle(() => ({
    opacity: p.value === 0 ? 0 : 1 - p.value,
    transform: [{ translateX: Math.cos(angle) * dist * p.value }, { translateY: Math.sin(angle) * dist * p.value }, { scale: 1 - p.value * 0.4 }],
  }));
  return (
    <Animated.View
      style={[{ position: 'absolute', width: 9, height: 9, borderRadius: 5, backgroundColor: i % 2 ? colors.accent : colors.primary }, st]}
    />
  );
}

/** Order / payment success: ring draws, tick draws, confetti sparks burst. */
export function SuccessCheck({ size = 132, tone = 'success' }: { size?: number; tone?: 'success' | 'pending' | 'error' }) {
  const ring = useSharedValue(CIRC);
  const tick = useSharedValue(100);
  const pop = useSharedValue(0.92);
  const reduce = useReducedMotion();
  const color = tone === 'success' ? colors.success : tone === 'pending' ? colors.warning : colors.error;

  useEffect(() => {
    if (reduce) {
      ring.value = 0; tick.value = 0; pop.value = 1;
      return;
    }
    ring.value = withTiming(0, { duration: 650, easing: Easing.out(Easing.cubic) });
    tick.value = withDelay(500, withTiming(0, { duration: 380, easing: Easing.out(Easing.quad) }));
    pop.value = withSequence(withTiming(0.92, { duration: 0 }), withTiming(1, timingConfig(duration.large)));
  }, [reduce, ring, tick, pop]);

  const ringProps = useAnimatedProps(() => ({ strokeDashoffset: ring.value }));
  const tickProps = useAnimatedProps(() => ({ strokeDashoffset: tick.value }));
  const popStyle = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }));

  const glyph =
    tone === 'success' ? 'M32 52 L45 65 L70 36' : tone === 'pending' ? 'M50 30 L50 52 L66 62' : 'M36 36 L64 64 M64 36 L36 64';

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }} accessible accessibilityLabel={tone === 'success' ? 'Success' : tone === 'pending' ? 'Pending' : 'Failed'}>
      {tone === 'success' && !reduce && SPARKS.map((i) => <Spark key={i} i={i} size={size} play />)}
      <Animated.View style={popStyle}>
        <Svg width={size} height={size} viewBox="0 0 100 100">
          <Circle cx="50" cy="50" r={R} fill={tone === 'success' ? colors.successSoft : tone === 'pending' ? colors.accentSoft : colors.errorSoft} />
          <AnimatedCircle
            cx="50" cy="50" r={R} stroke={color} strokeWidth="5" fill="none" strokeLinecap="round"
            strokeDasharray={`${CIRC}`} animatedProps={ringProps} rotation="-90" origin="50, 50"
          />
          <AnimatedPath
            d={glyph} stroke={color} strokeWidth="6" fill="none" strokeLinecap="round" strokeLinejoin="round"
            strokeDasharray="100" animatedProps={tickProps}
          />
        </Svg>
      </Animated.View>
    </View>
  );
}
