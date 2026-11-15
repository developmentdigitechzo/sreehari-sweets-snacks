import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { SignupScreen } from './SignupScreen';
import { useCapabilities } from '../store/useCapabilities';

const mockSignup = jest.fn();
const mockSignInWith = jest.fn();
const mockRequest = jest.fn();
const mockVerify = jest.fn();
const mockComplete = jest.fn();
let mockHasCodeSignup = true;

jest.mock('../services/authApi', () => {
  class AuthError extends Error {
    field?: string;
    constructor(message: string, field?: string) {
      super(message);
      this.field = field;
    }
  }
  const api: Record<string, unknown> = { mode: 'live' };
  Object.defineProperties(api, {
    requestSignupOtp: { get: () => (mockHasCodeSignup ? (...a: unknown[]) => mockRequest(...a) : undefined), enumerable: true },
    verifySignupOtp: { get: () => (mockHasCodeSignup ? (...a: unknown[]) => mockVerify(...a) : undefined), enumerable: true },
    completeSignup: { get: () => (mockHasCodeSignup ? (...a: unknown[]) => mockComplete(...a) : undefined), enumerable: true },
  });
  return { AuthError, authApi: api };
});
jest.mock('../store/useAuth', () => {
  const state = { signup: (...a: unknown[]) => mockSignup(...a), signInWith: (...a: unknown[]) => mockSignInWith(...a) };
  return { useAuth: (sel: (s: typeof state) => unknown) => sel(state) };
});
jest.mock('@react-navigation/native', () => ({ useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn(), canGoBack: () => true }), CommonActions: { reset: (x: unknown) => x } }));

const renderSignup = async () => {
  const navigation = { navigate: jest.fn(), replace: jest.fn(), goBack: jest.fn(), canGoBack: () => true, dispatch: jest.fn() };
  await render(<SignupScreen navigation={navigation as never} route={{ params: undefined } as never} />);
  return navigation;
};
const setOtp = (otp: 'none' | 'development' | 'sms') => useCapabilities.setState({ caps: { otp, passwordReset: false, payments: 'none', reverseGeocoding: false }, loaded: true });

beforeEach(() => {
  mockHasCodeSignup = true;
  for (const m of [mockSignup, mockSignInWith, mockRequest, mockVerify, mockComplete]) m.mockReset();
  mockSignup.mockResolvedValue(undefined);
  mockSignInWith.mockResolvedValue(undefined);
});

const toCodeStep = async () => {
  mockRequest.mockResolvedValue({ delivery: 'development', devCode: '123456', cooldownSeconds: 30 });
  await fireEvent.changeText(screen.getByLabelText('Mobile number'), '9876543210');
  await fireEvent.press(screen.getByRole('button', { name: 'Send code' }));
  await screen.findByText('Verify');
};
const toDetails = async () => {
  await toCodeStep();
  mockVerify.mockResolvedValue({ signupToken: 'proof-token-123' });
  await fireEvent.changeText(screen.getByLabelText('6-digit code'), '123456');
  await fireEvent.press(screen.getByRole('button', { name: 'Verify' }));
  await screen.findByLabelText('Full name');
};

describe('SignupScreen: phone first, with a code', () => {
  beforeEach(() => setOtp('development'));

  it('starts with the mobile number, not a long form', async () => {
    await renderSignup();
    expect(screen.getByRole('button', { name: 'Send code' })).toBeTruthy();
    expect(screen.queryByLabelText('Full name')).toBeNull();
    expect(screen.queryByLabelText('Password')).toBeNull();
  });

  it('refuses an invalid number without asking the server', async () => {
    await renderSignup();
    await fireEvent.changeText(screen.getByLabelText('Mobile number'), '12345');
    await fireEvent.press(screen.getByRole('button', { name: 'Send code' }));
    expect(await screen.findByText('Enter a valid 10-digit mobile number')).toBeTruthy();
    expect(mockRequest).not.toHaveBeenCalled();
  });

  it('asks for the code, and verifying it moves on to the name step with the number shown as verified', async () => {
    await renderSignup();
    await toDetails();
    expect(mockRequest).toHaveBeenCalledWith('9876543210');
    expect(mockVerify).toHaveBeenCalledWith('9876543210', '123456');
    expect(screen.getByLabelText('+91 98765 43210 verified')).toBeTruthy();
    expect(screen.getByText('One last step: tell us your name')).toBeTruthy();
  });

  it('a number that already has an account gets the server message, and a way to log in', async () => {
    const { AuthError } = jest.requireMock('../services/authApi');
    mockRequest.mockRejectedValue(new AuthError('An account with this mobile number already exists. Try logging in.', 'phone'));
    const navigation = await renderSignup();
    await fireEvent.changeText(screen.getByLabelText('Mobile number'), '9876543210');
    await fireEvent.press(screen.getByRole('button', { name: 'Send code' }));
    expect(await screen.findByText('An account with this mobile number already exists. Try logging in.')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Log in' }));
    expect(navigation.replace).toHaveBeenCalledWith('Login', undefined);
  });

  it('a wrong code shows the error and stays on the code step', async () => {
    const { AuthError } = jest.requireMock('../services/authApi');
    await renderSignup();
    await toCodeStep();
    mockVerify.mockRejectedValue(new AuthError('Incorrect code. 2 attempts left.'));
    await fireEvent.changeText(screen.getByLabelText('6-digit code'), '000000');
    await fireEvent.press(screen.getByRole('button', { name: 'Verify' }));
    expect(await screen.findByText('Incorrect code. 2 attempts left.')).toBeTruthy();
    expect(screen.queryByLabelText('Full name')).toBeNull();
  });

  it('creates the account from the name, then shows the welcome screen', async () => {
    mockComplete.mockResolvedValue({ user: { id: 'u1', name: 'Asha Rao', phone: '+919876543210' }, token: 't' });
    await renderSignup();
    await toDetails();
    await fireEvent.changeText(screen.getByLabelText('Full name'), 'Asha Rao');
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Accept terms and privacy policy' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Create account' }));
    await waitFor(() => expect(mockComplete).toHaveBeenCalledWith({ signupToken: 'proof-token-123', name: 'Asha Rao', email: undefined, consent: true }));
    await waitFor(() => expect(mockSignInWith).toHaveBeenCalled());
    expect(await screen.findByText('Welcome, Asha!')).toBeTruthy();
  });

  it('needs a name and the terms before it calls the server', async () => {
    await renderSignup();
    await toDetails();
    await fireEvent.press(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByText('Enter your full name')).toBeTruthy();
    expect(screen.getByText('Please accept the terms and privacy policy to continue')).toBeTruthy();
    expect(mockComplete).not.toHaveBeenCalled();
  });

  it('shows an email that is already in use under the email field', async () => {
    const { AuthError } = jest.requireMock('../services/authApi');
    mockComplete.mockRejectedValue(new AuthError('An account with this email already exists.', 'email'));
    await renderSignup();
    await toDetails();
    await fireEvent.changeText(screen.getByLabelText('Full name'), 'Asha Rao');
    await fireEvent.changeText(screen.getByLabelText('Email (optional)'), 'asha@example.com');
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Accept terms and privacy policy' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByText('An account with this email already exists.')).toBeTruthy();
    expect(mockSignInWith).not.toHaveBeenCalled();
  });

  it('keeps the password form available', async () => {
    await renderSignup();
    await fireEvent.press(screen.getByRole('button', { name: 'Use a password instead' }));
    expect(await screen.findByLabelText('Password')).toBeTruthy();
    expect(screen.getByLabelText('Confirm password')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Sign up with a code instead' })).toBeTruthy();
  });
});

describe('SignupScreen: when codes are not available', () => {
  it('shows the password form, exactly as before, when the server cannot send codes', async () => {
    setOtp('none');
    await renderSignup();
    expect(screen.getByLabelText('Full name')).toBeTruthy();
    expect(screen.getByLabelText('Password')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Send code' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Sign up with a code instead' })).toBeNull();
  });

  it('shows the password form in demo mode, where the signup calls do not exist', async () => {
    setOtp('development');
    mockHasCodeSignup = false;
    await renderSignup();
    expect(screen.getByLabelText('Password')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Send code' })).toBeNull();
  });

  it('the password form still creates an account through the existing signup', async () => {
    setOtp('none');
    await renderSignup();
    await fireEvent.changeText(screen.getByLabelText('Full name'), 'Asha Rao');
    await fireEvent.changeText(screen.getByLabelText('Mobile number'), '9876543210');
    await fireEvent.changeText(screen.getByLabelText('Password'), 'Secret-pass-1');
    await fireEvent.changeText(screen.getByLabelText('Confirm password'), 'Secret-pass-1');
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Accept terms and privacy policy' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Create account' }));
    await waitFor(() => expect(mockSignup).toHaveBeenCalledWith({ name: 'Asha Rao', phone: '9876543210', email: undefined, password: 'Secret-pass-1', consent: true }));
  });
});
