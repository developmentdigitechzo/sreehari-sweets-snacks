import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { AppText } from '../components/AppText';
import { AuthLayout, FormBanner } from '../components/AuthKit';
import { Button } from '../components/Button';
import type { RootScreenProps } from '../navigation/types';
import { authApi } from '../services/authApi';
import { useAuth } from '../store/useAuth';
import { colors, spacing } from '../theme';

/** Opens from the emailed link (shreehari://verify-email?token=...). The token is used once and proves ownership of the address. */
export function VerifyEmailScreen({ navigation, route }: RootScreenProps<'VerifyEmail'>) {
  const token = route.params?.token;
  const refreshUser = useAuth((s) => s.refreshUser);
  const [state, setState] = useState<'working' | 'ok' | 'error'>('working');
  const [message, setMessage] = useState('');
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (!authApi.verifyEmail) { setState('error'); setMessage('Email verification needs the live backend and an email provider.'); return; }
    if (!token) { setState('error'); setMessage('This link is incomplete. Open the link from your email again.'); return; }
    authApi.verifyEmail(token)
      .then(async () => { await refreshUser(); setState('ok'); })
      .catch((e: Error) => { setState('error'); setMessage(e.message); });
  }, [token, refreshUser]);

  if (state === 'working') {
    return (
      <AuthLayout title="Verifying your email" subtitle="One moment">
        <View style={{ alignItems: 'center', paddingVertical: spacing.xl }}><ActivityIndicator color={colors.primary} size="large" /></View>
      </AuthLayout>
    );
  }
  if (state === 'ok') {
    return (
      <AuthLayout title="Email verified" subtitle="Thank you">
        <View style={{ alignItems: 'center', gap: spacing.md, paddingVertical: spacing.lg }}>
          <Ionicons name="checkmark-circle" size={64} color={colors.success} />
          <AppText variant="body" align="center">Your email address is confirmed. Order updates and receipts can now reach you.</AppText>
        </View>
        <Button title="Continue shopping" onPress={() => navigation.reset({ index: 0, routes: [{ name: 'Main' }] })} />
      </AuthLayout>
    );
  }
  return (
    <AuthLayout title="Could not verify" subtitle="The link did not work">
      <FormBanner tone="error" text={message} />
      <AppText variant="body" color={colors.textMuted}>Open Account, tap “Verify email” to get a fresh link, and use the newest email.</AppText>
      <Button title="Back to the app" variant="outline" onPress={() => navigation.reset({ index: 0, routes: [{ name: 'Main' }] })} style={{ marginTop: spacing.md }} />
    </AuthLayout>
  );
}
