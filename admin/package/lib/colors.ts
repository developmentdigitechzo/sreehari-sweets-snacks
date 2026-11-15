// Single source for the Sree Sweets palette in the admin panel. Tailwind (tailwind.config.ts) and the charts both read it,
// so a colour is never typed twice. Mirrors mobile/AGENTS/src/theme.
export const brand = {
  red: '#B00713',
  maroon: '#7E0609',
  gold: '#F8B811',
  lightGold: '#FADEA2',
  navy: '#234278',
  cream: '#F8F0E5',
  white: '#FFFFFF',
  darkText: '#29262B',
  grey: '#868590',
  green: '#238636',
  orange: '#E5820E',
  // derived from the palette (same hues)
  creamDeep: '#F0E4D3',
  border: '#E6D9C8',
  textMuted: '#6B6A75',
  lightRed: '#FBE6E7',
  lightNavy: '#E8EDF6',
  lightGoldSoft: '#FDF0CC',
  lightGreen: '#E3F3E6',
  lightOrange: '#FFEBD2',
  orangeText: '#9A5A00',
  redHover: '#C4202B',
  navyMid: '#5C7AB0',
} as const;

/** Order-status colours used by the dashboard donut and legend. */
export const statusColors: Record<string, string> = {
  DELIVERED: brand.green,
  OUT_FOR_DELIVERY: brand.gold,
  PREPARING: brand.maroon,
  PACKED: brand.navyMid,
  CONFIRMED: brand.navy,
  PLACED: brand.grey,
  CANCELLED: brand.red,
};

/** Categorical series colours for segment charts. */
export const seriesColors = [brand.green, brand.red, brand.gold, brand.maroon, brand.navy, brand.navyMid];
