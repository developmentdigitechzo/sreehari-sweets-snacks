import { useCallback, useState } from 'react';
import type { LayoutChangeEvent } from 'react-native';
import { spacing } from '../theme';

/**
 * Screens with a bar pinned to the bottom (Cart, Checkout, Payment, Product detail) must leave room for it at the end of the
 * scrolling content, or the last items hide behind it. The bar's height changes with the phone's bottom inset, the text size and a
 * line of help text, so it is measured instead of guessed: put `onLayout` on the bar and use `clearance` as the scroll content's bottom padding.
 */
export function useStickyBar(fallback = 110) {
  const [height, setHeight] = useState(0);
  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const h = Math.ceil(e.nativeEvent.layout.height);
    setHeight((prev) => (prev === h ? prev : h));
  }, []);
  return { onLayout, clearance: (height || fallback) + spacing.lg };
}
