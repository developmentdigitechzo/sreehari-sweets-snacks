import { render, screen } from '@testing-library/react-native';
import React from 'react';
import { CategoriesScreen } from './CategoriesScreen';
import { CATEGORIES, COLLECTIONS } from '../data/seed';
import { FEATURE_BANNER_HEIGHT } from '../components/FeatureBanner';
import { useCatalog } from '../store/useCatalog';

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate, goBack: jest.fn(), canGoBack: () => true }),
  useFocusEffect: () => {},
}));

// The screen reads the window width through useWindowDimensions; each test sets the width it wants.
let mockWidth = 390;
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({ __esModule: true, default: () => ({ width: mockWidth, height: 800, scale: 2, fontScale: 1 }) }));
const withWidth = (width: number) => { mockWidth = width; };

const flat = (style: unknown): Record<string, unknown> => Object.assign({}, ...[style].flat(Infinity).filter(Boolean));
/** The width of the box that holds a category tile (the animated wrapper around the pressable). */
const tileBoxWidth = (name: string) => flat(screen.getByLabelText(name).parent?.props.style).width;

beforeEach(() => {
  mockNavigate.mockReset();
  useCatalog.setState({ status: 'ready', collections: COLLECTIONS, categories: CATEGORIES, error: undefined });
});

describe('CategoriesScreen layout', () => {
  it('shows Cakes, Gift Boxes and Build your own combo as three banners of the same height', async () => {
    withWidth(390);
    await render(<CategoriesScreen />);
    const banners = ['Cakes. Fresh Cakes for Every Celebration', 'Gift Boxes. Premium & Festive Gift Collections', 'Build your own combo. Pick your favourites'].map((n) => screen.getByRole('button', { name: n }));
    for (const b of banners) expect(flat(b.props.style).height).toBe(FEATURE_BANNER_HEIGHT);
  });

  it('shows every subcategory as a tile', async () => {
    withWidth(390);
    await render(<CategoriesScreen />);
    for (const c of CATEGORIES.filter((x) => x.parentId)) expect(screen.getByLabelText(c.name)).toBeTruthy();
  });

  it('uses four tile columns on a phone and five on a wide screen, filling the line exactly', async () => {
    // content width = screen width (capped at 560) - 2 x 16 page padding; gaps are 10
    withWidth(360);
    const { unmount } = await render(<CategoriesScreen />);
    const four = Math.floor((360 - 32 - 10 * 3) / 4);
    expect(tileBoxWidth('Milk Sweets')).toBe(four);
    expect(four * 4 + 10 * 3).toBeLessThanOrEqual(360 - 32);
    await unmount();

    withWidth(600);
    await render(<CategoriesScreen />);
    const five = Math.floor((560 - 32 - 10 * 4) / 5);
    expect(tileBoxWidth('Milk Sweets')).toBe(five);
  });
});

describe('CategoriesScreen behaviour', () => {
  it('opens the collection when a banner is tapped, and the Combos list from the combo banner', async () => {
    withWidth(390);
    await render(<CategoriesScreen />);
    const { fireEvent } = jest.requireActual('@testing-library/react-native');
    await fireEvent.press(screen.getByRole('button', { name: 'Cakes. Fresh Cakes for Every Celebration' }));
    expect(mockNavigate).toHaveBeenCalledWith('Listing', { collectionId: 'cakes', title: 'Cakes' });
    await fireEvent.press(screen.getByRole('button', { name: 'Build your own combo. Pick your favourites' }));
    expect(mockNavigate).toHaveBeenCalledWith('Listing', { collectionId: 'combos', title: 'Combos' });
  });

  it('opens a single category from its tile', async () => {
    withWidth(390);
    await render(<CategoriesScreen />);
    const { fireEvent } = jest.requireActual('@testing-library/react-native');
    await fireEvent.press(screen.getByLabelText('Milk Sweets'));
    expect(mockNavigate).toHaveBeenCalledWith('Listing', { categoryId: 'milk-sweets', title: 'Milk Sweets' });
  });

  it('shows a retry state instead of an empty page when the catalogue failed to load', async () => {
    useCatalog.setState({ status: 'error', error: 'Cannot reach the server' });
    withWidth(390);
    await render(<CategoriesScreen />);
    expect(screen.getByText('Cannot reach the server')).toBeTruthy();
  });
});
