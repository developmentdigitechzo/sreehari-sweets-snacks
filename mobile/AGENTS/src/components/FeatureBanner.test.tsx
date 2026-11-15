import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { FEATURE_BANNER_HEIGHT, FeatureBanner } from './FeatureBanner';

// Testing Library 14: render and events are asynchronous, so every call is awaited.
describe('FeatureBanner', () => {
  const base = { title: 'Cakes', subtitle: 'Fresh Cakes for Every Celebration', image: 'cake-chocolate', icon: 'cafe-outline' as const, cta: 'Order cakes' };

  it('shows the title, subtitle and call to action', async () => {
    await render(<FeatureBanner {...base} onPress={() => {}} />);
    expect(screen.getByText('Cakes')).toBeTruthy();
    expect(screen.getByText('Fresh Cakes for Every Celebration')).toBeTruthy();
    expect(screen.getByText('Order cakes')).toBeTruthy();
  });

  it('is one accessible button named after its content', async () => {
    await render(<FeatureBanner {...base} onPress={() => {}} />);
    expect(screen.getByRole('button', { name: 'Cakes. Fresh Cakes for Every Celebration' })).toBeTruthy();
  });

  it('calls onPress when tapped', async () => {
    const onPress = jest.fn();
    await render(<FeatureBanner {...base} onPress={onPress} />);
    await fireEvent.press(screen.getByRole('button'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('every banner uses the same fixed height, so stacked banners line up', async () => {
    await render(
      <>
        <FeatureBanner {...base} onPress={() => {}} />
        <FeatureBanner {...base} title="Gift Boxes" tone="cream" onPress={() => {}} />
      </>,
    );
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(2);
    for (const b of buttons) expect(JSON.stringify(b.props.style)).toContain(`"height":${FEATURE_BANNER_HEIGHT}`);
  });
});
