import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { View } from 'react-native';
import { usePermissionStatus } from '../hooks/usePermissionStatus';
import { api } from '../services/api';
import { ensurePermission, openAppSettings, PERMISSION_COPY, type PermissionInfo, type PermissionKind } from '../services/permissions/permissionService';
import { syncPushRegistration } from '../services/permissions/notificationPermission';
import { useAuth } from '../store/useAuth';
import { toast } from '../store/useToast';
import { colors, radius, spacing } from '../theme';
import { AppText } from './AppText';
import { Button } from './Button';

const WHAT_FOR: Record<PermissionKind, string> = {
  location: 'Only when you tap "Use my current location" while adding an address. One reading, never in the background.',
  camera: 'Only when you tap Camera to take a profile photo. The photo stays on this phone until you confirm it.',
  notifications: 'Order updates: confirmed, on the way, delivered, cancellations and refunds.',
};

export function statusLabel(info: PermissionInfo | null): { text: string; tone: 'ok' | 'warn' | 'muted' } {
  if (!info) return { text: 'Checking…', tone: 'muted' };
  if (info.revoked && info.state !== 'granted') return { text: 'Turned off in Settings', tone: 'warn' };
  switch (info.state) {
    case 'granted': return { text: 'Allowed', tone: 'ok' };
    case 'undetermined': return { text: 'Not asked yet', tone: 'muted' };
    case 'denied': return { text: 'Not allowed', tone: 'warn' };
    case 'blocked': return { text: 'Off in Settings', tone: 'warn' };
    case 'restricted': return { text: 'Restricted by this device', tone: 'muted' };
    default: return { text: 'Not available here', tone: 'muted' };
  }
}

/** One permission: what it is for, its live state, and the one sensible action (Allow, or Open Settings when only Settings can change it). */
export function PermissionRow({ kind }: { kind: PermissionKind }) {
  const { info, refresh } = usePermissionStatus(kind);
  const userId = useAuth((s) => s.user?.id);
  const copy = PERMISSION_COPY[kind];
  const label = statusLabel(info);
  const toneColor = label.tone === 'ok' ? colors.success : label.tone === 'warn' ? colors.error : colors.textMuted;

  const allow = async () => {
    const r = await ensurePermission(kind);
    if (r === 'granted' && kind === 'notifications') {
      await syncPushRegistration(userId).catch(() => {});
      toast(api.account ? 'Order updates are on' : 'Allowed. In demo mode no notifications are delivered.', 'success');
    }
    refresh();
  };

  return (
    <View style={{ flexDirection: 'row', gap: spacing.md, paddingVertical: spacing.md, alignItems: 'flex-start' }}>
      <View style={{ width: 40, height: 40, borderRadius: radius.pill, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={copy.icon} size={20} color={colors.primary} />
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <AppText variant="cardTitle">{copy.settingsFeature}</AppText>
        <AppText variant="caption" color={colors.textMuted}>{WHAT_FOR[kind]}</AppText>
        <AppText variant="weight" color={toneColor} style={{ marginTop: 2 }}>{label.text}</AppText>
        {info && (info.state === 'undetermined' || info.state === 'denied') && <Button title="Allow" size="sm" variant="soft" onPress={allow} style={{ alignSelf: 'flex-start', marginTop: 6, paddingHorizontal: 8 }} />}
        {info && (info.state === 'blocked' || info.state === 'granted') && <Button title="Open Settings" size="sm" variant="ghost" onPress={openAppSettings} style={{ alignSelf: 'flex-start', marginTop: 4 }} />}
      </View>
    </View>
  );
}

/** Photo library is listed for completeness: it needs no permission at all. */
export function PhotosRow() {
  return (
    <View style={{ flexDirection: 'row', gap: spacing.md, paddingVertical: spacing.md, alignItems: 'flex-start' }}>
      <View style={{ width: 40, height: 40, borderRadius: radius.pill, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name="images-outline" size={20} color={colors.primary} />
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <AppText variant="cardTitle">Photos</AppText>
        <AppText variant="caption" color={colors.textMuted}>You pick each photo in the phone&apos;s own picker. Shree Hari never sees the rest of your library.</AppText>
        <AppText variant="weight" color={colors.success} style={{ marginTop: 2 }}>No permission needed</AppText>
      </View>
    </View>
  );
}

/** Shown on the order-success screen: a contextual, optional offer to get updates about this order. Hidden once allowed. */
export function OrderUpdatesCard() {
  const { info, refresh } = usePermissionStatus('notifications');
  const userId = useAuth((s) => s.user?.id);
  if (!info || info.state === 'granted' || info.state === 'restricted' || info.state === 'unavailable') return null;
  const blocked = info.state === 'blocked';
  return (
    <View style={{ alignSelf: 'stretch', backgroundColor: colors.accentSoft, borderRadius: radius.md, padding: spacing.md, gap: 8 }}>
      <AppText variant="cardTitle">Get updates about this order?</AppText>
      <AppText variant="body" color={colors.textMuted}>We can tell you when it is confirmed, on the way and delivered. This is optional; you can also check the Track Order screen.</AppText>
      {blocked ? (
        <Button title="Open Settings" size="sm" variant="outline" onPress={openAppSettings} style={{ alignSelf: 'flex-start' }} />
      ) : (
        <Button title="Turn on order updates" size="sm" variant="soft" onPress={async () => {
          const r = await ensurePermission('notifications');
          if (r === 'granted') { await syncPushRegistration(userId).catch(() => {}); toast(api.account ? 'Order updates are on' : 'Allowed. In demo mode no notifications are delivered.', 'success'); }
          refresh();
        }} style={{ alignSelf: 'flex-start' }} />
      )}
    </View>
  );
}
