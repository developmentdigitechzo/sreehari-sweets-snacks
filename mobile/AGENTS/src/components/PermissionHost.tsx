import { Ionicons } from '@expo/vector-icons';
import React, { useEffect } from 'react';
import { View } from 'react-native';
import { acceptPrompt, declinePrompt, onAppForeground, openSettingsFromPrompt, PERMISSION_COPY, recheckPrompt, settingsPath } from '../services/permissions/permissionService';
import { usePermissionPrompt } from '../store/usePermissionPrompt';
import { colors, radius, spacing } from '../theme';
import { AppText } from './AppText';
import { BottomSheet } from './BottomSheet';
import { Button } from './Button';

/**
 * The one place permission explanations appear. Mounted once at the root. A feature asks through ensurePermission();
 * this sheet explains why, and only the Continue button triggers the system prompt. Nothing is ever shown at app launch.
 */
export function PermissionHost() {
  const prompt = usePermissionPrompt((s) => s.prompt);

  // Back from Settings: recheck, and carry on automatically if the customer turned the permission on.
  useEffect(() => onAppForeground(() => { recheckPrompt().catch(() => {}); }), []);

  const copy = prompt ? PERMISSION_COPY[prompt.kind] : null;
  const title = !prompt || !copy ? '' : prompt.phase === 'rationale' ? copy.title : prompt.phase === 'settings' ? `${copy.settingsFeature} is turned off` : 'Turn it on in Settings';

  return (
    <BottomSheet visible={!!prompt} onClose={declinePrompt} title={title}>
      {prompt && copy && (
        <View style={{ gap: spacing.md }}>
          <View style={{ alignItems: 'center' }}>
            <View style={{ width: 64, height: 64, borderRadius: radius.pill, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name={copy.icon} size={30} color={colors.primary} />
            </View>
          </View>

          {prompt.phase === 'rationale' && (
            <>
              {prompt.revoked && <AppText variant="bodyMedium" color={colors.primary} align="center">Access was turned off earlier.</AppText>}
              <AppText variant="bodyLg" align="center">{copy.why}</AppText>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Button title="Not now" variant="outline" onPress={declinePrompt} style={{ flex: 1 }} />
                <Button title="Continue" loading={prompt.busy} onPress={() => { acceptPrompt().catch(() => {}); }} style={{ flex: 1 }} />
              </View>
            </>
          )}

          {prompt.phase === 'settings' && (
            <>
              <AppText variant="bodyLg" align="center">To use this, turn it on in your phone&apos;s settings: {settingsPath(prompt.kind)}.</AppText>
              <AppText variant="body" color={colors.textMuted} align="center">{copy.fallback}</AppText>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Button title="Not now" variant="outline" onPress={declinePrompt} style={{ flex: 1 }} />
                <Button title="Open Settings" onPress={openSettingsFromPrompt} style={{ flex: 1.2 }} />
              </View>
            </>
          )}

          {prompt.phase === 'waiting' && (
            <>
              <AppText variant="bodyLg" align="center">Turn it on, then come back to the app. We will carry on from here.</AppText>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Button title="Cancel" variant="outline" onPress={declinePrompt} style={{ flex: 1 }} />
                <Button title="Open Settings" onPress={openSettingsFromPrompt} style={{ flex: 1.2 }} />
              </View>
            </>
          )}
        </View>
      )}
    </BottomSheet>
  );
}
