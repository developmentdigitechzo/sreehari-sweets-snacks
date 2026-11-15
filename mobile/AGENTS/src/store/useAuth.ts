import { syncPushRegistration, unregisterPushDevice } from '../services/permissions/notificationPermission';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { create } from 'zustand';
import { refreshAll } from '../services/accountSync';
import { api } from '../services/api';
import { authApi, AuthResult, LoginInput, SignupInput } from '../services/authApi';
import { USE_MOCK_API } from '../data/config';
import { session } from '../services/session';
import { toast } from './useToast';
import type { User } from '../types';
import { useShop } from './useShop';

let unsubscribeCartSync: (() => void) | null = null;
let cartSyncFailed = false;

/** Live backend only: reconcile with the server after sign-in, then push cart changes (debounced). */
async function startAccountSync() {
  unsubscribeCartSync?.();
  unsubscribeCartSync = null;
  if (!api.account) return;
  try {
    const [addresses, cart] = await Promise.all([api.account.addresses(), api.account.cart()]);
    useShop.getState().applyServerData({ addresses, cart });
    await api.account.saveCart(useShop.getState().cart);
    await refreshAll();
  } catch {
    /* offline or server down: keep working locally */
  }
  let timer: ReturnType<typeof setTimeout> | null = null;
  unsubscribeCartSync = useShop.subscribe((s, prev) => {
    if (s.cart === prev.cart || s.ownerId === 'guest') return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      api.account?.saveCart(s.cart).then(() => { cartSyncFailed = false; }).catch(() => {
        // Tell the customer once per outage, not on every edit.
        if (!cartSyncFailed) toast('Your cart isn’t syncing right now. It’s safe on this phone and will sync when you’re back online.', 'info');
        cartSyncFailed = true;
      });
    }, 800);
  });
}

const TOKEN_KEY = 'shree-hari-token';
const USER_KEY = 'shree-hari-user';

/** Tokens go to the OS keychain/keystore on devices. The web preview has no secure store, so it falls back to local storage. */
const tokenStore = {
  async get() {
    try {
      return Platform.OS === 'web' ? await AsyncStorage.getItem(TOKEN_KEY) : await SecureStore.getItemAsync(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  async set(v: string) {
    try {
      if (Platform.OS === 'web') await AsyncStorage.setItem(TOKEN_KEY, v);
      else await SecureStore.setItemAsync(TOKEN_KEY, v);
    } catch {
      /* non-fatal: user simply has to sign in again next launch */
    }
  },
  async clear() {
    try {
      if (Platform.OS === 'web') await AsyncStorage.removeItem(TOKEN_KEY);
      else await SecureStore.deleteItemAsync(TOKEN_KEY);
    } catch {
      /* ignore */
    }
  },
};

type AuthState = {
  user: User | null;
  token: string | null;
  ready: boolean;
  init: () => Promise<void>;
  signup: (i: SignupInput) => Promise<void>;
  login: (i: LoginInput) => Promise<void>;
  demoLogin: () => Promise<void>;
  /** Live only: re-reads the customer from the server (picks up emailVerified). Silent when offline. */
  refreshUser: () => Promise<void>;
  /** Complete a sign-in that was verified elsewhere (e.g. one-time code). */
  signInWith: (r: AuthResult) => Promise<void>;
  logout: () => Promise<void>;
};

export const useAuth = create<AuthState>((set, get) => {
  let signingOut = false;
  // The server refused the saved token (older than 12 hours, account blocked, ...): sign out once and say why.
  session.onRejected(() => {
    if (signingOut || !get().user || get().user?.isDemo) return;
    signingOut = true;
    void get().logout().finally(() => { signingOut = false; toast('Your session ended. Please sign in again.', 'info'); });
  });

  const complete = async ({ user, token }: AuthResult) => {
    await tokenStore.set(token);
    await AsyncStorage.setItem(USER_KEY, JSON.stringify(user));
    session.set(token);
    set({ user, token });
    useShop.getState().switchOwner(user); // merges the guest cart into the account
    startAccountSync();
    syncPushRegistration(user.id).catch(() => {}); // only if notifications are already allowed; never prompts
  };

  return {
    user: null,
    token: null,
    ready: false,
    init: async () => {
      if (get().ready) return;
      try {
        const [token, rawUser] = await Promise.all([tokenStore.get(), AsyncStorage.getItem(USER_KEY)]);
        if (token && !USE_MOCK_API && token.startsWith('demo.')) {
          // A sign-in saved by an earlier demo build is not a real session on the live store: start signed out.
          await tokenStore.clear();
          await AsyncStorage.removeItem(USER_KEY);
        } else if (token && rawUser) {
          session.set(token);
          const restored = JSON.parse(rawUser) as User;
          set({ user: restored, token });
          startAccountSync();
          syncPushRegistration(restored.id).catch(() => {}); // refresh this phone's token; never prompts
          get().refreshUser().catch(() => {}); // picks up changes made elsewhere, e.g. the email was verified
        }
      } catch {
        /* treated as signed out */
      }
      set({ ready: true });
    },
    refreshUser: async () => {
      if (!authApi.refreshUser || !get().user) return;
      try {
        const fresh = await authApi.refreshUser();
        await AsyncStorage.setItem(USER_KEY, JSON.stringify(fresh));
        set({ user: fresh });
      } catch {
        /* offline or signed out: keep the cached user */
      }
    },
    signInWith: (r) => complete(r),
    signup: async (i) => complete(await authApi.signup(i)),
    login: async (i) => complete(await authApi.login(i)),
    demoLogin: async () => {
      if (!authApi.demoLogin) throw new Error('Demo sign-in is not available');
      await complete(await authApi.demoLogin());
    },
    logout: async () => {
      await unregisterPushDevice().catch(() => {}); // needs the session, so it runs first
      await tokenStore.clear();
      await AsyncStorage.removeItem(USER_KEY);
      unsubscribeCartSync?.();
      unsubscribeCartSync = null;
      session.set(null);
      set({ user: null, token: null });
      useShop.getState().switchOwner(null); // account data is archived; the guest cart starts empty
    },
  };
});

export const useIsSignedIn = () => useAuth((s) => !!s.user);
