import { CommonActions } from '@react-navigation/native';
import React, { useRef, useState } from 'react';
import { View } from 'react-native';
import { PressableScale } from '../animations/PressableScale';
import { AppText } from '../components/AppText';
import { AuthField, AuthLayout, FormBanner, InputRef, PasswordField, PhoneField } from '../components/AuthKit';
import { DemoTag } from '../components/Atoms';
import { Button } from '../components/Button';
import { useOtpFlow } from '../hooks/useOtpFlow';
import type { RootScreenProps } from '../navigation/types';
import { authApi, AuthError } from '../services/authApi';
import { useAuth } from '../store/useAuth';
import { useCapabilities } from '../store/useCapabilities';
import { toast } from '../store/useToast';
import { colors, spacing } from '../theme';
import { hasErrors, phoneInput, validateIdentifier, validatePhone } from '../utils/validation';

/**
 * Mobile-number-first sign-in.
 *   1. Enter your mobile number.
 *   2a. When the server can send codes: enter the 6-digit code.
 *   2b. Otherwise (or if you prefer): enter your password. Email + password stays available under "Use email instead".
 * Signing up and everything after sign-in are unchanged.
 */
type Mode = 'phone' | 'code' | 'password';

const SubLink = ({ label, onPress }: { label: string; onPress: () => void }) => (
  <PressableScale onPress={onPress} accessibilityLabel={label} style={{ alignSelf: 'center', minHeight: 44, justifyContent: 'center', marginTop: spacing.sm }}>
    <AppText variant="bodyMedium" color={colors.primary} weight="semi">{label}</AppText>
  </PressableScale>
);

export function LoginScreen({ navigation, route }: RootScreenProps<'Login'>) {
  const login = useAuth((s) => s.login);
  const signInWith = useAuth((s) => s.signInWith);
  const demoLogin = useAuth((s) => s.demoLogin);
  const otpMode = useCapabilities((s) => s.caps.otp);
  const canOtp = otpMode !== 'none' && !!authApi.requestOtp;

  const [mode, setMode] = useState<Mode>('phone');
  const [phone, setPhone] = useState('');
  const [phoneError, setPhoneError] = useState<string | undefined>();
  /** True when the password step follows the phone step, so the number is shown as a summary instead of asked again. */
  const [phoneFirst, setPhoneFirst] = useState(false);
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ identifier?: string; password?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'login' | 'demo' | null>(null);
  const pwRef = useRef<InputRef>(null);
  const lock = useRef(false); // blocks double taps before state updates land

  const finish = () => {
    toast('Signed in', 'success');
    const redirect = route.params?.redirect;
    if (redirect) navigation.replace(redirect);
    else if (navigation.canGoBack()) navigation.goBack();
    else navigation.dispatch(CommonActions.reset({ index: 0, routes: [{ name: 'Main' }] }));
  };

  const otp = useOtpFlow(
    authApi.requestOtp && authApi.verifyOtp
      ? { request: authApi.requestOtp, verify: authApi.verifyOtp, smsNote: 'If this number has an account, we have sent a 6-digit code by SMS.' }
      : undefined,
    async (result) => { await signInWith(result); finish(); },
  );

  const goPhone = () => { otp.reset(); setFormError(null); setPassword(''); setErrors({}); setMode('phone'); };

  const onContinue = async () => {
    const e = validatePhone(phone);
    setPhoneError(e);
    setFormError(null);
    if (e) return;
    if (canOtp) {
      if (await otp.send(phone)) setMode('code');
      return;
    }
    // No SMS provider: the same number is used with a password.
    setPhoneFirst(true);
    setIdentifier(phone);
    setMode('password');
  };

  const submitPassword = async () => {
    if (lock.current) return;
    const e = { identifier: validateIdentifier(identifier), password: password ? undefined : 'Enter your password' };
    setErrors(e);
    setFormError(null);
    if (hasErrors(e)) return;
    lock.current = true;
    setBusy('login');
    try {
      await login({ identifier, password });
      finish();
    } catch (err) {
      const ae = err as AuthError;
      if (ae.field === 'identifier') setErrors({ identifier: ae.message });
      else setFormError(ae.message || 'Could not sign in. Please try again.');
    } finally {
      lock.current = false;
      setBusy(null);
    }
  };

  const runDemo = async () => {
    if (lock.current) return;
    lock.current = true;
    setBusy('demo');
    setFormError(null);
    try {
      await demoLogin();
      finish();
    } catch (err) {
      setFormError((err as Error).message);
    } finally {
      lock.current = false;
      setBusy(null);
    }
  };

  const shownPhone = `+91 ${phone.slice(0, 5)} ${phone.slice(5)}`.trim();
  const subtitle = mode === 'code' ? 'Enter the code we sent you' : mode === 'password' ? (phoneFirst ? 'Enter your password to continue' : 'Log in with your email or mobile number') : 'Log in with your mobile number';

  return (
    <AuthLayout title={mode === 'phone' ? 'Welcome to Shree Hari' : 'Log in'} subtitle={subtitle}>
      {!!route.params?.redirect && <FormBanner tone="info" text="Please log in to continue to checkout. Your cart will be kept." />}
      {!!formError && <FormBanner tone="error" text={formError} />}

      {mode === 'phone' && (
        <>
          {!!otp.banner && otp.banner.tone === 'error' && <FormBanner tone="error" text={otp.banner.text} />}
          <PhoneField
            label="Mobile number"
            value={phone}
            onChangeText={(t) => { setPhone(phoneInput(t)); setPhoneError(undefined); }}
            error={phoneError ?? otp.error}
            placeholder="98765 43210"
            returnKeyType="go"
            onSubmitEditing={onContinue}
            autoFocus
          />
          <Button title="Continue" iconRight="arrow-forward" onPress={onContinue} loading={otp.busy} />
          <AppText variant="caption" color={colors.textMuted} align="center" style={{ marginTop: spacing.md }}>
            {canOtp ? 'We will text you a 6-digit code to log in.' : 'You will enter your password on the next step.'}
          </AppText>
          <SubLink label="Use email and password instead" onPress={() => { setPhoneFirst(false); setIdentifier(''); setMode('password'); }} />
        </>
      )}

      {mode === 'code' && (
        <>
          {!!otp.banner && <FormBanner tone={otp.banner.tone} text={otp.banner.text} />}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.lg }}>
            <AppText variant="bodyMedium" weight="semi">{shownPhone}</AppText>
            <PressableScale onPress={goPhone} accessibilityLabel="Change mobile number" style={{ minHeight: 44, justifyContent: 'center' }}>
              <AppText variant="bodyMedium" color={colors.primary} weight="semi">Change</AppText>
            </PressableScale>
          </View>
          <AuthField
            label="6-digit code" value={otp.code} onChangeText={otp.setCode} error={otp.error}
            keyboardType="number-pad" maxLength={6} returnKeyType="go" onSubmitEditing={() => otp.verify(phone)}
            autoComplete="sms-otp" textContentType="oneTimeCode" placeholder="······" autoFocus
          />
          <Button title="Verify and log in" onPress={() => otp.verify(phone)} loading={otp.busy} />
          <Button title={otp.cooldown > 0 ? `Resend code in ${otp.cooldown}s` : 'Resend code'} variant="ghost" disabled={otp.cooldown > 0 || otp.busy} onPress={() => { void otp.send(phone); }} style={{ marginTop: spacing.sm }} />
          <AppText variant="caption" color={colors.textMuted} align="center">Codes expire after a few minutes and work once.</AppText>
          <SubLink label="Use password instead" onPress={() => { otp.reset(); setPhoneFirst(true); setIdentifier(phone); setMode('password'); }} />
        </>
      )}

      {mode === 'password' && (
        <>
          {phoneFirst ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.lg }}>
              <AppText variant="bodyMedium" weight="semi">{shownPhone}</AppText>
              <PressableScale onPress={goPhone} accessibilityLabel="Change mobile number" style={{ minHeight: 44, justifyContent: 'center' }}>
                <AppText variant="bodyMedium" color={colors.primary} weight="semi">Change</AppText>
              </PressableScale>
            </View>
          ) : (
            <AuthField
              label="Mobile number or email"
              value={identifier}
              onChangeText={(t) => { setIdentifier(t); setErrors((x) => ({ ...x, identifier: undefined })); }}
              error={errors.identifier}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              textContentType="username"
              autoComplete="username"
              returnKeyType="next"
              onSubmitEditing={() => pwRef.current?.focus()}
              placeholder="98765 43210 or you@example.com"
            />
          )}
          <PasswordField
            ref={pwRef}
            label="Password"
            value={password}
            onChangeText={(t) => { setPassword(t); setErrors((x) => ({ ...x, password: undefined })); }}
            error={errors.password}
            returnKeyType="go"
            onSubmitEditing={submitPassword}
            autoComplete="current-password"
            placeholder="Your password"
            autoFocus={phoneFirst}
          />
          <PressableScale onPress={() => navigation.navigate('ForgotPassword')} accessibilityLabel="Forgot password" style={{ alignSelf: 'flex-end', minHeight: 44, justifyContent: 'center', marginTop: -spacing.sm }}>
            <AppText variant="bodyMedium" color={colors.primary} weight="semi">Forgot password?</AppText>
          </PressableScale>
          <Button title="Log in" onPress={submitPassword} loading={busy === 'login'} disabled={busy === 'demo'} style={{ marginTop: spacing.md }} />
          {canOtp && <SubLink label="Log in with a code instead" onPress={goPhone} />}
          {!canOtp && !phoneFirst && <SubLink label="Log in with mobile number" onPress={goPhone} />}
        </>
      )}

      <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: spacing.xl, gap: 6 }}>
        <AppText variant="body" color={colors.textMuted}>New to Shree Hari?</AppText>
        <PressableScale onPress={() => navigation.replace('Signup', route.params)} accessibilityLabel="Create an account" style={{ minHeight: 44, justifyContent: 'center' }}>
          <AppText variant="bodyMedium" color={colors.primary} weight="bold">Create an account</AppText>
        </PressableScale>
      </View>

      {!!authApi.demoLogin && mode !== 'code' && (
        <View style={{ marginTop: spacing.lg, gap: spacing.sm }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
            <DemoTag label="DEMO ONLY" />
            <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
          </View>
          <Button title="Continue as demo customer" variant="soft" icon="flask-outline" onPress={runDemo} loading={busy === 'demo'} disabled={busy === 'login'} />
          <AppText variant="caption" color={colors.textMuted} align="center">
            {authApi.mode === 'demo' ? 'Demo mode: accounts are stored on this device only. No OTP or SMS is sent.' : 'Signs in as the seeded demo customer on the demo backend.'}
          </AppText>
        </View>
      )}
    </AuthLayout>
  );
}

