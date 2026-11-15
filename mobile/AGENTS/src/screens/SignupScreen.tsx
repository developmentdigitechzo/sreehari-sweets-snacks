import { Ionicons } from '@expo/vector-icons';
import { CommonActions } from '@react-navigation/native';
import React, { useRef, useState } from 'react';
import { View } from 'react-native';
import Animated from 'react-native-reanimated';
import { PressableScale } from '../animations/PressableScale';
import { riseIn } from '../animations/motion';
import { AppText } from '../components/AppText';
import { AuthField, AuthLayout, FormBanner, InputRef, PasswordField, PhoneField } from '../components/AuthKit';
import { Button } from '../components/Button';
import { SuccessCheck } from '../components/SuccessCheck';
import type { RootScreenProps } from '../navigation/types';
import { authApi, AuthError } from '../services/authApi';
import { useOtpFlow } from '../hooks/useOtpFlow';
import { useAuth } from '../store/useAuth';
import { useCapabilities } from '../store/useCapabilities';
import { colors, spacing } from '../theme';
import { hasErrors, validateConfirm, validateEmail, validateName, validatePassword, validatePhone, phoneInput } from '../utils/validation';

type Errors = Partial<Record<'name' | 'phone' | 'email' | 'password' | 'confirm' | 'consent', string>>;

export function SignupScreen({ navigation, route }: RootScreenProps<'Signup'>) {
  const signup = useAuth((s) => s.signup);
  const [f, setF] = useState({ name: '', phone: '', email: '', password: '', confirm: '' });
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [usePassword, setUsePassword] = useState(false);
  const otpMode = useCapabilities((s) => s.caps.otp);
  /** Signing up with a code needs a server that can send codes and the three sign-up calls. Otherwise the password form below is used, as before. */
  const canCode = otpMode !== 'none' && !!authApi.requestSignupOtp && !!authApi.verifySignupOtp && !!authApi.completeSignup;
  const lock = useRef(false);
  const phoneRef = useRef<InputRef>(null);
  const emailRef = useRef<InputRef>(null);
  const pwRef = useRef<InputRef>(null);
  const confirmRef = useRef<InputRef>(null);

  const set = (k: keyof typeof f) => (v: string) => { setF((x) => ({ ...x, [k]: v })); setErrors((e) => ({ ...e, [k]: undefined })); };

  const submit = async () => {
    if (lock.current) return;
    const e: Errors = {
      name: validateName(f.name),
      phone: validatePhone(f.phone),
      email: validateEmail(f.email),
      password: validatePassword(f.password),
      confirm: validateConfirm(f.password, f.confirm),
      consent: consent ? undefined : 'Please accept the terms and privacy policy to continue',
    };
    setErrors(e);
    setFormError(null);
    if (hasErrors(e)) return;
    lock.current = true;
    setBusy(true);
    try {
      await signup({ name: f.name, phone: f.phone, email: f.email || undefined, password: f.password, consent });
      setDone(f.name.trim().split(' ')[0]);
    } catch (err) {
      const ae = err as AuthError;
      if (ae.field && ae.field !== 'identifier') setErrors({ [ae.field]: ae.message } as Errors);
      else setFormError(ae.message || 'Could not create your account. Please try again.');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };

  const proceed = () => {
    const redirect = route.params?.redirect;
    if (redirect) navigation.replace(redirect);
    else navigation.dispatch(CommonActions.reset({ index: 0, routes: [{ name: 'Main' }] }));
  };

  if (done) {
    return (
      <AuthLayout title="You're all set" subtitle="Your account has been created">
        <View style={{ alignItems: 'center', gap: spacing.lg, paddingTop: spacing.xl }}>
          <SuccessCheck />
          <Animated.View entering={riseIn.delay(200)} style={{ alignItems: 'center' }}>
            <AppText variant="pageTitle" color={colors.primary}>Welcome, {done}!</AppText>
            <AppText variant="bodyLg" color={colors.textMuted} align="center" style={{ marginTop: 6 }}>
              {authApi.mode === 'demo' ? 'Demo account saved on this device.' : 'Your account is ready.'} Your cart has been kept.
            </AppText>
          </Animated.View>
          <Button title={route.params?.redirect ? 'Continue to checkout' : 'Start shopping'} onPress={proceed} style={{ alignSelf: 'stretch' }} />
        </View>
      </AuthLayout>
    );
  }

  if (canCode && !usePassword) return <CodeSignup navigation={navigation} route={route} onDone={setDone} onUsePassword={() => setUsePassword(true)} />;

  return (
    <AuthLayout title="Create account" subtitle="Join Shree Hari for faster checkout">
      {!!formError && <FormBanner tone="error" text={formError} />}
      {authApi.mode === 'demo' && <FormBanner tone="info" text="Demo mode: your account is stored on this device only. No OTP or SMS verification is performed." />}

      <AuthField label="Full name" value={f.name} onChangeText={set('name')} error={errors.name} autoCapitalize="words" autoComplete="name" textContentType="name" returnKeyType="next" onSubmitEditing={() => phoneRef.current?.focus()} placeholder="Your name" />
      <AuthField ref={phoneRef} label="Mobile number" value={f.phone} onChangeText={(t) => set('phone')(phoneInput(t))} maxLength={10} error={errors.phone} keyboardType="phone-pad" autoComplete="tel" textContentType="telephoneNumber" returnKeyType="next" onSubmitEditing={() => emailRef.current?.focus()} placeholder="98765 43210" />
      <AuthField ref={emailRef} label="Email (optional)" value={f.email} onChangeText={set('email')} error={errors.email} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="email" textContentType="emailAddress" returnKeyType="next" onSubmitEditing={() => pwRef.current?.focus()} placeholder="you@example.com" />
      <PasswordField ref={pwRef} label="Password" value={f.password} onChangeText={set('password')} error={errors.password} hint="At least 8 characters, with a letter and a number" returnKeyType="next" onSubmitEditing={() => confirmRef.current?.focus()} autoComplete="new-password" textContentType="newPassword" />
      <PasswordField ref={confirmRef} label="Confirm password" value={f.confirm} onChangeText={set('confirm')} error={errors.confirm} returnKeyType="go" onSubmitEditing={submit} autoComplete="new-password" />

      <PressableScale onPress={() => { setConsent((c) => !c); setErrors((e) => ({ ...e, consent: undefined })); }} accessibilityRole="checkbox" accessibilityState={{ checked: consent }} accessibilityLabel="Accept terms and privacy policy" style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, minHeight: 44 }}>
        <Ionicons name={consent ? 'checkbox' : 'square-outline'} size={26} color={errors.consent ? colors.error : colors.primary} />
        <AppText variant="body" style={{ flex: 1, paddingTop: 3 }}>I agree to the Terms of Use and Privacy Policy. <AppText variant="caption" color={colors.textMuted}>(Final documents to be supplied by Shree Hari.)</AppText></AppText>
      </PressableScale>
      {!!errors.consent && <AppText variant="caption" color={colors.error} style={{ marginTop: 4 }}>{errors.consent}</AppText>}

      <Button title="Create account" onPress={submit} loading={busy} style={{ marginTop: spacing.xl }} />
      {canCode && (
        <PressableScale onPress={() => setUsePassword(false)} accessibilityLabel="Sign up with a code instead" style={{ alignSelf: 'center', minHeight: 44, justifyContent: 'center', marginTop: spacing.sm }}>
          <AppText variant="bodyMedium" color={colors.primary} weight="semi">Sign up with a code instead</AppText>
        </PressableScale>
      )}

      <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: spacing.xl, gap: 6 }}>
        <AppText variant="body" color={colors.textMuted}>Already have an account?</AppText>
        <PressableScale onPress={() => navigation.replace('Login', route.params)} accessibilityLabel="Log in" style={{ minHeight: 44, justifyContent: 'center' }}>
          <AppText variant="bodyMedium" color={colors.primary} weight="bold">Log in</AppText>
        </PressableScale>
      </View>
    </AuthLayout>
  );
}

/**
 * Sign-up with a code, phone first: 1) mobile number, 2) the 6-digit code, 3) name (and optional email) creates the account.
 * The number is proven before anything is created, so there is no password to invent or forget; the customer signs in with a code later.
 */
type Step = 'phone' | 'code' | 'details';
function CodeSignup({ navigation, route, onDone, onUsePassword }: Pick<RootScreenProps<'Signup'>, 'navigation' | 'route'> & { onDone: (firstName: string) => void; onUsePassword: () => void }) {
  const signInWith = useAuth((s) => s.signInWith);
  const [step, setStep] = useState<Step>('phone');
  const [phone, setPhone] = useState('');
  const [phoneError, setPhoneError] = useState<string | undefined>();
  const [proof, setProof] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<'name' | 'email' | 'consent', string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const emailRef = useRef<InputRef>(null);

  const otp = useOtpFlow(
    authApi.requestSignupOtp && authApi.verifySignupOtp ? { request: authApi.requestSignupOtp, verify: authApi.verifySignupOtp, smsNote: 'We have sent a 6-digit code by SMS to this number.' } : undefined,
    (r) => { setProof(r.signupToken); setFormError(null); setStep('details'); },
  );

  const shown = `+91 ${phone.slice(0, 5)} ${phone.slice(5)}`.trim();
  const back = () => { otp.reset(); setProof(''); setFormError(null); setStep('phone'); };

  const onContinue = async () => {
    const e = validatePhone(phone);
    setPhoneError(e);
    if (e) return;
    if (await otp.send(phone)) setStep('code');
  };

  const create = async () => {
    if (lock.current || !authApi.completeSignup) return;
    const e = { name: validateName(name), email: validateEmail(email), consent: consent ? undefined : 'Please accept the terms and privacy policy to continue' };
    setErrors(e);
    setFormError(null);
    if (hasErrors(e)) return;
    lock.current = true;
    setBusy(true);
    try {
      const result = await authApi.completeSignup({ signupToken: proof, name: name.trim(), email: email.trim() || undefined, consent });
      await signInWith(result);
      onDone(name.trim().split(' ')[0] ?? name.trim());
    } catch (err) {
      const ae = err as AuthError;
      if (ae.field === 'email') setErrors({ email: ae.message });
      else setFormError(ae.message || 'Could not create your account. Please try again.');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };

  const subtitle = step === 'phone' ? 'Enter your mobile number to begin' : step === 'code' ? 'Enter the code we sent you' : 'One last step: tell us your name';

  return (
    <AuthLayout title="Create account" subtitle={subtitle}>
      {!!formError && <FormBanner tone="error" text={formError} />}

      {step === 'phone' && (
        <>
          {!!otp.banner && otp.banner.tone === 'error' && <FormBanner tone="error" text={otp.banner.text} />}
          <PhoneField
            label="Mobile number" value={phone} onChangeText={(t) => { setPhone(phoneInput(t)); setPhoneError(undefined); }} error={phoneError ?? otp.error}
            placeholder="98765 43210" returnKeyType="go" onSubmitEditing={onContinue} autoFocus
          />
          <Button title="Send code" iconRight="arrow-forward" onPress={onContinue} loading={otp.busy} />
          <AppText variant="caption" color={colors.textMuted} align="center" style={{ marginTop: spacing.md }}>We will text you a 6-digit code to confirm this number.</AppText>
          <PressableScale onPress={onUsePassword} accessibilityLabel="Use a password instead" style={{ alignSelf: 'center', minHeight: 44, justifyContent: 'center', marginTop: spacing.sm }}>
            <AppText variant="bodyMedium" color={colors.primary} weight="semi">Use a password instead</AppText>
          </PressableScale>
        </>
      )}

      {step === 'code' && (
        <>
          {!!otp.banner && <FormBanner tone={otp.banner.tone} text={otp.banner.text} />}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.lg }}>
            <AppText variant="bodyMedium" weight="semi">{shown}</AppText>
            <PressableScale onPress={back} accessibilityLabel="Change mobile number" style={{ minHeight: 44, justifyContent: 'center' }}>
              <AppText variant="bodyMedium" color={colors.primary} weight="semi">Change</AppText>
            </PressableScale>
          </View>
          <AuthField
            label="6-digit code" value={otp.code} onChangeText={otp.setCode} error={otp.error} keyboardType="number-pad" maxLength={6} returnKeyType="go"
            onSubmitEditing={() => otp.verify(phone)} autoComplete="sms-otp" textContentType="oneTimeCode" placeholder="······" autoFocus
          />
          <Button title="Verify" onPress={() => otp.verify(phone)} loading={otp.busy} />
          <Button title={otp.cooldown > 0 ? `Resend code in ${otp.cooldown}s` : 'Resend code'} variant="ghost" disabled={otp.cooldown > 0 || otp.busy} onPress={() => { void otp.send(phone); }} style={{ marginTop: spacing.sm }} />
          <AppText variant="caption" color={colors.textMuted} align="center">Codes expire after a few minutes and work once.</AppText>
        </>
      )}

      {step === 'details' && (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: spacing.lg }} accessibilityLabel={`${shown} verified`} accessible>
            <Ionicons name="checkmark-circle" size={22} color={colors.success} />
            <AppText variant="bodyMedium" weight="semi" style={{ flex: 1 }}>{shown}</AppText>
            <AppText variant="caption" color={colors.success}>Verified</AppText>
          </View>
          <AuthField
            label="Full name" value={name} onChangeText={(t) => { setName(t); setErrors((x) => ({ ...x, name: undefined })); }} error={errors.name}
            autoCapitalize="words" autoComplete="name" textContentType="name" returnKeyType="next" onSubmitEditing={() => emailRef.current?.focus()} placeholder="Your name" autoFocus
          />
          <AuthField
            ref={emailRef} label="Email (optional)" value={email} onChangeText={(t) => { setEmail(t); setErrors((x) => ({ ...x, email: undefined })); }} error={errors.email}
            keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="email" textContentType="emailAddress" returnKeyType="go" onSubmitEditing={create} placeholder="you@example.com"
          />
          <PressableScale
            onPress={() => { setConsent((c) => !c); setErrors((x) => ({ ...x, consent: undefined })); }} accessibilityRole="checkbox" accessibilityState={{ checked: consent }}
            accessibilityLabel="Accept terms and privacy policy" style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, minHeight: 44 }}
          >
            <Ionicons name={consent ? 'checkbox' : 'square-outline'} size={26} color={errors.consent ? colors.error : colors.primary} />
            <AppText variant="body" style={{ flex: 1, paddingTop: 3 }}>I agree to the Terms of Use and Privacy Policy. <AppText variant="caption" color={colors.textMuted}>(Final documents to be supplied by Shree Hari.)</AppText></AppText>
          </PressableScale>
          {!!errors.consent && <AppText variant="caption" color={colors.error} style={{ marginTop: 4 }}>{errors.consent}</AppText>}
          <Button title="Create account" onPress={create} loading={busy} style={{ marginTop: spacing.xl }} />
          <PressableScale onPress={back} accessibilityLabel="Use a different number" style={{ alignSelf: 'center', minHeight: 44, justifyContent: 'center', marginTop: spacing.sm }}>
            <AppText variant="bodyMedium" color={colors.primary} weight="semi">Use a different number</AppText>
          </PressableScale>
        </>
      )}

      <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: spacing.xl, gap: 6 }}>
        <AppText variant="body" color={colors.textMuted}>Already have an account?</AppText>
        <PressableScale onPress={() => navigation.replace('Login', route.params)} accessibilityLabel="Log in" style={{ minHeight: 44, justifyContent: 'center' }}>
          <AppText variant="bodyMedium" color={colors.primary} weight="bold">Log in</AppText>
        </PressableScale>
      </View>
    </AuthLayout>
  );
}
