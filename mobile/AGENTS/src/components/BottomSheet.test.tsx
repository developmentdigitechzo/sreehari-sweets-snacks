import { render, screen } from '@testing-library/react-native';
import React from 'react';
import { Text } from 'react-native';
import { BottomSheet } from './BottomSheet';

let mockHeight = 800;
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({ __esModule: true, default: () => ({ width: 390, height: mockHeight, scale: 2, fontScale: 1 }) }));

const flat = (style: unknown): Record<string, unknown> => Object.assign({}, ...[style].flat(Infinity).filter(Boolean));

describe('BottomSheet', () => {
  it('shows its title and content when visible, and nothing when hidden', async () => {
    const { rerender } = await render(<BottomSheet visible={false} onClose={() => {}} title="Pack size"><Text>Body</Text></BottomSheet>);
    expect(screen.queryByText('Pack size')).toBeNull();
    await rerender(<BottomSheet visible onClose={() => {}} title="Pack size"><Text>Body</Text></BottomSheet>);
    expect(screen.getByText('Pack size')).toBeTruthy();
    expect(screen.getByText('Body')).toBeTruthy();
  });

  it('is at most 88% of the current window height', async () => {
    mockHeight = 800;
    await render(<BottomSheet visible onClose={() => {}}><Text>Body</Text></BottomSheet>);
    expect(flat(screen.getByTestId('bottom-sheet').props.style).maxHeight).toBe(800 * 0.88);
  });

  it('follows the window when it changes (rotation, split-screen), instead of a height read once at start-up', async () => {
    mockHeight = 800;
    const { rerender } = await render(<BottomSheet visible onClose={() => {}}><Text>Body</Text></BottomSheet>);
    mockHeight = 360; // landscape phone
    await rerender(<BottomSheet visible onClose={() => {}}><Text>Body</Text></BottomSheet>);
    expect(flat(screen.getByTestId('bottom-sheet').props.style).maxHeight).toBeCloseTo(360 * 0.88);
  });

  it('an explicit maxHeight still wins', async () => {
    await render(<BottomSheet visible onClose={() => {}} maxHeight={300}><Text>Body</Text></BottomSheet>);
    expect(flat(screen.getByTestId('bottom-sheet').props.style).maxHeight).toBe(300);
  });
});
