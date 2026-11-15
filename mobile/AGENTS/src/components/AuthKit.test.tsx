import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { PhoneField } from './AuthKit';

describe('PhoneField', () => {
  it('shows the fixed +91 prefix next to a labelled phone input', async () => {
    await render(<PhoneField label="Mobile number" value="" onChangeText={() => {}} />);
    expect(screen.getByText('+91')).toBeTruthy();
    const input = screen.getByLabelText('Mobile number');
    expect(input.props.keyboardType).toBe('phone-pad');
    expect(input.props.maxLength).toBe(10);
  });

  it('passes typing through to onChangeText', async () => {
    const onChangeText = jest.fn();
    await render(<PhoneField label="Mobile number" value="" onChangeText={onChangeText} />);
    await fireEvent.changeText(screen.getByLabelText('Mobile number'), '98765');
    expect(onChangeText).toHaveBeenCalledWith('98765');
  });

  it('shows an error under the field, and a hint when there is no error', async () => {
    const { rerender } = await render(<PhoneField label="Mobile number" value="" onChangeText={() => {}} hint="We will text you a code" />);
    expect(screen.getByText('We will text you a code')).toBeTruthy();
    await rerender(<PhoneField label="Mobile number" value="" onChangeText={() => {}} hint="We will text you a code" error="Enter a valid 10-digit mobile number" />);
    expect(screen.getByText('Enter a valid 10-digit mobile number')).toBeTruthy();
    expect(screen.queryByText('We will text you a code')).toBeNull();
  });
});
