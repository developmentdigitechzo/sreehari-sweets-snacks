import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { PressableScale } from '../animations/PressableScale';
import { Skeleton } from '../animations/Skeleton';
import { fetchWeather, Place, searchPlace, Weather } from '../services/weather';
import { useShop } from '../store/useShop';
import { colors, control, layout, radius, spacing } from '../theme';
import { AppText } from './AppText';
import { Field } from './Atoms';
import { BottomSheet } from './BottomSheet';
import { Button } from './Button';

const PLACE_KEY = 'shree-hari-weather-place';
type View_ = { s: 'loading' } | { s: 'ready'; w: Weather; stale?: boolean } | { s: 'error'; message: string } | { s: 'no-place' };

/**
 * Compact weather strip for the Home screen. Location comes from the delivery address the customer already saved
 * (or a city they pick). GPS permission is never requested here. Weather is informational only: it does not affect
 * delivery availability or timing.
 */
export function WeatherChip() {
  const address = useShop((s) => s.addresses.find((a) => a.id === s.selectedAddressId));
  const [manual, setManual] = useState<Place | null>(null);
  const [view, setView] = useState<View_>({ s: 'loading' });
  const [open, setOpen] = useState(false);
  const [city, setCity] = useState('');
  const [citySearching, setCitySearching] = useState(false);
  const [cityError, setCityError] = useState<string | undefined>();
  const seq = useRef(0);

  useEffect(() => {
    AsyncStorage.getItem(PLACE_KEY).then((v) => v && setManual(JSON.parse(v))).catch(() => {});
  }, []);

  const load = useCallback(async (force = false) => {
    const id = ++seq.current;
    setView({ s: 'loading' });
    try {
      let place: Place | null = manual;
      if (!place && address?.latitude != null && address.longitude != null) {
        place = { label: [address.area, address.city].filter(Boolean).join(', '), latitude: address.latitude, longitude: address.longitude };
      }
      if (!place && address) place = await searchPlace(address.city || address.area);
      if (id !== seq.current) return;
      if (!place) return setView({ s: 'no-place' });
      const w = await fetchWeather(place, { force });
      if (id === seq.current) setView({ s: 'ready', w, stale: (w as { stale?: boolean }).stale });
    } catch (e) {
      if (id === seq.current) setView({ s: 'error', message: (e as Error).message || 'Weather unavailable' });
    }
  }, [manual, address]);

  useEffect(() => { load(); }, [load]);

  const applyCity = async () => {
    setCityError(undefined);
    setCitySearching(true);
    try {
      const p = await searchPlace(city);
      if (!p) return setCityError('We could not find that place. Try a nearby city.');
      await AsyncStorage.setItem(PLACE_KEY, JSON.stringify(p));
      setManual(p);
      setOpen(false);
    } catch (e) {
      setCityError((e as Error).message);
    } finally {
      setCitySearching(false);
    }
  };

  const time = (iso: string) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

  return (
    <>
      <View style={styles.wrap} accessibilityRole="summary">
        {view.s === 'loading' && (
          <View style={styles.row}>
            <Skeleton width={36} height={36} radius={18} />
            <View style={{ flex: 1, gap: 6 }}>
              <Skeleton width="45%" height={14} />
              <Skeleton width="65%" height={12} />
            </View>
          </View>
        )}
        {view.s === 'ready' && (
          <PressableScale onPress={() => setOpen(true)} accessibilityLabel={`Weather in ${view.w.place}: ${view.w.tempC} degrees, ${view.w.condition}. Change city`} style={styles.row} scaleTo={0.98}>
            <View style={styles.icon}><Ionicons name={view.w.icon} size={22} color={colors.primary} /></View>
            <View style={{ flex: 1 }}>
              <AppText variant="link">{view.w.tempC}°C · {view.w.condition}</AppText>
              <AppText variant="caption" color={colors.textMuted} numberOfLines={1}>
                {view.w.place} · {view.stale ? 'last updated' : 'updated'} {time(view.w.updatedAt)}{view.stale ? ' (offline)' : ''}
              </AppText>
            </View>
            <Ionicons name="chevron-down" size={18} color={colors.textMuted} />
          </PressableScale>
        )}
        {view.s === 'error' && (
          <View style={styles.row}>
            <View style={styles.icon}><Ionicons name="cloud-offline-outline" size={22} color={colors.textMuted} /></View>
            <AppText variant="body" color={colors.textMuted} style={{ flex: 1 }}>Weather is unavailable right now.</AppText>
            <PressableScale onPress={() => load(true)} accessibilityLabel="Retry weather" style={styles.link}><AppText variant="captionMedium" color={colors.primary}>Retry</AppText></PressableScale>
          </View>
        )}
        {view.s === 'no-place' && (
          <PressableScale onPress={() => setOpen(true)} accessibilityLabel="Choose a city for weather" style={styles.row}>
            <View style={styles.icon}><Ionicons name="partly-sunny-outline" size={22} color={colors.primary} /></View>
            <AppText variant="body" style={{ flex: 1 }}>See today’s weather for your city</AppText>
            <AppText variant="captionMedium" color={colors.primary}>Choose</AppText>
          </PressableScale>
        )}
      </View>

      <BottomSheet visible={open} onClose={() => setOpen(false)} title="Weather location">
        <AppText variant="body" color={colors.textMuted} style={{ marginBottom: spacing.md }}>
          Weather is shown for information only and does not affect delivery availability or timing.
        </AppText>
        <Field label="City" value={city} onChangeText={(t) => { setCity(t); setCityError(undefined); }} error={cityError} placeholder="e.g. Chennai" autoCapitalize="words" returnKeyType="search" onSubmitEditing={applyCity} />
        <Button title="Show weather" onPress={applyCity} loading={citySearching} disabled={city.trim().length < 2} />
        {!!manual && <Button title="Use my delivery address instead" variant="ghost" onPress={async () => { await AsyncStorage.removeItem(PLACE_KEY); setManual(null); setOpen(false); }} style={{ marginTop: spacing.sm }} />}
      </BottomSheet>
    </>
  );
}

const styles = StyleSheet.create({
  wrap: { marginHorizontal: layout.gutter, minHeight: 48, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, justifyContent: 'center', paddingHorizontal: 12, paddingVertical: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: control.minTouch - 4 },
  icon: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  link: { minHeight: control.minTouch, minWidth: control.minTouch, alignItems: 'center', justifyContent: 'center' },
});
