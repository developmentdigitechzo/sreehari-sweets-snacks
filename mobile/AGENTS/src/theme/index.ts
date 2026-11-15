// Central design tokens. Sree Sweets palette: Cream / White surfaces, Red (primary), Navy (secondary), Gold (accent).
// Every colour in the app comes from here: never write a HEX or rgba() literal in a screen or component.
import { Platform, TextStyle, ViewStyle } from 'react-native';

/** The approved master palette. Do not change these values. */
export const palette = {
  red: '#B00713',
  gold: '#F8B811',
  navy: '#234278',
  cream: '#F8F0E5',
  white: '#FFFFFF',
  darkText: '#29262B',
  grey: '#868590',
  lightGold: '#FADEA2',
  maroon: '#7E0609',
  green: '#238636',
  orange: '#E5820E',
} as const;

/** Shades derived from the palette (same hues) for soft backgrounds, borders and readable text. */
const derived = {
  creamDeep: '#F0E4D3', // slightly deeper cream for inset panels
  border: '#E6D9C8', // cream-toned divider
  lightRed: '#FBE6E7', // selected / wishlist-active background
  lightNavy: '#E8EDF6', // soft navy tint
  lightGoldSoft: '#FDF0CC', // very soft gold for notices
  greySoft: '#F1EFF2', // disabled fill
  greyText: '#6B6A75', // Secondary Grey darkened so small captions stay readable
  greenSoft: '#E3F3E6',
  orangeText: '#9A5A00', // Orange darkened for text on light backgrounds
  rgbMaroon: '126,6,9',
  rgbDark: '41,38,43',
} as const;

/** `rgba(...)` of a theme colour so screens never write a literal. */
export const alpha = {
  red: (a: number) => `rgba(${derived.rgbMaroon},${a})`,
  ink: (a: number) => `rgba(${derived.rgbDark},${a})`,
  white: (a: number) => `rgba(255,255,255,${a})`,
  primary: (a: number) => `rgba(176,7,19,${a})`,
  accent: (a: number) => `rgba(248,184,17,${a})`,
  lightIvory: (a: number) => `rgba(240,228,211,${a})`,
};

export const colors = {
  background: palette.cream, // main page background
  backgroundAlt: derived.creamDeep,
  surface: palette.white, // cards, search bar, inputs
  primary: palette.red, // CTAs, prices, active nav, important icons
  primaryPressed: palette.maroon, // Dark Maroon: pressed states and image scrims
  primarySoft: derived.lightRed,
  secondary: palette.navy, // logo text, inactive nav, links, secondary icons
  secondarySoft: derived.lightNavy,
  accent: palette.gold, // offers, discount badges, ratings, rewards, gift icons
  accentLight: palette.lightGold, // light gold: category and gift icon backgrounds
  accentSoft: derived.lightGoldSoft,
  onPrimary: palette.white,
  onAccent: palette.navy, // text on gold
  text: palette.navy, // primary text is brand navy
  ink: palette.darkText, // Dark Text: microphone, toasts, image viewer
  textMuted: derived.greyText, // readable secondary text
  grey: palette.grey, // Secondary Grey: close/cancel icons, disabled
  greySoft: derived.greySoft,
  textOnDark: palette.white,
  border: derived.border,
  success: palette.green, // functional: confirmations
  successSoft: derived.greenSoft,
  error: palette.red,
  errorSoft: derived.lightRed,
  warning: palette.orange, // functional: warning icons
  warningText: derived.orangeText, // warning text on light backgrounds
  warningSoft: derived.lightGoldSoft,
  info: palette.navy,
  infoSoft: derived.lightNavy,
  overlay: alpha.ink(0.55),
  scrim: alpha.red(0.9),
  white: palette.white,
} as const;

/** Flat brand fills (LinearGradient needs two stops; no decorative gradients). */
export const gradients = {
  header: [palette.red, palette.red] as const,
  button: [palette.red, palette.red] as const,
  gold: [palette.gold, palette.gold] as const,
  festive: [palette.red, palette.maroon] as const,
  creamFade: [palette.cream, derived.creamDeep] as const,
};

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, huge: 32 } as const;
export const radius = { sm: 10, md: 14, lg: 20, xl: 28, pill: 999 } as const;

/**
 * ONE font family for the whole app (Inter). To change the typeface, change these names (and the
 * matching imports in App.tsx) and nothing else. `serif` / `serifSemi` stay as heading aliases so
 * existing screens keep compiling, but they resolve to the same family.
 */
export const fonts = {
  serif: 'Inter_700Bold',
  serifSemi: 'Inter_600SemiBold',
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semi: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
} as const;

export const type = {
  display: { fontFamily: fonts.serif, fontSize: 30, lineHeight: 38 } as TextStyle,
  title: { fontFamily: fonts.serif, fontSize: 26, lineHeight: 33 } as TextStyle,
  h1: { fontFamily: fonts.bold, fontSize: 20, lineHeight: 26 } as TextStyle,
  h2: { fontFamily: fonts.bold, fontSize: 17, lineHeight: 23 } as TextStyle,
  body: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 20 } as TextStyle,
  bodyMedium: { fontFamily: fonts.medium, fontSize: 14, lineHeight: 20 } as TextStyle,
  caption: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 16 } as TextStyle,
  captionMedium: { fontFamily: fonts.semi, fontSize: 12, lineHeight: 16 } as TextStyle,
  button: { fontFamily: fonts.semi, fontSize: 16, lineHeight: 22 } as TextStyle,
  price: { fontFamily: fonts.bold, fontSize: 18, lineHeight: 24 } as TextStyle,
  // Named roles: use these instead of overriding fontSize/fontFamily on a screen.
  hero: { fontFamily: fonts.bold, fontSize: 24, lineHeight: 30 } as TextStyle,
  pageTitle: { fontFamily: fonts.bold, fontSize: 22, lineHeight: 28 } as TextStyle,
  resultTitle: { fontFamily: fonts.bold, fontSize: 24, lineHeight: 30 } as TextStyle,
  /** Money that must never be misread: its own line height keeps commas and decimals whole; digits are equal width. */
  amountLg: { fontFamily: fonts.bold, fontSize: 24, lineHeight: 30, fontVariant: ['tabular-nums'] } as TextStyle,
  cardTitle: { fontFamily: fonts.bold, fontSize: 16, lineHeight: 22 } as TextStyle,
  bodyLg: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 22 } as TextStyle,
  amountXl: { fontFamily: fonts.bold, fontSize: 30, lineHeight: 36, fontVariant: ['tabular-nums'] } as TextStyle,
  stepLabel: { fontFamily: fonts.medium, fontSize: 12, lineHeight: 16 } as TextStyle,
  sectionTitle: { fontFamily: fonts.bold, fontSize: 18, lineHeight: 24 } as TextStyle,
  sectionSubtitle: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18 } as TextStyle,
  productName: { fontFamily: fonts.semi, fontSize: 14, lineHeight: 19 } as TextStyle,
  productPrice: { fontFamily: fonts.bold, fontSize: 16, lineHeight: 22 } as TextStyle,
  productMrp: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 16 } as TextStyle,
  weight: { fontFamily: fonts.semi, fontSize: 13, lineHeight: 18 } as TextStyle,
  buttonSm: { fontFamily: fonts.semi, fontSize: 14, lineHeight: 18 } as TextStyle,
  link: { fontFamily: fonts.semi, fontSize: 14, lineHeight: 20 } as TextStyle,
  label: { fontFamily: fonts.medium, fontSize: 13, lineHeight: 18 } as TextStyle,
  badge: { fontFamily: fonts.bold, fontSize: 11, lineHeight: 14 } as TextStyle,
  navLabel: { fontFamily: fonts.medium, fontSize: 11, lineHeight: 14 } as TextStyle,
  navLabelActive: { fontFamily: fonts.bold, fontSize: 11, lineHeight: 14 } as TextStyle,
  eyebrow: { fontFamily: fonts.semi, fontSize: 11, lineHeight: 14, letterSpacing: 1.5 } as TextStyle,
  bodyXl: { fontFamily: fonts.regular, fontSize: 16, lineHeight: 24 } as TextStyle,
  badgeLg: { fontFamily: fonts.bold, fontSize: 18, lineHeight: 24 } as TextStyle,
  highlight: { fontFamily: fonts.bold, fontSize: 18, lineHeight: 24 } as TextStyle,
  stepNumber: { fontFamily: fonts.bold, fontSize: 14, lineHeight: 20 } as TextStyle,
  priceSm: { fontFamily: fonts.bold, fontSize: 18, lineHeight: 24, fontVariant: ['tabular-nums'] } as TextStyle,
  priceMd: { fontFamily: fonts.bold, fontSize: 22, lineHeight: 28, fontVariant: ['tabular-nums'] } as TextStyle,
  priceLg: { fontFamily: fonts.bold, fontSize: 34, lineHeight: 40, fontVariant: ['tabular-nums'] } as TextStyle,
  mrpLg: { fontFamily: fonts.regular, fontSize: 16, lineHeight: 22 } as TextStyle,
  amountSm: { fontFamily: fonts.semi, fontSize: 15, lineHeight: 20, fontVariant: ['tabular-nums'] } as TextStyle,
  amountMd: { fontFamily: fonts.bold, fontSize: 26, lineHeight: 32, fontVariant: ['tabular-nums'] } as TextStyle,
};

/**
 * Text inside a TextInput. No lineHeight on purpose: a fixed lineHeight mis-centres the text in single-line inputs on iOS.
 * Same family, size and weight on Android and iOS.
 */
export const inputType = {
  regular: { fontFamily: fonts.regular, fontSize: 15 } as TextStyle,
  large: { fontFamily: fonts.regular, fontSize: 16 } as TextStyle,
  strong: { fontFamily: fonts.semi, fontSize: 15 } as TextStyle,
};

/** Largest system font scale the layouts are built for. Text still grows with the user's setting, up to this cap. */
export const fontScale = { max: 1.3 } as const;

/** Tamil glyphs are taller than Latin ones; lines holding Tamil get this extra line height so nothing clips. */
export const TAMIL_LINE_HEIGHT_FACTOR = 1.2;
export const hasTamil = (s: string) => /[\u0B80-\u0BFF]/.test(s);

export const shadow = {
  card: Platform.select<ViewStyle>({
    ios: { shadowColor: palette.darkText, shadowOpacity: 0.1, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } },
    android: { elevation: 3 },
    default: { boxShadow: `0px 4px 14px ${alpha.ink(0.1)}` } as ViewStyle,
  }) as ViewStyle,
  lift: Platform.select<ViewStyle>({
    ios: { shadowColor: palette.darkText, shadowOpacity: 0.22, shadowRadius: 18, shadowOffset: { width: 0, height: 8 } },
    android: { elevation: 8 },
    default: { boxShadow: `0px 8px 22px ${alpha.ink(0.18)}` } as ViewStyle,
  }) as ViewStyle,
};

export const hitSlop = { top: 8, bottom: 8, left: 8, right: 8 };
export const MIN_TOUCH = 44;

/** Layout rhythm: every screen uses these instead of ad-hoc margins. */
export const layout = {
  gutter: 16, // left/right screen padding
  sectionGap: 24, // vertical space between page sections
  maxContentWidth: 560, // phones fill the width; tablets/web stay centred
  tabIcon: 22,
  tabBarClearance: 96, // legacy: only for content drawn BEHIND an absolutely positioned bar
  stickyBarClearance: 120, // bottom padding above an absolutely positioned CTA bar
  scrollBottom: 24, // end-of-scroll padding. The tab bar and cart bar sit in the layout flow, so nothing needs more
  cardGap: 12, // gap between product cards (shelves and grids)
  cartBarHeight: 52, // sticky cart summary
  cartBarPad: 6, // vertical breathing room around the cart summary
} as const;

/** Interactive control sizing (all >= 44pt touch target). */
export const control = {
  button: 52,
  buttonSm: 40,
  input: 52,
  chip: 44,
  minTouch: 44,
  stepper: 40,
} as const;

export const iconSize = { sm: 16, md: 20, lg: 24, xl: 32 } as const;

/** Card imagery keeps one ratio so grids line up. */
export const cardSize = { productImageRatio: 1.25, shelfWidth: 172, gap: 12 } as const;

/** Subtle top separator for bars that sit on the cream background (tab bar). */
export const hairline = { borderTopWidth: 1, borderTopColor: colors.border } as const;
