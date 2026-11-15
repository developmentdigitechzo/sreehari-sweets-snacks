import { useWindowDimensions } from 'react-native';
import { layout } from '../theme';

/**
 * Width of one product card: two cards exactly fill the content width (gutter, gap, gutter).
 * Every shelf and grid uses this so card sizes are identical on Home, Listing, Wishlist and Product detail.
 */
export function useCardWidth(): number {
  const { width } = useWindowDimensions();
  return Math.floor((Math.min(width, layout.maxContentWidth) - layout.gutter * 2 - layout.cardGap) / 2);
}
