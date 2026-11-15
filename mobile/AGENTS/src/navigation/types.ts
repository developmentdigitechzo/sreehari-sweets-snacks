import type { NavigatorScreenParams } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

export type TabParamList = {
  Home: undefined;
  Categories: undefined;
  OffersTab: undefined;
  Orders: undefined;
  Account: undefined;
};

/** Where to go after a successful login/signup (used when checkout requires an account). */
export type AuthRedirect = 'Checkout';
export type AuthParams = { redirect?: AuthRedirect } | undefined;

export type RootStackParamList = {
  Splash: undefined;
  Onboarding: undefined;
  Main: NavigatorScreenParams<TabParamList> | undefined;
  Login: AuthParams;
  Signup: AuthParams;
  ForgotPassword: undefined;
  ResetPassword: { token?: string } | undefined;
  VerifyEmail: { token?: string } | undefined;
  Listing: { q?: string; collectionId?: string; /** Show exactly these products (used by Home shelves' View All). */ productIds?: string[]; categoryId?: string; title?: string; focus?: boolean; /** Start listening for a voice search as soon as the screen opens. */ voice?: boolean };
  ProductDetail: { productId: string };
  Cart: undefined;
  Checkout: undefined;
  Payment: undefined;
  OrderResult: { orderId?: string; outcome: 'success' | 'pending' | 'failure' | 'requires_payment'; message?: string };
  OrderTracking: { orderId: string };
  Offers: undefined;
  Wishlist: undefined;
  Inbox: undefined;
  Addresses: { gps?: boolean } | undefined;
  PhotoManager: undefined;
};

export type RootScreenProps<T extends keyof RootStackParamList> = NativeStackScreenProps<RootStackParamList, T>;

declare global {
  namespace ReactNavigation {
    // Required by React Navigation's global typing pattern; the empty body is intentional.
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    interface RootParamList extends RootStackParamList {}
  }
}
