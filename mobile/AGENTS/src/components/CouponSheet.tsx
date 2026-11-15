import { softIn } from '../animations/motion';
import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { ScrollView, TextInput, View, StyleSheet } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { PressableScale } from '../animations/PressableScale';
import { evaluateCoupon, isCouponActive } from '../services/pricing';
import { useCatalog } from '../store/useCatalog';
import { useShop } from '../store/useShop';
import { toast } from '../store/useToast';
import { colors, inputType, radius, spacing, fontScale } from '../theme';
import { rupee } from '../utils/format';
import { AppText } from './AppText';
import { BottomSheet } from './BottomSheet';
import { Button } from './Button';

type Props = { visible: boolean; onClose: () => void; subtotal: number };

/** Coupon entry + list. Every coupon explains why it is (not) eligible (BRD 10). */
export function CouponSheet({ visible, onClose, subtotal }: Props) {
  const coupons = useCatalog((s) => s.coupons);
  const applied = useShop((s) => s.couponCode);
  const setCoupon = useShop((s) => s.setCoupon);
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const apply = (c: string) => {
    const coupon = coupons.find((x) => x.code.toLowerCase() === c.trim().toLowerCase());
    if (!coupon) return setMsg({ ok: false, text: 'This coupon code is not valid.' });
    const ev = evaluateCoupon(coupon, subtotal);
    if (!ev.eligible) return setMsg({ ok: false, text: ev.reason ?? 'Not eligible.' });
    setCoupon(coupon.code);
    setMsg({ ok: true, text: ev.freeShipping ? `${coupon.code} applied — free delivery!` : `${coupon.code} applied — you save ${rupee(ev.discount)}` });
    toast(`${coupon.code} applied`, 'success');
    setTimeout(onClose, 900);
  };

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Apply coupon">
      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={{ maxHeight: 520 }}>
        <View style={styles.inputRow}>
          <TextInput
        maxFontSizeMultiplier={fontScale.max}
            value={code}
            onChangeText={(t) => { setCode(t.toUpperCase()); setMsg(null); }}
            placeholder="Enter coupon code"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="characters"
            accessibilityLabel="Coupon code"
            style={styles.input}
          />
          <Button title="Apply" size="sm" onPress={() => apply(code)} disabled={!code.trim()} style={{ width: 90 }} />
        </View>
        {msg && (
          <Animated.View entering={msg.ok ? softIn : FadeIn} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 }}>
            <Ionicons name={msg.ok ? 'checkmark-circle' : 'alert-circle'} size={20} color={msg.ok ? colors.success : colors.error} />
            <AppText variant="bodyMedium" color={msg.ok ? colors.success : colors.error} style={{ flex: 1 }}>{msg.text}</AppText>
          </Animated.View>
        )}
        <AppText variant="h2" style={{ marginTop: spacing.lg, marginBottom: 8 }}>Available coupons</AppText>
        <View style={{ gap: 10 }}>
          {coupons.filter((c) => isCouponActive(c)).map((c) => {
            const ev = evaluateCoupon(c, subtotal);
            const isApplied = applied === c.code;
            return (
              <View key={c.code} style={[styles.card, !ev.eligible && { opacity: 0.8 }]}>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <View style={styles.codeTag}><AppText variant="captionMedium" color={colors.primaryPressed} weight="bold">{c.code}</AppText></View>
                    <AppText variant="cardTitle">{c.title}</AppText>
                  </View>
                  <AppText variant="caption" color={colors.textMuted} style={{ marginTop: 4 }}>{c.description}</AppText>
                  {!ev.eligible && <AppText variant="caption" color={colors.error} style={{ marginTop: 4 }}>{ev.reason}</AppText>}
                </View>
                {isApplied ? (
                  <PressableScale onPress={() => { setCoupon(null); toast('Coupon removed'); }} accessibilityLabel={`Remove ${c.code}`} style={styles.chipBtn}>
                    <Ionicons name="checkmark-circle" size={18} color={colors.success} />
                    <AppText variant="captionMedium" color={colors.success}>Applied</AppText>
                  </PressableScale>
                ) : (
                  <Button title="Apply" size="sm" variant="soft" disabled={!ev.eligible} onPress={() => apply(c.code)} style={{ width: 82 }} />
                )}
              </View>
            );
          })}
        </View>
      </ScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  inputRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  input: { flex: 1, height: 48, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: 14, ...inputType.strong, color: colors.text },
  card: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.surface, borderRadius: radius.md, padding: 14, borderWidth: 1, borderColor: colors.border },
  codeTag: { backgroundColor: colors.accentSoft, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  chipBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 40, paddingHorizontal: 8 },
});
