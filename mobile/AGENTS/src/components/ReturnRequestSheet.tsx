import React, { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { PressableScale } from '../animations/PressableScale';
import { api } from '../services/api';
import { toast } from '../store/useToast';
import { colors, inputType, radius, fontScale } from '../theme';
import { AppText } from './AppText';
import { BottomSheet } from './BottomSheet';
import { Button } from './Button';

const REASONS = {
  RETURN: ['Item damaged or spoiled', 'Wrong item delivered', 'Quality was not as expected', 'Missing item'],
  CANCELLATION: ['Ordered by mistake', 'Need to change the order', 'Delivery is too late', 'Found a better price'],
} as const;

/**
 * Asks the store to cancel an order that is still being prepared, or to take back a delivered order. The store decides:
 * nothing is cancelled or refunded until staff approve it in the admin panel, and the sheet says so.
 */
export function ReturnRequestSheet({ visible, kind, orderId, orderNumber, onClose, onDone }: { visible: boolean; kind: 'RETURN' | 'CANCELLATION'; orderId: string; orderNumber: string; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState('');
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    if (!api.account || busy) return;
    if (!reason) { setError('Choose a reason'); return; }
    setBusy(true);
    setError('');
    try {
      await api.account.requestReturn(orderId, { kind, reason, details: details.trim() || undefined });
      toast(kind === 'RETURN' ? 'Return request sent. The store will review it.' : 'Cancellation request sent. The store will confirm shortly.', 'success');
      setReason('');
      setDetails('');
      onDone();
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  };

  return (
    <BottomSheet visible={visible} onClose={onClose} title={kind === 'RETURN' ? `Return · Order #${orderNumber}` : `Cancel · Order #${orderNumber}`}>
      <View style={{ gap: 12 }}>
        <AppText variant="caption" color={colors.textMuted}>
          {kind === 'RETURN' ? 'Tell us what went wrong. The store reviews every request before any refund.' : 'The store will confirm the cancellation. If you already paid online, the refund is processed by the store.'}
        </AppText>
        <View style={{ gap: 8 }} accessibilityRole="radiogroup">
          {REASONS[kind].map((r) => (
            <PressableScale key={r} onPress={() => { setReason(r); setError(''); }} accessibilityRole="radio" accessibilityState={{ selected: reason === r }} style={[styles.chip, reason === r && styles.chipOn]}>
              <AppText variant="bodyMedium" color={reason === r ? colors.white : colors.text}>{r}</AppText>
            </PressableScale>
          ))}
        </View>
        <TextInput maxFontSizeMultiplier={fontScale.max} value={details} onChangeText={setDetails} placeholder="More details (optional)" placeholderTextColor={colors.textMuted} maxLength={500} multiline style={styles.input} accessibilityLabel="More details" />
        {!!error && <AppText variant="caption" color={colors.error} accessibilityLiveRegion="polite">{error}</AppText>}
        <Button title={kind === 'RETURN' ? 'Send return request' : 'Send cancellation request'} loading={busy} onPress={submit} />
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  chip: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingVertical: 12, paddingHorizontal: 14, backgroundColor: colors.surface },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 12, minHeight: 72, ...inputType.regular, color: colors.text, textAlignVertical: 'top' },
});
