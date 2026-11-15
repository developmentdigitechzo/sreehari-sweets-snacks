import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';
import { AccountScreen } from '../screens/AccountScreen';
import { AddressesScreen } from '../screens/AddressesScreen';
import { CartScreen } from '../screens/CartScreen';
import { CategoriesScreen } from '../screens/CategoriesScreen';
import { CheckoutScreen } from '../screens/CheckoutScreen';
import { ForgotPasswordScreen } from '../screens/ForgotPasswordScreen';
import { HomeScreen } from '../screens/HomeScreen';
import { InboxScreen } from '../screens/InboxScreen';
import { LoginScreen } from '../screens/LoginScreen';
import { ResetPasswordScreen } from '../screens/ResetPasswordScreen';
import { VerifyEmailScreen } from '../screens/VerifyEmailScreen';
import { OffersScreen } from '../screens/OffersScreen';
import { OnboardingScreen } from '../screens/OnboardingScreen';
import { OrderResultScreen } from '../screens/OrderResultScreen';
import { OrdersScreen } from '../screens/OrdersScreen';
import { OrderTrackingScreen } from '../screens/OrderTrackingScreen';
import { PaymentScreen } from '../screens/PaymentScreen';
import { PhotoManagerScreen } from '../screens/PhotoManagerScreen';
import { ProductDetailScreen } from '../screens/ProductDetailScreen';
import { SearchScreen } from '../screens/SearchScreen';
import { SignupScreen } from '../screens/SignupScreen';
import { SplashScreen } from '../screens/SplashScreen';
import { WishlistScreen } from '../screens/WishlistScreen';
import { colors } from '../theme';
import { TabBar } from './TabBar';
import type { RootStackParamList, TabParamList } from './types';

const Tab = createBottomTabNavigator<TabParamList>();
const Stack = createNativeStackNavigator<RootStackParamList>();

function Tabs() {
  return (
    <Tab.Navigator
      tabBar={(p) => <TabBar {...p} />}
      // Tabs keep their scroll position and state when you come back to them. A short fade is the only transition.
      screenOptions={{ headerShown: false, animation: 'fade', lazy: true }}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Categories" component={CategoriesScreen} />
      <Tab.Screen name="OffersTab" component={OffersScreen} />
      <Tab.Screen name="Orders" component={OrdersScreen} />
      <Tab.Screen name="Account" component={AccountScreen} />
    </Tab.Navigator>
  );
}

/** One predictable pattern: pushed screens slide in from the right, state changes fade. No bottom-up or fade-from-bottom effects. */
export function RootNavigator() {
  return (
    <Stack.Navigator
      initialRouteName="Splash"
      screenOptions={{ headerShown: false, animation: 'slide_from_right', animationDuration: 280, contentStyle: { backgroundColor: colors.background } }}
    >
      <Stack.Screen name="Splash" component={SplashScreen} options={{ animation: 'fade' }} />
      <Stack.Screen name="Onboarding" component={OnboardingScreen} options={{ animation: 'fade' }} />
      <Stack.Screen name="Main" component={Tabs} options={{ animation: 'fade' }} />
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Signup" component={SignupScreen} />
      <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
      <Stack.Screen name="ResetPassword" component={ResetPasswordScreen} />
      <Stack.Screen name="VerifyEmail" component={VerifyEmailScreen} />
      <Stack.Screen name="Listing" component={SearchScreen} />
      <Stack.Screen name="ProductDetail" component={ProductDetailScreen} />
      <Stack.Screen name="Cart" component={CartScreen} />
      <Stack.Screen name="Checkout" component={CheckoutScreen} />
      <Stack.Screen name="Payment" component={PaymentScreen} />
      <Stack.Screen name="OrderResult" component={OrderResultScreen} options={{ animation: 'fade', gestureEnabled: false }} />
      <Stack.Screen name="OrderTracking" component={OrderTrackingScreen} />
      <Stack.Screen name="Offers" component={OffersScreen} />
      <Stack.Screen name="Wishlist" component={WishlistScreen} />
      <Stack.Screen name="Inbox" component={InboxScreen} />
      <Stack.Screen name="Addresses" component={AddressesScreen} />
      <Stack.Screen name="PhotoManager" component={PhotoManagerScreen} />
    </Stack.Navigator>
  );
}
