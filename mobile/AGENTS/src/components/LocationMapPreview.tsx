import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { View } from 'react-native';
import { activeMapProvider, LatLng, mapProviderName } from '../services/maps';
import { colors, radius } from '../theme';
import { AppText } from './AppText';

type Props = { value: LatLng; onChange: (next: LatLng) => void };

/** Shows the configured map with a draggable pin, or an honest "not configured" notice. */
// Resolved once from configuration (not created during render).
const Provider = activeMapProvider();

export function LocationMapPreview({ value, onChange }: Props) {
  if (Provider) return <Provider value={value} onChange={onChange} />;
  return (
    <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start', backgroundColor: colors.backgroundAlt, borderRadius: radius.md, padding: 10 }} accessibilityLabel="Map preview unavailable">
      <Ionicons name="map-outline" size={20} color={colors.textMuted} />
      <View style={{ flex: 1 }}>
        <AppText variant="captionMedium" color={colors.text}>Map preview unavailable</AppText>
        <AppText variant="caption" color={colors.textMuted}>
          No map provider is configured ({mapProviderName}), so the pin cannot be shown or moved. GPS reading: {value.latitude.toFixed(4)}, {value.longitude.toFixed(4)}. Please check the address fields below.
        </AppText>
      </View>
    </View>
  );
}
