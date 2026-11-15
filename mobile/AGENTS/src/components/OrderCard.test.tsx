import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { makeOrder } from '../testing/fixtures';
import { MAX_THUMBS, OrderCard, THUMB } from './OrderCard';

const flat = (style: unknown): Record<string, unknown> => Object.assign({}, ...[style].flat(Infinity).filter(Boolean));

describe('OrderCard', () => {
  const handlers = () => ({ onOpen: jest.fn(), onReorder: jest.fn() });

  it('shows the number, item count, total and status', async () => {
    await render(<OrderCard order={makeOrder()} {...handlers()} />);
    expect(screen.getByText('Order #SH1001')).toBeTruthy();
    expect(screen.getByText(/2 items/)).toBeTruthy();
    expect(screen.getByText('₹706')).toBeTruthy();
    expect(screen.getByText('Placed')).toBeTruthy();
  });

  it('says "1 item", not "1 items"', async () => {
    await render(<OrderCard order={makeOrder({ itemCount: 1 })} {...handlers()} />);
    expect(screen.getByText(/· 1 item$/)).toBeTruthy();
  });

  it('shows at most four thumbnails and a "+N" tile of the same size for the rest', async () => {
    await render(<OrderCard order={makeOrder({ itemCount: 7 })} {...handlers()} />);
    expect(MAX_THUMBS).toBe(4);
    const more = screen.getByLabelText('and 3 more');
    expect(screen.getByText('+3')).toBeTruthy();
    const s = flat(more.props.style);
    expect([s.width, s.height]).toEqual([THUMB, THUMB]);
  });

  it('has no "+N" tile when everything fits', async () => {
    await render(<OrderCard order={makeOrder({ itemCount: 4 })} {...handlers()} />);
    expect(screen.queryByText(/^\+\d/)).toBeNull();
  });

  it('an order in progress shows its delivery time and a Track button', async () => {
    await render(<OrderCard order={makeOrder()} {...handlers()} />);
    expect(screen.getByText('In 30 – 45 mins')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Track order' })).toBeTruthy();
  });

  it('a delivered order has no delivery line and says "View details"', async () => {
    await render(<OrderCard order={makeOrder({ status: 'delivered' })} {...handlers()} />);
    expect(screen.queryByText('In 30 – 45 mins')).toBeNull();
    expect(screen.getByRole('button', { name: 'View details' })).toBeTruthy();
    expect(screen.getByText('Delivered')).toBeTruthy();
  });

  it('the two action buttons are the same size', async () => {
    await render(<OrderCard order={makeOrder()} {...handlers()} />);
    const a = flat(screen.getByRole('button', { name: 'Track order' }).props.style);
    const b = flat(screen.getByRole('button', { name: 'Reorder' }).props.style);
    expect(a.flex).toBe(1);
    expect(b.flex).toBe(1);
    expect(a.minHeight).toBe(b.minHeight);
  });

  it('opens the order from Track and from the card, and reorders from Reorder', async () => {
    const h = handlers();
    await render(<OrderCard order={makeOrder()} {...h} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Track order' }));
    expect(h.onOpen).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByRole('button', { name: 'Reorder' }));
    expect(h.onReorder).toHaveBeenCalledTimes(1);
    expect(h.onOpen).toHaveBeenCalledTimes(1);
  });
});
