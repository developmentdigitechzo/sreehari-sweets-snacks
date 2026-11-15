import { duration, ease, timingConfig } from '../animations/motion';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, LayoutChangeEvent, Modal, Platform, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, spacing } from '../theme';
import { AppText } from './AppText';

type Props = {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  /** Defaults to 88% of the CURRENT window height, so it follows rotation, split-screen and foldables. */
  maxHeight?: number;
};

/** Modal sheet that slides up from the bottom edge by its own height, with drag-to-dismiss and a fading dimmed backdrop. */
export function BottomSheet({ visible, onClose, title, children, maxHeight }: Props) {
  const insets = useSafeAreaInsets();
  const { height: H } = useWindowDimensions(); // read live: a value taken once at app start goes stale on rotation
  const maxH = maxHeight ?? H * 0.88;
  const [mounted, setMounted] = useState(visible);
  // The sheet slides only its OWN height (like Swiggy / Zomato), never the whole window, and the dim layer fades on its own.
  // Before the first layout the sheet is parked off-screen (y = H) and invisible.
  const y = useSharedValue(H);
  const sheetH = useSharedValue(H);
  const dim = useSharedValue(0);
  const shown = useRef(false);
  const reduce = useReducedMotion();

  const finishClose = useCallback(() => setMounted(false), []);

  const slideIn = useCallback(() => {
    if (shown.current) return;
    shown.current = true;
    if (reduce) {
      y.value = 0;
      dim.value = 1;
      return;
    }
    y.value = sheetH.value; // start exactly one sheet-height below the screen edge
    y.value = withTiming(0, { duration: duration.card - 20, easing: ease });
    dim.value = withTiming(1, { duration: duration.small, easing: ease });
  }, [reduce, y, dim, sheetH]);

  const onSheetLayout = useCallback(
    (e: LayoutChangeEvent) => {
      sheetH.value = e.nativeEvent.layout.height;
      slideIn();
    },
    [sheetH, slideIn],
  );

  useEffect(() => {
    if (visible) {
      shown.current = false;
      setMounted(true);
    } else if (mounted) {
      const d = reduce ? 0 : duration.small;
      dim.value = withTiming(0, { duration: d, easing: ease });
      y.value = withTiming(sheetH.value, { duration: d, easing: ease }, (done) => {
        if (done) runOnJS(finishClose)();
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const pan = Gesture.Pan()
    .onUpdate((e) => {
      y.value = Math.max(0, e.translationY);
      dim.value = interpolate(y.value, [0, sheetH.value], [1, 0], 'clamp');
    })
    .onEnd((e) => {
      if (e.translationY > 110 || e.velocityY > 900) runOnJS(onClose)();
      else {
        y.value = withTiming(0, timingConfig(duration.small));
        dim.value = withTiming(1, timingConfig(duration.small));
      }
    });

  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  const backdropStyle = useAnimatedStyle(() => ({ opacity: dim.value }));

  if (!mounted) return null;

  return (
    <Modal transparent visible statusBarTranslucent animationType="none" onRequestClose={onClose}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, justifyContent: 'flex-end' }}>
          <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: colors.overlay }, backdropStyle]}>
            <Pressable style={{ flex: 1 }} onPress={onClose} accessibilityLabel="Close" />
          </Animated.View>
          <Animated.View testID="bottom-sheet" onLayout={onSheetLayout} style={[styles.sheet, { maxHeight: maxH, paddingBottom: insets.bottom + spacing.lg }, sheetStyle]}>
            <GestureDetector gesture={pan}>
              <View style={styles.handleZone}>
                <View style={styles.handle} />
                {!!title && <AppText variant="h1" style={{ marginTop: 6 }}>{title}</AppText>}
              </View>
            </GestureDetector>
            {children}
          </Animated.View>
        </KeyboardAvoidingView>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.lg,
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
  },
  handleZone: { alignItems: 'center', paddingTop: 10, paddingBottom: spacing.md, alignSelf: 'stretch' },
  handle: { width: 44, height: 5, borderRadius: 3, backgroundColor: colors.border },
});
