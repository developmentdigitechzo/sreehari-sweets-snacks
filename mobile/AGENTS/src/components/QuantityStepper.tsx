import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, FadeOutUp } from 'react-native-reanimated';
import { PressableScale } from '../animations/PressableScale';
import { colors, radius, alpha } from '../theme';
import { AppText } from './AppText';

type Props = {
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  tone?: 'solid' | 'outline';
  height?: number;
  label?: string;
  btn?: number;
};

export function QuantityStepper({ value, onChange, min = 0, max = 20, tone = 'solid', height = 40, label = 'quantity', btn = 40 }: Props) {
  const solid = tone === 'solid';
  const fg = solid ? colors.white : colors.primary;
  return (
    <View
      style={[styles.wrap, { height, backgroundColor: solid ? colors.primary : colors.surface }, !solid && styles.outline]}
      accessibilityRole="adjustable"
      accessibilityLabel={`${label}: ${value}`}
    >
      <PressableScale style={[styles.btn, { width: btn }]} onPress={() => onChange(Math.max(min, value - 1))} accessibilityLabel={`Decrease ${label}`} haptic scaleTo={0.8}>
        <Ionicons name={value <= 1 && min === 0 ? 'remove' : 'remove'} size={18} color={fg} />
      </PressableScale>
      <View style={styles.valueBox}>
        <Animated.View key={value} entering={FadeInDown.duration(160)} exiting={FadeOutUp.duration(100)}>
          <AppText variant="buttonSm" color={fg}>{value}</AppText>
        </Animated.View>
      </View>
      <PressableScale style={[styles.btn, { width: btn }]} onPress={() => value < max && onChange(value + 1)} accessibilityLabel={`Increase ${label}`} haptic scaleTo={0.8} disabled={value >= max}>
        <Ionicons name="add" size={18} color={value >= max ? alpha.white(0.4) : fg} />
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', borderRadius: radius.pill, overflow: 'hidden' },
  outline: { borderWidth: 1.5, borderColor: colors.border },
  btn: { width: 40, height: '100%', alignItems: 'center', justifyContent: 'center' },
  valueBox: { minWidth: 22, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', height: '100%' },
});
