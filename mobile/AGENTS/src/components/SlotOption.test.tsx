import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import type { DeliverySlot } from '../types';
import { SLOT_OPTION_HEIGHT, SlotOption } from './SlotOption';

const flat = (style: unknown): Record<string, unknown> => Object.assign({}, ...[style].flat(Infinity).filter(Boolean));

const express: DeliverySlot = { id: 'express', title: 'Express', window: '30 – 45 mins', fee: 40, kind: 'express' };
const lunch: DeliverySlot = { id: 'slot-1', title: 'Afternoon', window: '1:00 PM - 3:00 PM', fee: 30, kind: 'scheduled', start: '13:00', end: '15:00' };
const free: DeliverySlot = { ...lunch, id: 'slot-3', title: 'Evening', fee: 0 };

describe('SlotOption', () => {
  it('shows the name, the time text and the fee', async () => {
    await render(<SlotOption slot={lunch} selected={false} onPress={() => {}} />);
    expect(screen.getByText('Afternoon')).toBeTruthy();
    expect(screen.getByText('1:00 PM - 3:00 PM')).toBeTruthy();
    expect(screen.getByText('₹30')).toBeTruthy();
  });

  it('says Free when there is no fee', async () => {
    await render(<SlotOption slot={free} selected={false} onPress={() => {}} />);
    expect(screen.getByText('Free')).toBeTruthy();
  });

  it('is a radio button that reports whether it is selected', async () => {
    const { rerender } = await render(<SlotOption slot={express} selected={false} onPress={() => {}} />);
    expect(screen.getByRole('radio', { selected: false })).toBeTruthy();
    await rerender(<SlotOption slot={express} selected onPress={() => {}} />);
    expect(screen.getByRole('radio', { selected: true })).toBeTruthy();
  });

  it('calls onPress when chosen', async () => {
    const onPress = jest.fn();
    await render(<SlotOption slot={lunch} selected={false} onPress={onPress} />);
    await fireEvent.press(screen.getByRole('radio'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('a closed slot explains why, cannot be chosen, and keeps the same height', async () => {
    const onPress = jest.fn();
    await render(<SlotOption slot={lunch} selected={false} unavailableReason="Closed for today" onPress={onPress} />);
    expect(screen.getByText('Closed for today')).toBeTruthy();
    expect(screen.queryByText('1:00 PM - 3:00 PM')).toBeNull();
    const row = screen.getByRole('radio');
    expect(row.props.accessibilityState).toMatchObject({ disabled: true });
    expect(row.props['aria-disabled'] === true || row.props.accessibilityState.disabled === true).toBe(true);
    expect(flat(row.props.style).height).toBe(SLOT_OPTION_HEIGHT);
  });

  it('every slot row has the same height, whatever its text', async () => {
    await render(
      <>
        <SlotOption slot={express} selected onPress={() => {}} />
        <SlotOption slot={{ ...lunch, window: 'A much longer description of the delivery window that would wrap on a narrow phone' }} selected={false} onPress={() => {}} />
      </>,
    );
    for (const r of screen.getAllByRole('radio')) expect(flat(r.props.style).height).toBe(SLOT_OPTION_HEIGHT);
  });
});
