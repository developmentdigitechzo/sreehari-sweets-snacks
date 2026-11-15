import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { OrdersScreen, isPast } from './OrdersScreen';
import { makeOrder } from '../testing/fixtures';
import { useShop } from '../store/useShop';

const mockNavigate = jest.fn();
let mockUser: { id: string } | null = { id: 'u1' };

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate, goBack: jest.fn(), canGoBack: () => true }),
  useFocusEffect: () => {},
}));
jest.mock('../services/accountSync', () => ({ refreshOrders: () => Promise.resolve() }));
jest.mock('../store/useAuth', () => ({ useAuth: (sel: (s: { user: unknown }) => unknown) => sel({ user: mockUser }) }));

const inTransit = makeOrder({ id: 'a', number: 'SH2001', status: 'out_for_delivery' });
const placed = makeOrder({ id: 'b', number: 'SH2002', status: 'placed' });
const delivered = makeOrder({ id: 'c', number: 'SH2003', status: 'delivered' });
const cancelled = makeOrder({ id: 'd', number: 'SH2004', status: 'cancelled' });

const setOrders = (orders: ReturnType<typeof makeOrder>[]) => useShop.setState({ orders });

beforeEach(() => {
  mockNavigate.mockReset();
  mockUser = { id: 'u1' };
  setOrders([inTransit, placed, delivered, cancelled]);
});

describe('isPast', () => {
  it('only delivered and cancelled orders are past', () => {
    expect([inTransit, placed, delivered, cancelled].map(isPast)).toEqual([false, false, true, true]);
  });
});

describe('OrdersScreen', () => {
  it('opens on Active and lists only orders still in progress, with counts on the tabs', async () => {
    await render(<OrdersScreen />);
    expect(screen.getByRole('tab', { name: 'Active, 2' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Past, 2' })).toBeTruthy();
    expect(screen.getByText('Order #SH2001')).toBeTruthy();
    expect(screen.getByText('Order #SH2002')).toBeTruthy();
    expect(screen.queryByText('Order #SH2003')).toBeNull();
  });

  it('switches to Past to show delivered and cancelled orders', async () => {
    await render(<OrdersScreen />);
    await fireEvent.press(screen.getByRole('tab', { name: 'Past, 2' }));
    expect(screen.getByText('Order #SH2003')).toBeTruthy();
    expect(screen.getByText('Order #SH2004')).toBeTruthy();
    expect(screen.queryByText('Order #SH2001')).toBeNull();
  });

  it('opens on Past when nothing is in progress', async () => {
    setOrders([delivered]);
    await render(<OrdersScreen />);
    expect(screen.getByText('Order #SH2003')).toBeTruthy();
  });

  it('says so when nothing is on its way, and points to Past', async () => {
    setOrders([delivered]);
    await render(<OrdersScreen />);
    await fireEvent.press(screen.getByRole('tab', { name: 'Active, 0' }));
    expect(screen.getByText('Nothing on its way')).toBeTruthy();
  });

  it('opens an order from its Track button', async () => {
    setOrders([inTransit]);
    await render(<OrdersScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Track order' }));
    expect(mockNavigate).toHaveBeenCalledWith('OrderTracking', { orderId: 'a' });
  });

  it('shows the first-order empty state and no tabs when there are no orders', async () => {
    setOrders([]);
    await render(<OrdersScreen />);
    expect(screen.getByText('No orders yet')).toBeTruthy();
    expect(screen.queryByRole('tab', { name: /Active/ })).toBeNull();
  });

  it('asks a signed-out visitor to log in, and shows none of the saved orders', async () => {
    mockUser = null;
    await render(<OrdersScreen />);
    expect(screen.getByText('Log in to see your orders')).toBeTruthy();
    expect(screen.queryByText('Order #SH2001')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Log in' }));
    expect(mockNavigate).toHaveBeenCalledWith('Login');
  });
});
