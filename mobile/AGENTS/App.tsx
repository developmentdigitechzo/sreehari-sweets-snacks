import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from '@expo-google-fonts/inter';
import { createNavigationContainerRef, DefaultTheme, NavigationContainer } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useRef } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { PermissionHost } from './src/components/PermissionHost';
import { ToastHost } from './src/components/Toast';
import { RootNavigator } from './src/navigation/RootNavigator';
import { startCatalogSync } from './src/services/catalogSync';
import type { NotificationTarget } from './src/services/permissions/logic';
import { configureNotifications } from './src/services/permissions/notificationPermission';
import { startNotificationListeners } from './src/services/permissions/notificationListeners';
import { useAuth } from './src/store/useAuth';
import { colors } from './src/theme';

SplashScreen.preventAutoHideAsync().catch(() => {});

// Deep links for native & URL paths for web SPA
const linking = {
  prefixes: ['shreehari://', '/'],
  config: {
    screens: {
      Main: {
        screens: {
          Home: '',
          Categories: 'categories',
          OffersTab: 'offers',
          Orders: 'orders',
          Account: 'account',
        },
      },
      Splash: 'splash',
      Onboarding: 'welcome',
      Login: 'login',
      Signup: 'signup',
      ForgotPassword: 'forgot-password',
      ResetPassword: 'reset-password',
      VerifyEmail: 'verify-email',
      Listing: 'products',
      ProductDetail: 'product/:productId',
      Cart: 'cart',
      Checkout: 'checkout',
      Payment: 'payment',
      OrderResult: 'order-result',
      OrderTracking: 'order-tracking/:orderId',
      Offers: 'all-offers',
      Wishlist: 'wishlist',
      Inbox: 'inbox',
      Addresses: 'addresses',
      PhotoManager: 'photo-manager',
    },
  },
};

const navTheme = {
  ...DefaultTheme,
  colors: { ...DefaultTheme.colors, background: colors.background, card: colors.background, primary: colors.primary, text: colors.text, border: colors.border },
};

const navigationRef = createNavigationContainerRef();
const BEFORE_HOME = new Set(['Splash', 'Onboarding']);

export default function App() {
  // A tapped notification that arrives before the app is ready (cold start) waits until the home screen is showing.
  const pending = useRef<NotificationTarget | null>(null);
  const open = (t: NotificationTarget) => {
    if (!useAuth.getState().user) return; // signed out: there is nothing of theirs to open
    (navigationRef as unknown as { navigate: (name: string, params?: object) => void }).navigate(t.name, 'params' in t ? t.params : undefined);
  };
  const flush = () => {
    const t = pending.current;
    if (t && navigationRef.isReady() && !BEFORE_HOME.has(navigationRef.getCurrentRoute()?.name ?? 'Splash')) { pending.current = null; open(t); }
  };

  const [loaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  // Live backend: keep the catalogue current while the app is open.
  useEffect(() => startCatalogSync(), []);

  // Notifications: channels and foreground behaviour, tap navigation and push-token upkeep. Shows no permission prompt.
  useEffect(() => {
    configureNotifications();
    return startNotificationListeners({
      userId: () => useAuth.getState().user?.id,
      navigate: (t) => { pending.current = t; flush(); },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!loaded) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.background }}>
      <SafeAreaProvider>
        <StatusBar style="dark" />
        <NavigationContainer ref={navigationRef} theme={navTheme} linking={linking} onReady={flush} onStateChange={flush}>
          <RootNavigator />
        </NavigationContainer>
        <PermissionHost />
        <ToastHost />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
