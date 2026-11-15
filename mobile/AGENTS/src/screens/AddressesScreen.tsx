import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import type { RootScreenProps } from '../navigation/types';
import { PressableScale } from '../animations/PressableScale';
import { Reveal } from '../animations/Reveal';
import { AddressFormSheet } from '../components/AddressFormSheet';
import { AppText } from '../components/AppText';
import { BrandHeader, Sheet } from '../components/BrandHeader';
import { Button } from '../components/Button';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { EmptyState } from '../components/States';
import { useShop } from '../store/useShop';
import { toast } from '../store/useToast';
import { colors, radius, shadow, spacing } from '../theme';
import type { Address } from '../types';

export function AddressesScreen({ route }: RootScreenProps<'Addresses'>) {
  const addresses = useShop((s) => s.addresses);
  const selectedId = useShop((s) => s.selectedAddressId);
  const select = useShop((s) => s.selectAddress);
  const del = useShop((s) => s.deleteAddress);
  const [form, setForm] = useState(!!route.params?.gps);
  const [gps, setGps] = useState(!!route.params?.gps);
  const [editing, setEditing] = useState<Address | null>(null);
  const [removing, setRemoving] = useState<Address | null>(null);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <BrandHeader title="Saved Addresses" subtitle={`${addresses.length} saved`} />
      <Sheet>
        <FlatList
          data={addresses}
          keyExtractor={(a) => a.id}
          contentContainerStyle={{ padding: spacing.lg, gap: 12, paddingBottom: 120, flexGrow: 1 }}
          ListEmptyComponent={<EmptyState icon="location-outline" title="No saved addresses" message="Add an address to get delivery estimates." />}
          renderItem={({ item: a, index }) => {
            const on = a.id === selectedId;
            return (
              <Reveal index={index}>
                <PressableScale onPress={() => { select(a.id); toast(`Delivering to ${a.label}`, 'success'); }} accessibilityState={{ selected: on }} style={[styles.card, on && { borderColor: colors.primary, backgroundColor: colors.primarySoft }]}>
                  <Ionicons name={a.label === 'Office' ? 'briefcase-outline' : a.label === 'Home' ? 'home-outline' : 'location-outline'} size={28} color={colors.secondary} />
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                      <AppText variant="h2">{a.label}</AppText>
                      {a.isDefault && <View style={styles.def}><AppText variant="captionMedium" color={colors.text}>Default</AppText></View>}
                      {on && <Ionicons name="checkmark-circle" size={18} color={colors.success} />}
                    </View>
                    <AppText variant="body" color={colors.textMuted}>{a.name} · {a.phone}</AppText>
                    <AppText variant="body" color={colors.textMuted}>{a.line1}, {a.area}, {a.city} - {a.pincode}</AppText>
                    {!!a.instructions && <AppText variant="caption" color={colors.textMuted} style={{ marginTop: 2 }}>Note: {a.instructions}</AppText>}
                  </View>
                  <View>
                    <PressableScale onPress={() => { setEditing(a); setForm(true); }} accessibilityLabel={`Edit ${a.label}`} style={styles.ic}><Ionicons name="create-outline" size={22} color={colors.secondary} /></PressableScale>
                    <PressableScale onPress={() => setRemoving(a)} accessibilityLabel={`Delete ${a.label}`} style={styles.ic}><Ionicons name="trash-outline" size={22} color={colors.error} /></PressableScale>
                  </View>
                </PressableScale>
              </Reveal>
            );
          }}
        />
        <View style={styles.bar}>
          <Button title="Use my location" icon="locate" variant="soft" onPress={() => { setEditing(null); setGps(true); setForm(true); }} style={{ flexGrow: 1, flexShrink: 0 }} />
          <Button title="Add address" icon="add" onPress={() => { setEditing(null); setGps(false); setForm(true); }} style={{ flexGrow: 1, flexShrink: 0 }} />
        </View>
      </Sheet>
      <AddressFormSheet visible={form} editing={editing} startWithGps={gps} onClose={() => { setForm(false); setGps(false); }} />
      <ConfirmDialog visible={!!removing} title="Delete address?" message={removing ? `${removing.label} — ${removing.line1}, ${removing.area}` : ''} confirmLabel="Delete" onCancel={() => setRemoving(null)} onConfirm={() => { if (removing) del(removing.id); setRemoving(null); toast('Address deleted'); }} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', gap: 12, alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.lg, padding: 14, borderWidth: 1.5, borderColor: colors.border, ...shadow.card },
  def: { backgroundColor: colors.accentSoft, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 2 },
  ic: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', gap: 10, padding: spacing.lg, backgroundColor: colors.background, borderTopWidth: 1, borderTopColor: colors.border },
});
