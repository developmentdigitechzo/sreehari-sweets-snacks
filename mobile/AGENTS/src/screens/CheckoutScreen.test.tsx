import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { CheckoutScreen } from './CheckoutScreen';
import { SLOT_OPTION_HEIGHT } from '../components/SlotOption';
import { useShop } from '../store/useShop';

// "Now" for the screen. India time = UTC + 5:30, so 17:00 IST is 11:30 UTC.
let mockNow = new Date('2026-11-10T05:00:00Z'); // 10:30 IST
jest.mock('../hooks/useNow', () => ({ useNow: () => mockNow }));
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn(), canGoBack: () => true }),
  useFocusEffect: () => {},
}));

const flat = (style: unknown): Record<string, unknown> => Object.assign({}, ...[style].flat(Infinity).filter(Boolean));
const home = { id: 'addr-home', label: 'Home' as const, name: 'Ramesh', phone: '+919876543210', line1: '12 Main Road', area: 'Anna Nagar', city: 'Chennai', state: 'Tamil Nadu', pincode: '600040', isDefault: true };

beforeEach(() => {
  mockNow = new Date('2026-11-10T05:00:00Z'); // 10:30 IST
  useShop.setState({
    cart: [{ productId: 'mysore-pak', variantId: 'mysore-pak-250g', qty: 1 }],
    addresses: [home], selectedAddressId: 'addr-home', slotId: 'express', deliveryDate: null, couponCode: null, redeemPoints: false,
  });
});

describe('CheckoutScreen: delivery day and slot', () => {
  it('offers today and the next two days, and three slots stacked as equal rows', async () => {
    await render(<CheckoutScreen />);
    expect(screen.getByText('Choose Delivery Day & Slot')).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Deliver Today' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Deliver Tomorrow' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Deliver Thu 12 Nov' })).toBeTruthy();
    const rows = screen.getAllByRole('radio', { name: /₹/ }); // slot rows carry their fee in the name
    expect(rows).toHaveLength(3);
    for (const r of rows) expect(flat(r.props.style).height).toBe(SLOT_OPTION_HEIGHT);
  });

  it('selects Express by default and shows its fee', async () => {
    await render(<CheckoutScreen />);
    expect(screen.getByRole('radio', { name: /Express/, selected: true })).toBeTruthy();
  });

  it('late in the day the closed slots say so, and express stays available', async () => {
    mockNow = new Date('2026-11-10T11:30:00Z'); // 17:00 IST: both timed slots have started
    await render(<CheckoutScreen />);
    const closed = screen.getAllByText('Closed for today');
    expect(closed).toHaveLength(2);
    expect(screen.getByRole('radio', { name: /Express/ }).props.accessibilityState.disabled).toBeFalsy();
  });

  it('choosing tomorrow reopens the timed slots, closes express, and moves the choice to a slot that works', async () => {
    mockNow = new Date('2026-11-10T11:30:00Z');
    await render(<CheckoutScreen />);
    await fireEvent.press(screen.getByRole('radio', { name: 'Deliver Tomorrow' }));
    expect(useShop.getState().deliveryDate).toBe('2026-11-11');
    expect(screen.queryByText('Closed for today')).toBeNull();
    expect(screen.getByText('Today only')).toBeTruthy(); // express
    expect(screen.getByRole('radio', { name: /Afternoon/, selected: true })).toBeTruthy();
  });

  it('a slot that is closed cannot be chosen', async () => {
    mockNow = new Date('2026-11-10T11:30:00Z');
    await render(<CheckoutScreen />);
    await fireEvent.press(screen.getByRole('radio', { name: /Afternoon/ }));
    expect(useShop.getState().slotId).toBe('express');
  });

  it('shows the chosen date to the customer again after a stale date is saved (a past day becomes today)', async () => {
    useShop.setState({ deliveryDate: '2026-11-01' });
    await render(<CheckoutScreen />);
    expect(screen.getByRole('radio', { name: 'Deliver Today', selected: true })).toBeTruthy();
  });
});

describe('CheckoutScreen: room for the pinned bar', () => {
  it('leaves exactly as much room at the end of the content as the bar is tall, so the last item is never hidden', async () => {
    await render(<CheckoutScreen />);
    const scroll = screen.getByTestId('screen-scroll');
    const before = flat(scroll.props.contentContainerStyle).paddingBottom as number;
    await fireEvent(screen.getByTestId('sticky-bar'), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 210 } } });
    const after = flat(screen.getByTestId('screen-scroll').props.contentContainerStyle).paddingBottom as number;
    expect(after).toBe(210 + 16);
    expect(after).not.toBe(before);
  });
});
