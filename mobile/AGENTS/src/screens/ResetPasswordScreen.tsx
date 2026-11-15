import React, { useRef, useState } from 'react';
import { AuthField, AuthLayout, FormBanner, InputRef, PasswordField } from '../components/AuthKit';
import { Button } from '../components/Button';
import type { RootScreenProps } from '../navigation/types';
import { authApi } from '../services/authApi';
import { spacing } from '../theme';
import { hasErrors, validateConfirm, validatePassword } from '../utils/validation';

/** Opens from the emailed link (shreehari://reset-password?token=...) or lets the user paste the token. */
export function ResetPasswordScreen({ navigation, route }: RootScreenProps<'ResetPassword'>) {
  const [token, setToken] = useState(route.params?.token ?? '');
  const [pw, setPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<{ token?: string; pw?: string; confirm?: string }>({});
  const [banner, setBanner] = useState<{ tone: 'error' | 'info'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const lock = useRef(false);
  const confirmRef = useRef<InputRef>(null);

  const submit = async () => {
    if (lock.current || !authApi.resetPassword) return;
    const e = { token: token.trim().length >= 20 ? undefined : 'Paste the full link or code from your email', pw: validatePassword(pw), confirm: validateConfirm(pw, confirm) };
    setErrors(e);
    if (hasErrors(e)) return;
    lock.current = true;
    setBusy(true);
    setBanner(null);
    try {
      await authApi.resetPassword(token.trim(), pw);
      setDone(true);
    } catch (err) {
      setBanner({ tone: 'error', text: (err as Error).message });
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };

  if (!authApi.resetPassword) {
    return (
      <AuthLayout title="Reset password" subtitle="Not available">
        <FormBanner tone="info" text="Password reset needs the live backend and an email provider. It is not available in demo mode." />
        <Button title="Back" onPress={() => navigation.goBack()} />
      </AuthLayout>
    );
  }
  if (done) {
    return (
      <AuthLayout title="Password updated" subtitle="You can log in now">
        <FormBanner tone="info" text="Your password was changed. The reset link can no longer be used." />
        <Button title="Log in" onPress={() => navigation.replace('Login')} />
      </AuthLayout>
    );
  }
  return (
    <AuthLayout title="Choose a new password" subtitle="Use the link from your email">
      {!!banner && <FormBanner tone={banner.tone} text={banner.text} />}
      {!route.params?.token && (
        <AuthField label="Reset code from your email" value={token} onChangeText={(t) => { setToken(t); setErrors((x) => ({ ...x, token: undefined })); }} error={errors.token} autoCapitalize="none" autoCorrect={false} placeholder="Paste the code from the link" />
      )}
      <PasswordField label="New password" value={pw} onChangeText={(t) => { setPw(t); setErrors((x) => ({ ...x, pw: undefined })); }} error={errors.pw} hint="At least 8 characters, with a letter and a number" returnKeyType="next" onSubmitEditing={() => confirmRef.current?.focus()} autoComplete="new-password" />
      <PasswordField ref={confirmRef} label="Confirm new password" value={confirm} onChangeText={(t) => { setConfirm(t); setErrors((x) => ({ ...x, confirm: undefined })); }} error={errors.confirm} returnKeyType="go" onSubmitEditing={submit} autoComplete="new-password" />
      <Button title="Update password" onPress={submit} loading={busy} style={{ marginTop: spacing.sm }} />
    </AuthLayout>
  );
}
