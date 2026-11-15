import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { ActivityIndicator, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { PressableScale } from '../animations/PressableScale';
import { colors, control, gradients, radius, shadow, type as t } from '../theme';
import { AppText } from './AppText';

type Props = {
  title: string;
  onPress?: () => void;
  variant?: 'primary' | 'outline' | 'gold' | 'soft' | 'ghost';
  icon?: keyof typeof Ionicons.glyphMap;
  iconRight?: keyof typeof Ionicons.glyphMap;
  loading?: boolean;
  disabled?: boolean;
  size?: 'md' | 'sm';
  style?: StyleProp<ViewStyle>;
  haptic?: boolean;
};

export function Button({ title, onPress, variant = 'primary', icon, iconRight, loading, disabled, size = 'md', style, haptic = true }: Props) {
  const inactive = disabled || loading;
  const fg = variant === 'primary' ? colors.white : variant === 'gold' ? colors.onAccent : colors.primary;
  const h = size === 'md' ? control.button : control.buttonSm;
  const bg =
    variant === 'outline' ? { backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.border } :
    variant === 'soft' ? { backgroundColor: colors.primarySoft } :
    variant === 'ghost' ? { backgroundColor: 'transparent' } : null;

  return (
    <PressableScale
      onPress={inactive ? undefined : onPress}
      disabled={inactive}
      haptic={haptic}
      accessibilityLabel={title}
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      style={[{ height: h, borderRadius: radius.pill, opacity: disabled ? 0.45 : 1 }, variant === 'primary' && shadow.lift, bg, style]}
    >
      {(variant === 'primary' || variant === 'gold') && (
        <LinearGradient
          colors={variant === 'primary' ? gradients.button : gradients.gold}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[StyleSheet.absoluteFill, { borderRadius: radius.pill }]}
        />
      )}
      <View style={styles.row}>
        {loading ? (
          <ActivityIndicator color={fg} size="small" />
        ) : (
          <>
            {icon && <Ionicons name={icon} size={size === 'md' ? 20 : 16} color={fg} />}
            <AppText numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85} style={[size === 'md' ? t.button : t.buttonSm, { color: fg, flexShrink: 1 }]}>{title}</AppText>
            {iconRight && <Ionicons name={iconRight} size={size === 'md' ? 20 : 16} color={fg} />}
          </>
        )}
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  row: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 14 },
});
