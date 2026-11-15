import React from 'react';
import { StyleSheet, Text, TextProps, TextStyle } from 'react-native';
import { colors, fontScale, fonts, hasTamil, TAMIL_LINE_HEIGHT_FACTOR, type as t } from '../theme';

type Variant = keyof typeof t;
type Weight = 'regular' | 'medium' | 'semi' | 'bold';
type Props = TextProps & { variant?: Variant; color?: string; align?: 'left' | 'center' | 'right'; weight?: Weight };

/** Plain text of a children tree (strings and numbers only), used to detect Tamil. */
function plain(node: React.ReactNode): string {
  if (typeof node === 'string') return node;
  if (typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(plain).join('');
  return '';
}

/**
 * The one text component. Inter everywhere; Tamil falls back to the platform's Tamil font (Noto Sans Tamil on Android,
 * Tamil Sangam MN on iOS) and gets extra line height so tall glyphs never clip. Font scaling is capped (fontScale.max) so
 * large system text settings grow the text without breaking layouts.
 * A screen that sets `fontSize` inline but no `lineHeight` gets one derived from it. Prefer a theme variant over an inline size.
 */
export function AppText({ variant = 'body', color = colors.text, align, weight, style, children, ...rest }: Props) {
  const flat = StyleSheet.flatten(style) as TextStyle | undefined;
  const fit = flat?.fontSize !== undefined && flat.lineHeight === undefined ? { lineHeight: Math.ceil(flat.fontSize * 1.3) } : null;
  const baseLine = flat?.lineHeight ?? fit?.lineHeight ?? t[variant].lineHeight;
  const tamil = baseLine && hasTamil(plain(children)) ? { lineHeight: Math.ceil(baseLine * TAMIL_LINE_HEIGHT_FACTOR) } : null;
  return (
    <Text maxFontSizeMultiplier={fontScale.max} {...rest} style={[t[variant], weight ? { fontFamily: fonts[weight] } : null, { color }, align ? { textAlign: align } : null, style, fit, tamil]}>
      {children}
    </Text>
  );
}
