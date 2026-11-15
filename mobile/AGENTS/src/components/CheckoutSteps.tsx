import { duration, timingConfig } from '../animations/motion';
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { colors, fonts } from '../theme';
import { AppText } from './AppText';

const STEPS = ['Address', 'Payment', 'Confirm'];
const DOT = 38;
const COL = 64; // each step is one column: circle on top, its label centred underneath

function Bar({ filled }: { filled: number }) {
  const w = useSharedValue(0);
  useEffect(() => { w.value = withTiming(filled, { duration: 500 }); }, [filled, w]);
  const st = useAnimatedStyle(() => ({ width: `${w.value * 100}%` }));
  return (
    <View style={styles.bar}>
      <Animated.View style={[{ height: 2, backgroundColor: colors.primary }, st]} />
    </View>
  );
}

function Dot({ n, state }: { n: number; state: 'done' | 'current' | 'todo' }) {
  const s = useSharedValue(1);
  useEffect(() => { s.value = withTiming(state === 'current' ? 1.06 : 1, timingConfig(duration.card)); }, [state, s]);
  const st = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  const active = state !== 'todo';
  return (
    <Animated.View style={[styles.dot, active ? { backgroundColor: colors.primary, borderColor: colors.primary } : null, st]}>
      {state === 'done' ? <Ionicons name="checkmark" size={20} color={colors.onPrimary} /> : <AppText variant="stepNumber" color={active ? colors.onPrimary : colors.textMuted}>{n}</AppText>}
    </Animated.View>
  );
}

function Step({ n, label, state, on }: { n: number; label: string; state: 'done' | 'current' | 'todo'; on: boolean }) {
  return (
    <View style={styles.col}>
      <Dot n={n} state={state} />
      <AppText variant="stepLabel" numberOfLines={1} color={on ? colors.text : colors.textMuted} style={{ marginTop: 4, textAlign: 'center', fontFamily: state === 'current' ? fonts.bold : fonts.medium }}>{label}</AppText>
    </View>
  );
}

/** Animated 3-step progress used across Address → Payment → Confirm. step is 1..3, done=true marks 3 as complete. */
export function CheckoutSteps({ step, allDone }: { step: 1 | 2 | 3; allDone?: boolean }) {
  const state = (i: number) => (allDone || i < step ? 'done' : i === step ? 'current' : 'todo') as 'done' | 'current' | 'todo';
  const on = (i: number) => i <= step || !!allDone;
  return (
    <View style={{ marginTop: 8, flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'center' }}>
      <Step n={1} label={STEPS[0]} state={state(1)} on={on(1)} />
      <Bar filled={step > 1 || allDone ? 1 : 0.5} />
      <Step n={2} label={STEPS[1]} state={state(2)} on={on(2)} />
      <Bar filled={step > 2 || allDone ? 1 : step === 2 ? 0.5 : 0} />
      <Step n={3} label={STEPS[2]} state={state(3)} on={on(3)} />
    </View>
  );
}

const styles = StyleSheet.create({
  col: { width: COL, alignItems: 'center' },
  dot: { width: DOT, height: DOT, borderRadius: DOT / 2, borderWidth: 2, borderColor: colors.border, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  // the connector runs through the middle of the circles, between the two columns
  bar: { flex: 1, height: 2, marginTop: DOT / 2 - 1, backgroundColor: colors.border, overflow: 'hidden', maxWidth: 110 },
});
