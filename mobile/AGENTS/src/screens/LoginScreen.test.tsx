import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { LoginScreen } from './LoginScreen';
import { useCapabilities } from '../store/useCapabilities';

/* ---- doubles for everything outside the screen: the server, the auth store and navigation ---- */
const mockLogin = jest.fn();
const mockSignInWith = jest.fn();
const mockRequestOtp = jest.fn();
const mockVerifyOtp = jest.fn();

jest.mock('../services/authApi', () => {
  class AuthError extends Error {
    field?: string;
    constructor(message: string, field?: string) {
      super(message);
      this.field = field;
    }
  }
  return {
    AuthError,
    authApi: { mode: 'live', requestOtp: (...a: unknown[]) => mockRequestOtp(...a), verifyOtp: (...a: unknown[]) => mockVerifyOtp(...a) },
  };
});

jest.mock('../store/useAuth', () => {
  const state = { login: (...a: unknown[]) => mockLogin(...a), signInWith: (...a: unknown[]) => mockSignInWith(...a), demoLogin: jest.fn() };
  return { useAuth: (sel: (s: typeof state) => unknown) => sel(state) };
});

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn(), canGoBack: () => true }),
  CommonActions: { reset: (x: unknown) => x },
}));

const nav = () => ({ navigate: jest.fn(), replace: jest.fn(), goBack: jest.fn(), canGoBack: () => true, dispatch: jest.fn() });
const renderLogin = async (route: { params?: object } = {}) => {
  const navigation = nav();
  await render(<LoginScreen navigation={navigation as never} route={route as never} />);
  return navigation;
};
const setOtp = (otp: 'none' | 'development' | 'sms') => useCapabilities.setState({ caps: { otp, passwordReset: false, payments: 'none', reverseGeocoding: false }, loaded: true });

beforeEach(() => {
  mockLogin.mockReset().mockResolvedValue(undefined);
  mockSignInWith.mockReset().mockResolvedValue(undefined);
  mockRequestOtp.mockReset();
  mockVerifyOtp.mockReset();
});

describe('LoginScreen: mobile number first', () => {
  it('starts with the mobile number step', async () => {
    setOtp('none');
    await renderLogin();
    expect(screen.getByText('Welcome to Shree Hari')).toBeTruthy();
    expect(screen.getByText('+91')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeTruthy();
  });

  it('refuses a number that is not a valid Indian mobile, and sends nothing', async () => {
    setOtp('development');
    await renderLogin();
    await fireEvent.changeText(screen.getByLabelText('Mobile number'), '12345');
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByText('Enter a valid 10-digit mobile number')).toBeTruthy();
    expect(mockRequestOtp).not.toHaveBeenCalled();
  });

  describe('when the server can send codes', () => {
    beforeEach(() => setOtp('development'));

    it('asks for a code, then signs in with it', async () => {
      mockRequestOtp.mockResolvedValue({ delivery: 'development', devCode: '123456', cooldownSeconds: 30 });
      mockVerifyOtp.mockResolvedValue({ user: { id: 'u1', name: 'A', phone: '+919876543210' }, token: 't' });
      const navigation = await renderLogin();
      await fireEvent.changeText(screen.getByLabelText('Mobile number'), '9876543210');
      await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));

      expect(await screen.findByText('Verify and log in')).toBeTruthy();
      expect(mockRequestOtp).toHaveBeenCalledWith('9876543210');
      expect(screen.getByText(/DEVELOPMENT MODE: no SMS was sent\. Your code is 123456/)).toBeTruthy();

      await fireEvent.changeText(screen.getByLabelText('6-digit code'), '123456');
      await fireEvent.press(screen.getByRole('button', { name: 'Verify and log in' }));
      await waitFor(() => expect(mockVerifyOtp).toHaveBeenCalledWith('9876543210', '123456'));
      await waitFor(() => expect(mockSignInWith).toHaveBeenCalled());
      await waitFor(() => expect(navigation.goBack).toHaveBeenCalled());
    });

    it('does not claim an SMS was sent unless the provider really sent one', async () => {
      mockRequestOtp.mockResolvedValue({ delivery: 'sms', cooldownSeconds: 30 });
      await renderLogin();
      await fireEvent.changeText(screen.getByLabelText('Mobile number'), '9876543210');
      await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
      expect(await screen.findByText('If this number has an account, we have sent a 6-digit code by SMS.')).toBeTruthy();
    });

    it('shows a wrong-code error and stays on the code step', async () => {
      mockRequestOtp.mockResolvedValue({ delivery: 'development', devCode: '111111', cooldownSeconds: 30 });
      const { AuthError } = jest.requireMock('../services/authApi');
      mockVerifyOtp.mockRejectedValue(new AuthError('That code is not right. 4 attempts left.'));
      await renderLogin();
      await fireEvent.changeText(screen.getByLabelText('Mobile number'), '9876543210');
      await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
      await fireEvent.changeText(await screen.findByLabelText('6-digit code'), '999999');
      await fireEvent.press(screen.getByRole('button', { name: 'Verify and log in' }));
      expect(await screen.findByText('That code is not right. 4 attempts left.')).toBeTruthy();
      expect(mockSignInWith).not.toHaveBeenCalled();
    });

    it('lets the customer go back to change the number', async () => {
      mockRequestOtp.mockResolvedValue({ delivery: 'development', devCode: '111111', cooldownSeconds: 30 });
      await renderLogin();
      await fireEvent.changeText(screen.getByLabelText('Mobile number'), '9876543210');
      await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
      await fireEvent.press(await screen.findByRole('button', { name: 'Change mobile number' }));
      expect(await screen.findByRole('button', { name: 'Continue' })).toBeTruthy();
    });
  });

  describe('when the server cannot send codes', () => {
    beforeEach(() => setOtp('none'));

    it('moves on to the password for the same number', async () => {
      await renderLogin();
      await fireEvent.changeText(screen.getByLabelText('Mobile number'), '9876543210');
      await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
      expect(await screen.findByLabelText('Password')).toBeTruthy();
      expect(screen.getByText('+91 98765 43210')).toBeTruthy();
      expect(mockRequestOtp).not.toHaveBeenCalled();

      await fireEvent.changeText(screen.getByLabelText('Password'), 'secret-pass-1');
      await fireEvent.press(screen.getByRole('button', { name: 'Log in' }));
      await waitFor(() => expect(mockLogin).toHaveBeenCalledWith({ identifier: '9876543210', password: 'secret-pass-1' }));
    });

    it('shows the server message when the password is wrong', async () => {
      const { AuthError } = jest.requireMock('../services/authApi');
      mockLogin.mockRejectedValue(new AuthError('Incorrect mobile/email or password'));
      await renderLogin();
      await fireEvent.changeText(screen.getByLabelText('Mobile number'), '9876543210');
      await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
      await fireEvent.changeText(await screen.findByLabelText('Password'), 'nope');
      await fireEvent.press(screen.getByRole('button', { name: 'Log in' }));
      expect(await screen.findByText('Incorrect mobile/email or password')).toBeTruthy();
    });

    it('requires a password before calling the server', async () => {
      await renderLogin();
      await fireEvent.changeText(screen.getByLabelText('Mobile number'), '9876543210');
      await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
      await fireEvent.press(await screen.findByRole('button', { name: 'Log in' }));
      expect(await screen.findByText('Enter your password')).toBeTruthy();
      expect(mockLogin).not.toHaveBeenCalled();
    });
  });

  it('keeps email login available', async () => {
    setOtp('development');
    await renderLogin();
    await fireEvent.press(screen.getByRole('button', { name: 'Use email and password instead' }));
    expect(await screen.findByLabelText('Mobile number or email')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Mobile number or email'), 'me@example.com');
    await fireEvent.changeText(screen.getByLabelText('Password'), 'secret-pass-1');
    await fireEvent.press(screen.getByRole('button', { name: 'Log in' }));
    await waitFor(() => expect(mockLogin).toHaveBeenCalledWith({ identifier: 'me@example.com', password: 'secret-pass-1' }));
  });

  it('explains the redirect to checkout and keeps the cart', async () => {
    setOtp('none');
    await renderLogin({ params: { redirect: 'Checkout' } });
    expect(screen.getByText('Please log in to continue to checkout. Your cart will be kept.')).toBeTruthy();
  });
});
