import { Easing, FadeIn, FadeInDown, LinearTransition, ReduceMotion } from 'react-native-reanimated';

/**
 * One calm motion language for the whole app. No springs, no overshoot, no zoom-pops.
 * Durations follow the product direction: press 120–180, small 180–250, card/screen 250–350, large 300–450 ms.
 */
export const duration = { press: 140, release: 180, small: 220, card: 300, screen: 300, large: 400 } as const;

/** Gentle ease-out: fast start, long soft landing. */
export const ease = Easing.bezier(0.22, 0.61, 0.36, 1);

export const timingConfig = (ms: number) => ({ duration: ms, easing: ease });

/** Entering / layout presets (all honour the system "reduce motion" setting). */
export const softIn = FadeIn.duration(duration.small).easing(ease).reduceMotion(ReduceMotion.System);
export const riseIn = FadeInDown.duration(duration.card).easing(ease).reduceMotion(ReduceMotion.System);
export const layoutTransition = LinearTransition.duration(duration.card).easing(ease).reduceMotion(ReduceMotion.System);
