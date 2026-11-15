import type { Config } from 'tailwindcss';
import { brand } from './lib/colors';

// Tokens follow the Sree Sweets reference: red primary, navy secondary, gold accents, cream canvas, white cards.
// Class names (burgundy, gold, ink ...) are kept so existing screens keep working; their values are the brand palette.
export default {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        burgundy: { DEFAULT: brand.red, dark: brand.maroon, light: brand.redHover, soft: brand.lightRed, tint: brand.lightRed },
        navy: { DEFAULT: brand.navy, soft: brand.lightNavy },
        cream: { DEFAULT: brand.cream, deep: brand.creamDeep },
        gold: { DEFAULT: brand.gold, soft: brand.lightGoldSoft, light: brand.lightGold },
        ink: { DEFAULT: brand.darkText, muted: brand.textMuted, faint: brand.grey },
        line: brand.border,
        ok: { DEFAULT: brand.green, soft: brand.lightGreen },
        warn: { DEFAULT: brand.orange, soft: brand.lightOrange, dark: brand.orangeText },
        bad: { DEFAULT: brand.red, soft: brand.lightRed },
        info: { DEFAULT: brand.navy, soft: brand.lightNavy },
        violet: { soft: brand.lightRed, DEFAULT: brand.maroon },
      },
      fontFamily: {
        serif: ['Georgia', '"Times New Roman"', 'serif'],
        sans: ['ui-sans-serif', 'system-ui', '"Segoe UI"', 'Roboto', 'sans-serif'],
      },
      boxShadow: { card: '0 1px 2px rgba(41,38,43,0.05), 0 4px 16px rgba(41,38,43,0.06)' },
      borderRadius: { xl2: '14px' },
    },
  },
  plugins: [],
} satisfies Config;
