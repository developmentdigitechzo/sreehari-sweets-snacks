import React, { useRef, useState } from 'react';
import { AuthField, AuthLayout, FormBanner } from '../components/AuthKit';
import { Button } from '../components/Button';
import type { RootScreenProps } from '../navigation/types';
import { authApi } from '../services/authApi';
import { spacing } from '../theme';
import { validateEmail } from '../utils/validation';

/** Reset links are sent by email. In demo mode (or when the server has no email provider) the screen says so honestly. */
export function ForgotPasswordScreen({ navigation }: RootScreenProps<'ForgotPassword'>) {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ sent: boolean; message: string } | null>(null);
  const lock = useRef(false);

  const submit = async () => {
    if (lock.current) return;
    const e = validateEmail(email, true);
    setError(e);
    if (e) return;
    lock.current = true;
    setBusy(true);
    setResult(null);
    try {
      setResult(await authApi.requestPasswordReset(email.trim()));
    } catch (err) {
      setResult({ sent: false, message: (err as Error).message });
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };

  return (
    <AuthLayout title="Reset password" subtitle="We'll email you a reset link">
      {result && <FormBanner tone={result.sent ? 'info' : 'error'} text={result.message} />}
      <AuthField label="Email address" value={email} onChangeText={(t) => { setEmail(t); setError(undefined); }} error={error} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" returnKeyType="go" onSubmitEditing={submit} placeholder="you@example.com" hint="Use the email on your account." />
      <Button title="Send reset link" onPress={submit} loading={busy} />
      {result?.sent && authApi.resetPassword && <Button title="I have the link" variant="outline" onPress={() => navigation.navigate('ResetPassword')} style={{ marginTop: spacing.sm }} />}
      <Button title="Back to log in" variant="ghost" onPress={() => navigation.goBack()} style={{ marginTop: spacing.sm }} />
    </AuthLayout>
  );
}
