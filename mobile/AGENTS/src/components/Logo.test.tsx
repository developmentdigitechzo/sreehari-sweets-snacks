import { render, screen } from '@testing-library/react-native';
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { LOGO_COLOR_ASPECT, LOGO_COLOR_SIZE } from '../assets/images';
import { LOGO_CARD, LOGO_LABEL, Logo } from './BrandHeader';

jest.mock('@react-navigation/native', () => ({ useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn(), canGoBack: () => true }) }));

const flat = (style: unknown): Record<string, unknown> => Object.assign({}, ...[style].flat(Infinity).filter(Boolean));
const asset = (rel: string) => fs.readFileSync(path.join(__dirname, '../../assets', rel));
/** Width and height from a PNG file's header. */
const pngSize = (buf: Buffer) => ({ width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), colorType: buf[25] });

describe('the logo file', () => {
  const size = pngSize(asset('images/ui/logo-color.png'));

  it('is high resolution: at least 1000 px wide, so it is sharp on a 3x phone up to about 330 dp wide', () => {
    expect(size.width).toBeGreaterThanOrEqual(1000);
  });

  it('has exactly the size the app assumes, so it is never stretched or squashed', () => {
    expect(size.width).toBe(LOGO_COLOR_SIZE.width);
    expect(size.height).toBe(LOGO_COLOR_SIZE.height);
  });

  it('has a transparent background (PNG with an alpha channel)', () => {
    expect(size.colorType).toBe(6);
  });

  it('is a reasonable size to ship (under 350 KB)', () => {
    expect(asset('images/ui/logo-color.png').length).toBeLessThan(350 * 1024);
  });
});

describe('the app icons', () => {
  it('the app icon is 1024 square and opaque; the adaptive icon is 1024 square with transparency', () => {
    expect(pngSize(asset('icon.png'))).toMatchObject({ width: 1024, height: 1024, colorType: 2 });
    expect(pngSize(asset('android-icon-foreground.png'))).toMatchObject({ width: 1024, height: 1024, colorType: 6 });
  });
  it('the splash image and the themed icon keep their transparency', () => {
    expect(pngSize(asset('splash-icon.png')).colorType).toBe(6);
    expect(pngSize(asset('android-icon-monochrome.png')).colorType).toBe(6);
  });
});

describe('Logo component', () => {
  it('draws the logo at its true proportions at any width', async () => {
    for (const w of [92, 112, 128, 200]) {
      const { unmount } = await render(<Logo width={w} />);
      const s = flat(screen.getByLabelText(LOGO_LABEL).props.style);
      expect(s.width).toBe(w);
      expect(s.height as number).toBeCloseTo(w / LOGO_COLOR_ASPECT, 5);
      await unmount();
    }
  });

  it('on the red splash it sits on a white rounded card with the native splash proportions, with the logo inside at the same proportions', async () => {
    await render(<Logo width={280} onDark />);
    const card = flat(screen.getByTestId('logo-card').props.style);
    expect([card.width, card.backgroundColor]).toEqual([280, '#FFFFFF']);
    expect(card.height as number).toBeCloseTo(280 / LOGO_CARD.aspect, 5);
    expect(card.borderRadius as number).toBeCloseTo(280 * LOGO_CARD.radius, 5);
    // the logo inside is 80% of the card width and not distorted
    const inner = screen.getByTestId('logo-card').children[0] as unknown as { props: { style: unknown } };
    const is = flat(inner.props.style);
    expect(is.width).toBeCloseTo(280 * LOGO_CARD.fill, 5);
    expect((is.width as number) / (is.height as number)).toBeCloseTo(LOGO_COLOR_ASPECT, 5);
  });

  it('is named for screen readers', async () => {
    await render(<Logo onDark />);
    expect(screen.getByLabelText('Sree Hari Sweets, Infinite Quality')).toBeTruthy();
  });
});
