import { Ionicons } from '@expo/vector-icons';
import React, { forwardRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TextInput, TextInputProps, View } from 'react-native';
import { PressableScale } from '../animations/PressableScale';
import { colors, control, inputType, layout, radius, spacing, fontScale } from '../theme';
import { AppText } from './AppText';
import { BrandHeader, Sheet } from './BrandHeader';

/** Shared frame for Login / Signup / Forgot password: header, cream sheet, keyboard-aware scrolling. */
export function AuthLayout({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <BrandHeader title={title} subtitle={subtitle} />
      <Sheet>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scroll}
          >
            <View style={styles.column}>{children}</View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Sheet>
    </View>
  );
}

export type InputRef = React.ElementRef<typeof TextInput>;
type FieldProps = TextInputProps & { label: string; error?: string; hint?: string };

/** Labelled input with inline error. All inputs share one height and radius. */
export const AuthField = forwardRef<InputRef, FieldProps>(function AuthField({ label, error, hint, style, ...rest }, ref) {
  return (
    <View style={styles.fieldWrap}>
      <AppText variant="captionMedium" color={colors.textMuted} style={{ marginBottom: 6 }}>{label}</AppText>
      <TextInput
        maxFontSizeMultiplier={fontScale.max}
        ref={ref}
        placeholderTextColor={colors.textMuted}
        accessibilityLabel={label}
        {...rest}
        style={[styles.input, !!error && { borderColor: colors.error }, style]}
      />
      {!!error ? (
        <AppText variant="caption" color={colors.error} style={styles.msg} accessibilityLiveRegion="polite">{error}</AppText>
      ) : !!hint ? (
        <AppText variant="caption" color={colors.textMuted} style={styles.msg}>{hint}</AppText>
      ) : null}
    </View>
  );
});

/**
 * Mobile number field with a fixed "+91" prefix. The app serves Indian numbers only (see utils/validation.ts), so the prefix is a
 * label rather than a picker; a picker with one choice would only add a tap.
 */
export const PhoneField = forwardRef<InputRef, Omit<FieldProps, 'keyboardType' | 'maxLength'>>(function PhoneField({ label, error, hint, style, ...rest }, ref) {
  return (
    <View style={styles.fieldWrap}>
      <AppText variant="captionMedium" color={colors.textMuted} style={{ marginBottom: 6 }}>{label}</AppText>
      <View style={styles.phoneRow}>
        <View style={[styles.prefix, !!error && { borderColor: colors.error }]} accessible accessibilityLabel="Country code plus 91, India">
          <AppText variant="bodyMedium" weight="semi">+91</AppText>
        </View>
        <TextInput
          maxFontSizeMultiplier={fontScale.max}
          ref={ref}
          placeholderTextColor={colors.textMuted}
          accessibilityLabel={label}
          keyboardType="phone-pad"
          maxLength={10}
          autoComplete="tel"
          textContentType="telephoneNumber"
          {...rest}
          style={[styles.input, { flex: 1 }, !!error && { borderColor: colors.error }, style]}
        />
      </View>
      {!!error ? (
        <AppText variant="caption" color={colors.error} style={styles.msg} accessibilityLiveRegion="polite">{error}</AppText>
      ) : !!hint ? (
        <AppText variant="caption" color={colors.textMuted} style={styles.msg}>{hint}</AppText>
      ) : null}
    </View>
  );
});

export const PasswordField = forwardRef<InputRef, FieldProps>(function PasswordField({ label, error, hint, ...rest }, ref) {
  const [show, setShow] = useState(false);
  return (
    <View style={styles.fieldWrap}>
      <AppText variant="captionMedium" color={colors.textMuted} style={{ marginBottom: 6 }}>{label}</AppText>
      <View>
        <TextInput
        maxFontSizeMultiplier={fontScale.max}
          ref={ref}
          secureTextEntry={!show}
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="password"
          placeholderTextColor={colors.textMuted}
          accessibilityLabel={label}
          {...rest}
          style={[styles.input, { paddingRight: 52 }, !!error && { borderColor: colors.error }]}
        />
        <PressableScale onPress={() => setShow((s) => !s)} accessibilityLabel={show ? 'Hide password' : 'Show password'} style={styles.eye} scaleTo={0.9}>
          <Ionicons name={show ? 'eye-off-outline' : 'eye-outline'} size={22} color={colors.textMuted} />
        </PressableScale>
      </View>
      {!!error ? <AppText variant="caption" color={colors.error} style={styles.msg} accessibilityLiveRegion="polite">{error}</AppText> : !!hint ? <AppText variant="caption" color={colors.textMuted} style={styles.msg}>{hint}</AppText> : null}
    </View>
  );
});

export function FormBanner({ tone, text }: { tone: 'error' | 'info'; text: string }) {
  const err = tone === 'error';
  return (
    <View style={[styles.banner, { backgroundColor: err ? colors.errorSoft : colors.accentSoft }]} accessibilityLiveRegion="polite">
      <Ionicons name={err ? 'alert-circle' : 'information-circle'} size={20} color={err ? colors.error : colors.secondary} />
      <AppText variant="bodyMedium" color={colors.text} style={{ flex: 1 }}>{text}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 1, paddingHorizontal: layout.gutter, paddingTop: spacing.xl, paddingBottom: spacing.huge + 24 },
  column: { width: '100%', maxWidth: layout.maxContentWidth, alignSelf: 'center' },
  fieldWrap: { marginBottom: spacing.lg },
  input: {
    height: control.input, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.surface,
    paddingHorizontal: 16, ...inputType.large, color: colors.text,
  },
  eye: { position: 'absolute', right: 4, top: 0, width: control.minTouch, height: control.input, alignItems: 'center', justifyContent: 'center' },
  msg: { marginTop: 6 },
  phoneRow: { flexDirection: 'row', gap: spacing.sm },
  prefix: { height: control.input, minWidth: 64, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.backgroundAlt, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.md },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: radius.md, marginBottom: spacing.lg },
});
