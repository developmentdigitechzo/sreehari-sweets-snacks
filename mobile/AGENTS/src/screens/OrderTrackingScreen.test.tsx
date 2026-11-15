import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { OrderTrackingScreen } from './OrderTrackingScreen';
import { makeOrder } from '../testing/fixtures';
import { useShop } from '../store/useShop';
import { useToast } from '../store/useToast';

/* The customer is signed in to a live store: orders come from a server, and cancelling is a server call. */
const mockCancelOrder = jest.fn();
jest.mock('../services/api', () => ({
  API_MODE: 'live',
  NO_CAPABILITIES: { otp: 'none', passwordReset: false, payments: 'none', reverseGeocoding: false },
  api: {
    account: { cancelOrder: (...a: unknown[]) => mockCancelOrder(...a), returnRequests: () => Promise.resolve([]), order: () => Promise.reject(new Error('offline')) },
    getCatalog: () => Promise.reject(new Error('not used')),
  },
}));
jest.mock('../services/accountSync', () => ({ refreshOrder: () => Promise.resolve() }));
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn(), canGoBack: () => true }),
  useFocusEffect: () => {},
}));

const propsFor = (orderId: string) => ({ route: { params: { orderId } }, navigation: {} }) as unknown as React.ComponentProps<typeof OrderTrackingScreen>;
const open = (o: ReturnType<typeof makeOrder>) => {
  useShop.setState({ orders: [o] });
  return render(<OrderTrackingScreen {...propsFor(o.id)} />);
};

beforeEach(() => {
  mockCancelOrder.mockReset();
  useToast.setState({ message: null, seq: 0 });
});

describe('OrderTrackingScreen: cancelling', () => {
  it('a just-placed Cash on Delivery order can be cancelled straight away', async () => {
    await open(makeOrder({ status: 'placed' }));
    expect(screen.getByRole('button', { name: 'Cancel Order' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Request cancellation' })).toBeNull();
  });

  it('confirming calls the server and the order becomes cancelled', async () => {
    const placed = makeOrder({ status: 'placed' });
    mockCancelOrder.mockResolvedValue({ ...placed, status: 'cancelled', payment: { ...placed.payment, status: 'cancelled' } });
    await open(placed);
    await fireEvent.press(screen.getByRole('button', { name: 'Cancel Order' }));
    expect(await screen.findByText('Cancel this order?')).toBeTruthy();
    expect(screen.getByText(/nothing is charged/i)).toBeTruthy();
    const confirm = screen.getAllByRole('button', { name: 'Cancel Order' }).at(-1)!;
    await fireEvent.press(confirm);
    await waitFor(() => expect(mockCancelOrder).toHaveBeenCalledWith(placed.id));
    await waitFor(() => expect(useShop.getState().orders[0]!.status).toBe('cancelled'));
    expect(useToast.getState().message).toBe('Order cancelled');
  });

  it('a refusal from the server is shown and the order is left alone', async () => {
    mockCancelOrder.mockRejectedValue(new Error('The store has already started on this order. Please send a cancellation request instead.'));
    await open(makeOrder({ status: 'placed' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Cancel Order' }));
    await fireEvent.press((await screen.findAllByRole('button', { name: 'Cancel Order' })).at(-1)!);
    await waitFor(() => expect(useToast.getState().message).toMatch(/already started/));
    expect(useToast.getState().tone).toBe('error');
    expect(useShop.getState().orders[0]!.status).toBe('placed');
  });

  it('once the store has confirmed it, the customer can only send a request', async () => {
    await open(makeOrder({ status: 'confirmed' }));
    expect(screen.getByRole('button', { name: 'Request cancellation' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Cancel Order' })).toBeNull();
  });

  it('an order already paid online is a request as well (it needs a refund)', async () => {
    const paid = makeOrder({ status: 'placed' });
    await open({ ...paid, payment: { ...paid.payment, method: 'upi', status: 'paid' } });
    expect(screen.getByRole('button', { name: 'Request cancellation' })).toBeTruthy();
  });

  it('a delivered order offers Order Again and no cancel', async () => {
    await open(makeOrder({ status: 'delivered' }));
    expect(screen.getByRole('button', { name: 'Order Again' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /cancel/i })).toBeNull();
  });
});

describe('OrderTrackingScreen: what the customer sees', () => {
  it('shows the delivery time, the address and an honest note instead of a fake map', async () => {
    await open(makeOrder({ status: 'preparing' }));
    expect(screen.getByText('Delivery: In 30 – 45 mins')).toBeTruthy();
    expect(screen.getByText(/12 Main Road, Anna Nagar, Chennai - 600040/)).toBeTruthy();
    expect(screen.getByText(/No fake location is ever shown/)).toBeTruthy();
  });

  it('a cancelled order says so and hides the progress timeline', async () => {
    await open(makeOrder({ status: 'cancelled' }));
    expect(screen.getByText('Order Cancelled')).toBeTruthy();
    expect(screen.queryByText('Out for Delivery')).toBeNull();
  });

  it('an order that does not exist says so instead of crashing', async () => {
    useShop.setState({ orders: [] });
    await render(<OrderTrackingScreen {...propsFor('nope')} />);
    expect(screen.getByText('Order not found')).toBeTruthy();
  });
});
