import { duration, timingConfig } from '../animations/motion';
import { API_MODE } from '../services/api';
import * as ExpoSplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { Logo } from '../components/BrandHeader';
import { AppText } from '../components/AppText';
import { useAuth } from '../store/useAuth';
import { useCapabilities } from '../store/useCapabilities';
import { useCatalog } from '../store/useCatalog';
import { useShop } from '../store/useShop';
import { colors, gradients, alpha } from '../theme';
import type { RootScreenProps } from '../navigation/types';

export function SplashScreen({ navigation }: RootScreenProps<'Splash'>) {
  const hydrated = useShop((s) => s.hydrated);
  const onboarded = useShop((s) => s.onboarded);
  const load = useCatalog((s) => s.load);
  const initAuth = useAuth((s) => s.init);
  const loadCaps = useCapabilities((s) => s.load);
  const authReady = useAuth((s) => s.ready);
  const reduce = useReducedMotion();

  const logo = useSharedValue(reduce ? 1 : 0);
  const glow = useSharedValue(0);
  const tag = useSharedValue(reduce ? 1 : 0);

  useEffect(() => {
    // Hide the native OS splash screen once the React Native JS UI is mounted
    ExpoSplashScreen.hideAsync().catch(() => {});
    load();
    initAuth();
    loadCaps();
    if (reduce) return;
    logo.value = withTiming(1, timingConfig(duration.large + 300));
    glow.value = withTiming(1, { duration: 1200, easing: Easing.out(Easing.cubic) });
    tag.value = withDelay(700, withTiming(1, { duration: 600 }));
  }, [load, initAuth, loadCaps, reduce, logo, glow, tag]);

  useEffect(() => {
    if (!hydrated || !authReady) return;
    const t = setTimeout(() => navigation.replace(onboarded ? 'Main' : 'Onboarding'), reduce ? 400 : 2100);
    return () => clearTimeout(t);
  }, [hydrated, authReady, onboarded, navigation, reduce]);

  const logoStyle = useAnimatedStyle(() => ({ opacity: logo.value, transform: [{ scale: 0.7 + logo.value * 0.3 }, { translateY: (1 - logo.value) * 24 }] }));
  const glowStyle = useAnimatedStyle(() => ({ opacity: glow.value * 0.55, transform: [{ scale: 0.6 + glow.value * 0.9 }] }));
  const tagStyle = useAnimatedStyle(() => ({ opacity: tag.value, transform: [{ translateY: (1 - tag.value) * 10 }] }));

  return (
    <LinearGradient colors={gradients.header} style={styles.fill}>
      <StatusBar style="light" />
      <View style={styles.center}>
        <Animated.View style={[styles.glow, glowStyle]} />
        <Animated.View style={logoStyle}>
          <Logo width={280} onDark />
        </Animated.View>
        <Animated.View style={tagStyle}>
          <AppText variant="body" color={alpha.white(0.8)} style={{ marginTop: 18, letterSpacing: 1.5 }}>FRESH · TRADITIONAL · PREMIUM</AppText>
        </Animated.View>
      </View>
      {API_MODE === 'mock' && <AppText variant="caption" color={alpha.white(0.75)} align="center" style={{ position: 'absolute', bottom: 40, alignSelf: 'center' }}>Client POC · sample data</AppText>}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  glow: { position: 'absolute', width: 320, height: 320, borderRadius: 160, backgroundColor: colors.accent, opacity: 0.2 },
});
