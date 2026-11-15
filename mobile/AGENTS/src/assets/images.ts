import { ImageSourcePropType } from 'react-native';
import { API_URL } from '../config/api';
import { rewriteLocalUploadUrl } from '../utils/imageUri';
import type { ImageRef } from '../types';

/**
 * DEMO IMAGES — cropped from the approved design mockups supplied by the client.
 * Replace with approved product photography served from object storage/CDN.
 */
export const IMAGES: Record<string, ImageSourcePropType> = {
  'mysore-pak': require('../../assets/images/products/mysore-pak.jpg'),
  'mysore-pak-2': require('../../assets/images/products/mysore-pak-2.jpg'),
  'mysore-pak-3': require('../../assets/images/products/mysore-pak-3.jpg'),
  'mysore-pak-4': require('../../assets/images/products/mysore-pak-4.jpg'),
  'mysore-pak-5': require('../../assets/images/products/mysore-pak-5.jpg'),
  'ghee-mysore-pak': require('../../assets/images/products/ghee-mysore-pak.jpg'),
  'chocolate-mysore-pak': require('../../assets/images/products/chocolate-mysore-pak.jpg'),
  'mysore-pak-gift-box': require('../../assets/images/products/mysore-pak-gift-box.jpg'),
  'pista-mysore-pak': require('../../assets/images/products/pista-mysore-pak.jpg'),
  'elaneer-mysore-pak': require('../../assets/images/products/elaneer-mysore-pak.jpg'),
  'motichoor-laddu': require('../../assets/images/products/motichoor-laddu.jpg'),
  mixture: require('../../assets/images/products/mixture.jpg'),
  'kaju-sweets': require('../../assets/images/products/kaju-sweets.jpg'),
  laddu: require('../../assets/images/products/laddu.jpg'),
  'halwa-burfi': require('../../assets/images/products/halwa-burfi.jpg'),
  'traditional-sweets': require('../../assets/images/products/traditional-sweets.jpg'),
  'milk-sweets': require('../../assets/images/products/milk-sweets.jpg'),
  murukku: require('../../assets/images/products/murukku.jpg'),
  chips: require('../../assets/images/products/chips.jpg'),
  'combo-packs': require('../../assets/images/products/combo-packs.jpg'),
  'gift-boxes': require('../../assets/images/products/gift-boxes.jpg'),
  'cake-chocolate': require('../../assets/images/products/cake-chocolate.jpg'),
  'cake-black-forest': require('../../assets/images/products/cake-black-forest.jpg'),
  'cake-white-forest': require('../../assets/images/products/cake-white-forest.jpg'),
  'cake-red-velvet': require('../../assets/images/products/cake-red-velvet.jpg'),
  'cake-butterscotch': require('../../assets/images/products/cake-butterscotch.jpg'),
  'festive-hero': require('../../assets/images/ui/festive-hero.jpg'),
  'offer-hero': require('../../assets/images/ui/offer-hero.jpg'),
  'cat-sweets': require('../../assets/images/ui/cat-sweets.jpg'),
  'cat-savouries': require('../../assets/images/ui/cat-savouries.jpg'),
  'cat-snacks': require('../../assets/images/ui/cat-snacks.jpg'),
  'cat-combos': require('../../assets/images/ui/cat-combos.jpg'),
  'cat-gift': require('../../assets/images/ui/cat-gift.jpg'),
  'build-combo': require('../../assets/images/ui/build-combo.jpg'),
  'avatar-user': require('../../assets/images/ui/avatar-user.jpg'),
  'avatar-rider': require('../../assets/images/ui/avatar-rider.jpg'),
  scooter: require('../../assets/images/ui/scooter.jpg'),
};

export const LOGO = require('../../assets/images/ui/logo.png');
export const LOGO_ASPECT = 245 / 112;
/**
 * Full-colour brand logo (red lotus, blue wordmark "Sree Hari Sweets - Infinite Quality") with a transparent background.
 * 1000 x 487 px true-colour PNG, so it stays sharp up to about 330 dp wide on a 3x screen (the largest use is 224 dp). If this file is replaced, update the two numbers below
 * (the test in components/Logo.test.tsx fails when they no longer match the file, which is what would stretch the logo).
 */
export const LOGO_COLOR = require('../../assets/images/ui/logo-color.png');
export const LOGO_COLOR_SIZE = { width: 1000, height: 487 } as const;
export const LOGO_COLOR_ASPECT = LOGO_COLOR_SIZE.width / LOGO_COLOR_SIZE.height;

export function resolveImage(ref?: ImageRef | string): ImageSourcePropType | undefined {
  if (!ref) return undefined;
  if (typeof ref === 'string') return IMAGES[ref];
  if (ref.uri) return { uri: rewriteLocalUploadUrl(ref.uri, API_URL) };
  if (ref.key) return IMAGES[ref.key];
  return undefined;
}
