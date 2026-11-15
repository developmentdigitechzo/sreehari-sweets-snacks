import React from 'react';
import { StyleSheet, View } from 'react-native';
import { PressableScale } from '../animations/PressableScale';
import { colors, control, radius, spacing } from '../theme';
import { AppText } from './AppText';

type Tab<T extends string> = { id: T; label: string; count?: number };

/**
 * Two or three equal-width tabs in one rounded track (for example Active | Past orders).
 * Every tab is the same width and height, the selected one is filled, and there is no sliding animation.
 */
export function SegmentedTabs<T extends string>({ tabs, value, onChange }: { tabs: Tab<T>[]; value: T; onChange: (id: T) => void }) {
  return (
    <View style={styles.track} accessibilityRole="tablist">
      {tabs.map((t) => {
        const on = t.id === value;
        return (
          <PressableScale
            key={t.id}
            onPress={() => onChange(t.id)}
            scaleTo={0.98}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={t.count === undefined ? t.label : `${t.label}, ${t.count}`}
            style={[styles.tab, on && styles.tabOn]}
          >
            <AppText variant="bodyMedium" weight={on ? 'bold' : 'semi'} color={on ? colors.white : colors.text}>
              {t.label}{t.count === undefined ? '' : ` (${t.count})`}
            </AppText>
          </PressableScale>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { flexDirection: 'row', backgroundColor: colors.backgroundAlt, borderRadius: radius.pill, padding: 4, gap: 4 },
  tab: { flex: 1, minHeight: control.minTouch - 4, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.md },
  tabOn: { backgroundColor: colors.primary },
});
