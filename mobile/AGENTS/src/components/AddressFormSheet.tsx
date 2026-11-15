import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from 'react';
import { ScrollView, View, useWindowDimensions } from 'react-native';
import { PressableScale } from '../animations/PressableScale';
import { api } from '../services/api';
import { detectCurrentLocation, openAppSettings } from '../services/location';
import { getPermission, onAppForeground } from '../services/permissions/permissionService';
import { ADDRESS_PROBLEM_NOTES } from '../services/locationCore';
import { useShop } from '../store/useShop';
import { toast } from '../store/useToast';
import { colors, radius, spacing } from '../theme';
import type { Address } from '../types';
import { validateName, validatePhone, phoneInput, validatePincode } from '../utils/validation';
import { AppText } from './AppText';
import { Chip, Field } from './Atoms';
import { LocationMapPreview } from './LocationMapPreview';
import { BottomSheet } from './BottomSheet';
import { Button } from './Button';

const LABELS: Address['label'][] = ['Home', 'Office', 'Other'];
type Errors = Partial<Record<'name' | 'phone' | 'line1' | 'area' | 'city' | 'state' | 'pincode', string>>;
type Gps = { state: 'idle' | 'asking' | 'busy' | 'done' | 'problem'; message?: string; canOpenSettings?: boolean; canRetry?: boolean; note?: string };

type Props = { visible: boolean; editing?: Address | null; startWithGps?: boolean; onClose: () => void; onSaved?: (id: string) => void };

const blank = (name: string, phone: string): Omit<Address, 'id'> => ({
  label: 'Home', name, phone, line1: '', area: '', city: '', state: '', pincode: '', landmark: '', instructions: '', isDefault: false,
});

/**
 * Add / edit address. "Use current location" asks permission only when tapped, fills the fields from a one-shot
 * GPS reading, and the customer reviews and confirms before anything is saved. Pincode is checked against the
 * delivery rules; GPS coordinates alone never prove a place is serviceable.
 */
export function AddressFormSheet({ visible, editing, startWithGps, onClose, onSaved }: Props) {
  const save = useShop((s) => s.saveAddress);
  const profile = useShop((s) => s.profile);
  const { height } = useWindowDimensions();
  const [f, setF] = useState<Omit<Address, 'id'>>(blank(profile.name, profile.phone));
  const [errors, setErrors] = useState<Errors>({});
  const [check, setCheck] = useState<{ state: 'idle' | 'busy' | 'ok' | 'bad'; msg?: string }>({ state: 'idle' });
  const [gps, setGps] = useState<Gps>({ state: 'idle' });
  const detectedRef = useRef(false);

  useEffect(() => {
    if (!visible) return;
    setErrors({});
    setCheck({ state: 'idle' });
    setGps({ state: startWithGps && !editing ? 'asking' : 'idle' });
    detectedRef.current = false;
    setF(editing ? { ...editing } : blank(profile.name, profile.phone));
  }, [visible, editing, startWithGps, profile.name, profile.phone]);

  useEffect(() => {
    if (validatePincode(f.pincode)) { setCheck({ state: 'idle' }); return; }
    let live = true;
    setCheck({ state: 'busy' });
    api.checkPincode(f.pincode).then((r) => live && setCheck({ state: r.serviceable ? 'ok' : 'bad', msg: r.message })).catch(() => live && setCheck({ state: 'idle' }));
    return () => { live = false; };
  }, [f.pincode]);

  // Back from Settings after turning location on: carry on with the detection the customer asked for.
  const gpsRef = useRef(gps);
  const runDetectRef = useRef<() => void>(() => {});
  useEffect(() => { gpsRef.current = gps; runDetectRef.current = runDetect; });
  useEffect(() => {
    if (!visible) return;
    return onAppForeground(() => {
      const g = gpsRef.current;
      if (g.state !== 'problem' || !g.canOpenSettings) return;
      getPermission('location').then((p) => { if (p.state === 'granted') runDetectRef.current(); }).catch(() => {});
    });
  }, [visible]);

  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));

  const runDetect = async () => {
    setGps({ state: 'busy' });
    const r = await detectCurrentLocation();
    if (r.status !== 'ok') {
      setGps({ state: 'problem', message: r.message, canOpenSettings: r.status === 'blocked' || r.status === 'disabled', canRetry: r.status !== 'blocked' });
      return;
    }
    detectedRef.current = true;
    setF((x) => ({
      ...x,
      line1: r.address?.line1 ?? x.line1,
      area: r.address?.area ?? x.area,
      city: r.address?.city ?? x.city,
      state: r.address?.state ?? x.state,
      pincode: r.address?.pincode ?? x.pincode,
      latitude: r.latitude,
      longitude: r.longitude,
    }));
    setGps({ state: 'done', note: r.addressProblem ? ADDRESS_PROBLEM_NOTES[r.addressProblem] : r.address ? undefined : ADDRESS_PROBLEM_NOTES.unavailable });
  };

  const submit = () => {
    const e: Errors = {
      name: validateName(f.name),
      phone: validatePhone(f.phone),
      line1: f.line1.trim().length >= 3 ? undefined : 'Enter house / street details',
      area: f.area.trim().length >= 2 ? undefined : 'Enter area / locality',
      city: f.city.trim().length >= 2 ? undefined : 'Enter city',
      pincode: validatePincode(f.pincode),
    };
    setErrors(e);
    if (Object.values(e).some(Boolean)) return toast('Please fix the highlighted fields', 'error');
    const id = save({ ...f, id: editing?.id });
    toast(editing ? 'Address updated' : 'Address saved', 'success');
    onSaved?.(id);
    onClose();
  };

  return (
    <BottomSheet visible={visible} onClose={onClose} title={editing ? 'Edit address' : 'Add delivery address'}>
        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={{ maxHeight: Math.min(560, height * 0.62) }}>
          <PressableScale onPress={() => setGps({ state: 'asking' })} disabled={gps.state === 'busy'} accessibilityLabel="Use my current location" style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingHorizontal: 14, borderRadius: radius.md, backgroundColor: colors.primarySoft, marginBottom: spacing.md }}>
            <Ionicons name="locate" size={24} color={colors.primary} />
            <View style={{ flex: 1 }}>
              <AppText variant="link" color={colors.primary}>{gps.state === 'busy' ? 'Finding your location…' : 'Use my current location'}</AppText>
              <AppText variant="caption" color={colors.textMuted}>One-time reading. You review the address before saving.</AppText>
            </View>
            {gps.state === 'busy' ? null : <Ionicons name="chevron-forward" size={20} color={colors.primary} />}
          </PressableScale>

          {gps.state === 'asking' && (
            <View style={{ backgroundColor: colors.accentSoft, borderRadius: radius.md, padding: 14, marginBottom: spacing.md, gap: 10 }}>
              <AppText variant="h2">Use your current location?</AppText>
              <AppText variant="body">Shree Hari reads your location once, only now, to fill in your delivery address. It is never tracked in the background, and nothing is saved until you confirm.</AppText>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Button title="Not now" size="sm" variant="outline" style={{ flex: 1 }} onPress={() => setGps({ state: 'idle' })} />
                <Button title="Continue" size="sm" style={{ flex: 1 }} onPress={runDetect} />
              </View>
            </View>
          )}
          {gps.state === 'problem' && (
            <View style={{ backgroundColor: colors.errorSoft, borderRadius: radius.md, padding: 12, marginBottom: spacing.md, gap: 8 }}>
              <AppText variant="body" color={colors.text}>{gps.message}</AppText>
              {gps.canOpenSettings && <Button title="Open Settings" size="sm" variant="outline" onPress={openAppSettings} />}
              {gps.canRetry && <Button title="Try again" size="sm" variant="soft" onPress={() => setGps({ state: 'asking' })} />}
              <AppText variant="caption" color={colors.textMuted}>You can always type your address below.</AppText>
            </View>
          )}
          {gps.state === 'done' && (
            <View style={{ backgroundColor: colors.successSoft, borderRadius: radius.md, padding: 12, marginBottom: spacing.md, gap: 4 }}>
              <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                <Ionicons name="checkmark-circle" size={18} color={colors.success} />
                <AppText variant="bodyMedium" color={colors.success}>Location detected. Please check and edit the address.</AppText>
              </View>
              {!!gps.note && <AppText variant="caption" color={colors.textMuted}>{gps.note}</AppText>}
              {f.latitude != null && f.longitude != null && (
                <LocationMapPreview value={{ latitude: f.latitude, longitude: f.longitude }} onChange={(p) => setF((x) => ({ ...x, ...p }))} />
              )}
            </View>
          )}

          <View style={{ flexDirection: 'row', gap: 8, marginBottom: spacing.md }}>
            {LABELS.map((l) => <Chip key={l} label={l} active={f.label === l} onPress={() => set('label', l)} />)}
          </View>
          <Field label="Receiver name" value={f.name} onChangeText={(t) => set('name', t)} error={errors.name} autoComplete="name" />
          <Field label="Mobile number" value={f.phone} onChangeText={(t) => set('phone', phoneInput(t))} error={errors.phone} keyboardType="phone-pad" maxLength={10} />
          <Field label="House / flat no. and street" value={f.line1} onChangeText={(t) => set('line1', t)} error={errors.line1} />
          <Field label="Area / locality" value={f.area} onChangeText={(t) => set('area', t)} error={errors.area} />
          <Field label="Landmark (optional)" value={f.landmark ?? ''} onChangeText={(t) => set('landmark', t)} />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}><Field label="City" value={f.city} onChangeText={(t) => set('city', t)} error={errors.city} /></View>
            <View style={{ flex: 1 }}><Field label="State" value={f.state ?? ''} onChangeText={(t) => set('state', t)} /></View>
          </View>
          <Field label="Pincode" value={f.pincode} onChangeText={(t) => set('pincode', t.replace(/\D/g, '').slice(0, 6))} error={errors.pincode} keyboardType="number-pad" maxLength={6} />
          {check.state !== 'idle' && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: -6, marginBottom: spacing.md }}>
              <Ionicons name={check.state === 'ok' ? 'checkmark-circle' : check.state === 'bad' ? 'close-circle' : 'time-outline'} size={18} color={check.state === 'ok' ? colors.success : check.state === 'bad' ? colors.error : colors.textMuted} />
              <AppText variant="caption" color={check.state === 'ok' ? colors.success : check.state === 'bad' ? colors.error : colors.textMuted} style={{ flex: 1 }}>
                {check.state === 'busy' ? 'Checking delivery availability…' : check.msg}
              </AppText>
            </View>
          )}
          <Field label="Delivery instructions (optional)" value={f.instructions ?? ''} onChangeText={(t) => set('instructions', t)} multiline placeholder="e.g. Ring the bell twice" />
          <PressableScale onPress={() => set('isDefault', !f.isDefault)} accessibilityRole="checkbox" accessibilityState={{ checked: !!f.isDefault }} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44, marginBottom: spacing.md }}>
            <Ionicons name={f.isDefault ? 'checkbox' : 'square-outline'} size={24} color={colors.primary} />
            <AppText variant="bodyMedium">Make this my default address</AppText>
          </PressableScale>
          <Button title="Confirm and save address" onPress={submit} />
        </ScrollView>
      </BottomSheet>
  );
}
