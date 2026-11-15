import type { Banner, Category, Collection, Coupon, Product, ProductBadge, Variant } from '../types';

/* ---------------------------------------------------------------------------
 * DEMO CATALOGUE — sample data for the POC only.
 * Prices, packs, SKUs, ratings and images are NOT approved Shree Hari data.
 * -------------------------------------------------------------------------*/

export const COLLECTIONS: Collection[] = [
  { id: 'sweets', name: 'Sweets', subtitle: 'Traditional & Signature Sweets', imageKey: 'cat-sweets', tone: 'burgundy', categoryIds: ['milk-sweets', 'kaju-sweets', 'laddu', 'halwa-burfi', 'traditional-sweets'] },
  { id: 'cakes', name: 'Cakes', subtitle: 'Fresh Cakes for Every Celebration', imageKey: 'cake-chocolate', tone: 'burgundy', categoryIds: ['birthday-cakes', 'chocolate-cakes', 'black-forest', 'white-forest', 'red-velvet', 'butterscotch', 'fresh-cream', 'designer-cakes', 'occasion-cakes'] },
  { id: 'savouries', name: 'Savouries', subtitle: 'Crispy & Flavourful Savouries', imageKey: 'cat-savouries', tone: 'cream', categoryIds: ['mixtures', 'murukku'] },
  { id: 'snacks', name: 'Snacks', subtitle: 'Quick Bites & Tea-time Snacks', imageKey: 'cat-snacks', tone: 'cream', categoryIds: ['murukku', 'chips', 'mixtures'] },
  { id: 'combos', name: 'Combos', subtitle: 'Curated Combos for Every Occasion', imageKey: 'cat-combos', tone: 'burgundy', categoryIds: ['combo-packs'] },
  { id: 'gift-boxes', name: 'Gift Boxes', subtitle: 'Premium & Festive Gift Collections', imageKey: 'cat-gift', tone: 'burgundy', categoryIds: ['gift-box'] },
];

export const CATEGORIES: Category[] = [
  { id: 'milk-sweets', name: 'Milk Sweets', parentId: 'sweets', imageKey: 'milk-sweets' },
  { id: 'kaju-sweets', name: 'Kaju Sweets', parentId: 'sweets', imageKey: 'kaju-sweets' },
  { id: 'laddu', name: 'Laddu Varieties', parentId: 'sweets', imageKey: 'laddu' },
  { id: 'halwa-burfi', name: 'Halwa & Burfi', parentId: 'sweets', imageKey: 'halwa-burfi' },
  { id: 'traditional-sweets', name: 'Traditional Sweets', parentId: 'sweets', imageKey: 'traditional-sweets' },
  { id: 'birthday-cakes', name: 'Birthday Cakes', parentId: 'cakes', imageKey: 'cake-chocolate' },
  { id: 'chocolate-cakes', name: 'Chocolate Cakes', parentId: 'cakes', imageKey: 'cake-chocolate' },
  { id: 'black-forest', name: 'Black Forest Cakes', parentId: 'cakes', imageKey: 'cake-black-forest' },
  { id: 'white-forest', name: 'White Forest Cakes', parentId: 'cakes', imageKey: 'cake-white-forest' },
  { id: 'red-velvet', name: 'Red Velvet Cakes', parentId: 'cakes', imageKey: 'cake-red-velvet' },
  { id: 'butterscotch', name: 'Butterscotch Cakes', parentId: 'cakes', imageKey: 'cake-butterscotch' },
  { id: 'fresh-cream', name: 'Fresh Cream Cakes', parentId: 'cakes', imageKey: 'cake-white-forest' },
  { id: 'designer-cakes', name: 'Designer Cakes', parentId: 'cakes', imageKey: 'cake-red-velvet' },
  { id: 'occasion-cakes', name: 'Special Occasion Cakes', parentId: 'cakes', imageKey: 'cake-chocolate' },
  { id: 'mixtures', name: 'Mixtures & Namkeen', parentId: 'savouries', imageKey: 'mixture' },
  { id: 'murukku', name: 'Murukku & Snacks', parentId: 'snacks', imageKey: 'murukku' },
  { id: 'chips', name: 'Chips & Crisps', parentId: 'snacks', imageKey: 'chips' },
  { id: 'combo-packs', name: 'Combo Packs', parentId: 'combos', imageKey: 'combo-packs' },
  { id: 'gift-box', name: 'Gift Boxes', parentId: 'gift-boxes', imageKey: 'gift-boxes' },
];

const v = (
  productSlug: string,
  label: string,
  price: number,
  mrp: number,
  stock = 40,
  popular = false,
): Variant => ({
  id: `${productSlug}-${label.replace(/\s/g, '').toLowerCase()}`,
  sku: `SH-${productSlug.toUpperCase()}-${label.replace(/\s/g, '').toUpperCase()}`,
  label,
  price,
  mrp,
  stock,
  popular,
});

type P = {
  id: string;
  name: string;
  tagline: string;
  categoryId: string;
  imageKey: string;
  extraImages?: string[];
  variants: Variant[];
  badge?: ProductBadge;
  rating?: [number, string];
  description?: string;
  featured?: Product['featured'];
  tags?: string[];
  claims?: boolean; // food claims only where supplied in the approved designs
};

const HIGHLIGHTS = [
  { icon: 'leaf-outline', label: 'Pure Ghee' },
  { icon: 'flask-outline', label: 'No Preservatives' },
  { icon: 'leaf-outline', label: 'Freshly Made' },
  { icon: 'ribbon-outline', label: 'Traditional Recipe' },
];

const mk = (p: P): Product => ({
  id: p.id,
  name: p.name,
  tagline: p.tagline,
  description:
    p.description ??
    `${p.name} from Shree Hari Sweets & Snacks. Sample product description for the POC — final copy, ingredients and claims will be supplied and approved by the business.`,
  categoryId: p.categoryId,
  badge: p.badge,
  images: [p.imageKey, ...(p.extraImages ?? [])].map((key, i) => ({ id: `${p.id}-img${i}`, key })),
  variants: p.variants,
  tags: p.tags ?? [],
  demoRating: p.rating?.[0],
  demoRatingCount: p.rating?.[1],
  highlights: p.claims ? HIGHLIGHTS : [],
  featured: p.featured,
});

export const PRODUCTS: Product[] = [
  mk({
    id: 'mysore-pak',
    name: 'Mysore Pak',
    tagline: 'Traditional Ghee Mysore Pak',
    categoryId: 'milk-sweets',
    imageKey: 'mysore-pak',
    extraImages: ['mysore-pak-2', 'mysore-pak-gift-box', 'mysore-pak-4', 'mysore-pak-5'],
    badge: 'Bestseller',
    rating: [4.8, '1.2K'],
    description:
      'Our signature Mysore Pak, made with premium ghee, pure besan and a traditional recipe for that rich, melt-in-the-mouth taste.',
    variants: [v('mysore-pak', '250 g', 180, 200), v('mysore-pak', '500 g', 340, 380, 40, true), v('mysore-pak', '1 kg', 640, 740)],
    featured: { bestseller: true, festive: true },
    claims: true,
    tags: ['mysore pak', 'ghee', 'besan'],
  }),
  mk({
    id: 'ghee-mysore-pak',
    name: 'Ghee Mysore Pak',
    tagline: 'Rich & Premium with Pure Ghee',
    categoryId: 'milk-sweets',
    imageKey: 'ghee-mysore-pak',
    badge: 'Special Offer',
    rating: [4.9, '856'],
    variants: [v('ghee-mysore', '250 g', 185, 215), v('ghee-mysore', '500 g', 340, 400, 40, true), v('ghee-mysore', '1 kg', 650, 780)],
    featured: { festive: true },
    tags: ['mysore pak', 'ghee'],
  }),
  mk({
    id: 'chocolate-mysore-pak',
    name: 'Chocolate Mysore Pak',
    tagline: 'A Delicious Chocolate Twist',
    categoryId: 'milk-sweets',
    imageKey: 'chocolate-mysore-pak',
    badge: 'New Arrival',
    rating: [4.7, '428'],
    variants: [v('choco-mysore', '250 g', 220, 250), v('choco-mysore', '500 g', 420, 480, 0)],
    featured: { newArrival: true },
    tags: ['mysore pak', 'chocolate'],
  }),
  mk({
    id: 'mysore-pak-gift-box',
    name: 'Mysore Pak Gift Box',
    tagline: 'Perfect for Gifting & Occasions',
    categoryId: 'gift-box',
    imageKey: 'mysore-pak-gift-box',
    badge: 'Family Pack',
    rating: [4.9, '1.1K'],
    variants: [v('mysore-gift', '500 g', 350, 410), v('mysore-gift', '1 kg', 640, 750, 25, true)],
    featured: { festive: true },
    tags: ['mysore pak', 'gift'],
  }),
  mk({
    id: 'pista-mysore-pak',
    name: 'Pista Mysore Pak',
    tagline: 'Rich Taste with Real Pistachios',
    categoryId: 'milk-sweets',
    imageKey: 'pista-mysore-pak',
    rating: [4.8, '692'],
    variants: [v('pista-mysore', '250 g', 240, 280), v('pista-mysore', '500 g', 460, 540)],
    featured: { newArrival: true },
    tags: ['mysore pak', 'pistachio'],
  }),
  mk({
    id: 'elaneer-mysore-pak',
    name: 'Elaneer Mysore Pak',
    tagline: 'Unique Coconut Flavour',
    categoryId: 'milk-sweets',
    imageKey: 'elaneer-mysore-pak',
    rating: [4.7, '369'],
    variants: [v('elaneer-mysore', '250 g', 210, 240), v('elaneer-mysore', '500 g', 400, 460)],
    tags: ['mysore pak', 'coconut'],
  }),
  mk({
    id: 'motichoor-laddu',
    name: 'Motichoor Laddu',
    tagline: 'Premium Laddu with Pure Ghee',
    categoryId: 'laddu',
    imageKey: 'motichoor-laddu',
    badge: 'Bestseller',
    rating: [4.8, '980'],
    variants: [v('motichoor', '250 g', 160, 180), v('motichoor', '500 g', 320, 360, 40, true), v('motichoor', '1 kg', 620, 700)],
    featured: { bestseller: true, festive: true },
    tags: ['laddu', 'motichoor'],
  }),
  mk({
    id: 'mixture',
    name: 'Mixture',
    tagline: 'Crunchy & Spicy South Indian Mixture',
    categoryId: 'mixtures',
    imageKey: 'mixture',
    badge: 'Bestseller',
    rating: [4.6, '1.4K'],
    variants: [v('mixture', '250 g', 120, 140), v('mixture', '500 g', 230, 270, 40, true)],
    featured: { bestseller: true },
    tags: ['mixture', 'namkeen', 'savoury'],
  }),
  mk({
    id: 'kaju-katli',
    name: 'Kaju Katli',
    tagline: 'Silky Cashew Diamonds',
    categoryId: 'kaju-sweets',
    imageKey: 'kaju-sweets',
    rating: [4.8, '740'],
    variants: [v('kaju-katli', '250 g', 330, 370), v('kaju-katli', '500 g', 640, 720)],
    featured: { festive: true },
    tags: ['kaju', 'cashew'],
  }),
  mk({
    id: 'besan-laddu',
    name: 'Besan Laddu',
    tagline: 'Roasted Gram Flour Laddu',
    categoryId: 'laddu',
    imageKey: 'laddu',
    rating: [4.5, '320'],
    variants: [v('besan-laddu', '250 g', 150, 170), v('besan-laddu', '500 g', 290, 330)],
    featured: { newArrival: true },
    tags: ['laddu', 'besan'],
  }),
  mk({
    id: 'karachi-halwa',
    name: 'Karachi Halwa',
    tagline: 'Soft, Chewy Festive Halwa',
    categoryId: 'halwa-burfi',
    imageKey: 'halwa-burfi',
    rating: [4.6, '256'],
    variants: [v('karachi-halwa', '250 g', 190, 220), v('karachi-halwa', '500 g', 360, 420)],
    tags: ['halwa'],
  }),
  mk({
    id: 'rasgulla',
    name: 'Rasgulla',
    tagline: 'Soft Syrupy Milk Sweet',
    categoryId: 'traditional-sweets',
    imageKey: 'traditional-sweets',
    rating: [4.5, '288'],
    variants: [v('rasgulla', '500 g', 220, 250), v('rasgulla', '1 kg', 420, 480)],
    tags: ['rasgulla', 'milk'],
  }),
  mk({
    id: 'butter-murukku',
    name: 'Butter Murukku',
    tagline: 'Crisp Spiral Tea-time Snack',
    categoryId: 'murukku',
    imageKey: 'murukku',
    rating: [4.7, '640'],
    variants: [v('murukku', '250 g', 110, 130), v('murukku', '500 g', 210, 250)],
    featured: { bestseller: true },
    tags: ['murukku', 'snack'],
  }),
  mk({
    id: 'banana-chips',
    name: 'Banana Chips',
    tagline: 'Thin & Crunchy Chips',
    categoryId: 'chips',
    imageKey: 'chips',
    rating: [4.4, '410'],
    variants: [v('banana-chips', '250 g', 100, 120), v('banana-chips', '500 g', 190, 230)],
    tags: ['chips', 'banana'],
  }),
  mk({
    id: 'festive-combo',
    name: 'Festive Sweets Combo',
    tagline: 'A Curated Box of Favourites',
    categoryId: 'combo-packs',
    imageKey: 'combo-packs',
    badge: 'Family Pack',
    rating: [4.8, '212'],
    variants: [v('festive-combo', '500 g', 520, 600), v('festive-combo', '1 kg', 980, 1150, 20, true)],
    featured: { festive: true, newArrival: true },
    tags: ['combo', 'festive'],
  }),
  mk({
    id: 'premium-gift-box',
    name: 'Premium Gift Box',
    tagline: 'Assorted Sweets in a Luxe Box',
    categoryId: 'gift-box',
    imageKey: 'gift-boxes',
    badge: 'Special Offer',
    rating: [4.9, '305'],
    variants: [v('premium-gift', '1 kg', 1100, 1300), v('premium-gift', '2 kg', 2050, 2450, 15)],
    featured: { festive: true },
    tags: ['gift', 'premium'],
  }),
];


/* ---------------------------------------------------------------------------
 * DEMO CAKES. Prices, sizes and availability are placeholders. Customisation, flavours, message-on-cake
 * and delivery lead times are "business to confirm" and are flagged on each product.
 * Photos are AI-generated demo images; several cakes share one photo until real photography is supplied.
 * -------------------------------------------------------------------------*/
const CAKE_NOTICE = 'Demo information: cakes may need advance notice and same-day delivery is not guaranteed. Final lead times are confirmed by the store.';

const cake = (
  id: string, name: string, tagline: string, categoryId: string, imageKey: string,
  base: number, extra: Partial<P> & { flavours?: string[]; message?: boolean; soldOut2kg?: boolean } = {},
): Product =>
  mk({
    id, name, tagline, categoryId, imageKey,
    badge: extra.badge,
    rating: extra.rating,
    featured: extra.featured,
    tags: ['cake', ...(extra.tags ?? [])],
    description: `${name}: a demo cake listing. Flavours, sizes, decoration and delivery lead time shown here are placeholders until the store confirms them.`,
    variants: [
      v(id, '500 g', base, Math.round(base * 1.1 / 10) * 10),
      v(id, '1 kg', base * 2 - 50, Math.round((base * 2 - 50) * 1.1 / 10) * 10, 12, true),
      v(id, '2 kg', base * 4 - 200, Math.round((base * 4 - 200) * 1.1 / 10) * 10, extra.soldOut2kg ? 0 : 6),
    ],
  });

const CAKES: Product[] = [
  { ...cake('chocolate-truffle-cake', 'Chocolate Truffle Cake', 'Rich ganache-covered chocolate cake', 'chocolate-cakes', 'cake-chocolate', 450, { badge: 'Bestseller', rating: [4.8, '640'], featured: { bestseller: true, festive: true }, tags: ['chocolate'] }), cake: { flavours: ['Chocolate', 'Mocha'], allowsMessage: true, messageMaxLength: 30, notice: CAKE_NOTICE } },
  { ...cake('birthday-chocolate-cake', 'Birthday Special Chocolate Cake', 'A classic celebration cake', 'birthday-cakes', 'cake-chocolate', 480, { rating: [4.7, '312'], featured: { newArrival: true }, tags: ['birthday', 'chocolate'] }), cake: { allowsMessage: true, messageMaxLength: 30, notice: CAKE_NOTICE } },
  { ...cake('black-forest-cake', 'Black Forest Cake', 'Cream, cherries and dark chocolate shavings', 'black-forest', 'cake-black-forest', 420, { badge: 'Bestseller', rating: [4.8, '908'], featured: { bestseller: true }, tags: ['black forest', 'cherry'] }), cake: { allowsMessage: true, messageMaxLength: 30, notice: CAKE_NOTICE } },
  { ...cake('white-forest-cake', 'White Forest Cake', 'White chocolate curls with fresh cream', 'white-forest', 'cake-white-forest', 440, { rating: [4.6, '254'], featured: { newArrival: true }, tags: ['white forest'] }), cake: { allowsMessage: true, messageMaxLength: 30, notice: CAKE_NOTICE } },
  { ...cake('red-velvet-cake', 'Red Velvet Cake', 'Velvety layers with cream cheese frosting', 'red-velvet', 'cake-red-velvet', 520, { badge: 'New Arrival', rating: [4.9, '421'], featured: { newArrival: true, festive: true }, soldOut2kg: true, tags: ['red velvet'] }), cake: { allowsMessage: true, messageMaxLength: 30, notice: CAKE_NOTICE } },
  { ...cake('butterscotch-crunch-cake', 'Butterscotch Crunch Cake', 'Caramel drizzle with praline crunch', 'butterscotch', 'cake-butterscotch', 430, { rating: [4.7, '377'], tags: ['butterscotch', 'caramel'] }), cake: { allowsMessage: true, messageMaxLength: 30, notice: CAKE_NOTICE } },
  { ...cake('fresh-berry-cream-cake', 'Fresh Berry Cream Cake', 'Whipped cream topped with fresh berries', 'fresh-cream', 'cake-white-forest', 460, { badge: 'Special Offer', rating: [4.6, '198'], tags: ['fresh cream', 'berry', 'fruit'] }), cake: { flavours: ['Vanilla', 'Strawberry'], allowsMessage: true, messageMaxLength: 30, notice: CAKE_NOTICE } },
  { ...cake('signature-designer-cake', 'Signature Designer Cake', 'Custom decoration, confirmed with the store', 'designer-cakes', 'cake-red-velvet', 650, { rating: [4.8, '96'], tags: ['designer'] }), cake: { allowsMessage: true, messageMaxLength: 40, notice: CAKE_NOTICE + ' Designer cakes need advance notice.' } },
  { ...cake('occasion-celebration-cake', 'Special Occasion Cake', 'For anniversaries and family celebrations', 'occasion-cakes', 'cake-chocolate', 560, { rating: [4.7, '143'], tags: ['anniversary', 'occasion'] }), cake: { allowsMessage: true, messageMaxLength: 40, notice: CAKE_NOTICE } },
];
PRODUCTS.push(...CAKES);

export const BANNERS: Banner[] = [
  { id: 'b1', eyebrow: 'FESTIVE SPECIAL', title: 'Traditional Sweets', accent: 'Collection', cta: 'Order Now', imageKey: 'festive-hero', target: { type: 'collection', id: 'sweets' } },
  { id: 'b5', eyebrow: 'CELEBRATE', title: 'Fresh Cakes', accent: 'For Every Occasion', cta: 'Shop Cakes', imageKey: 'cake-black-forest', target: { type: 'collection', id: 'cakes' } },
  { id: 'b2', eyebrow: 'GIFTING', title: 'Gift Happiness', accent: 'Premium Boxes', cta: 'Explore', imageKey: 'cat-gift', target: { type: 'collection', id: 'gift-boxes' } },
  { id: 'b3', eyebrow: 'TEA-TIME', title: 'Crunchy Savouries', accent: 'Fresh Batch', cta: 'Shop Now', imageKey: 'cat-savouries', target: { type: 'collection', id: 'savouries' } },
  { id: 'b4', eyebrow: 'OFFERS', title: 'Festive Offers', accent: 'Save on Sweets', cta: 'View Offers', imageKey: 'offer-hero', target: { type: 'offers' } },
];

const nextYear = new Date(Date.now() + 90 * 86400000).toISOString();

export const COUPONS: Coupon[] = [
  { code: 'SHREE10', title: 'Flat 10% OFF', description: 'Flat 10% OFF on orders above ₹499', type: 'percent', value: 10, minOrder: 499, maxDiscount: 100, expiresAt: nextYear },
  { code: 'FESTIVE15', title: 'Flat 15% OFF', description: 'Flat 15% OFF on orders above ₹999', type: 'percent', value: 15, minOrder: 999, maxDiscount: 250, expiresAt: nextYear },
  { code: 'FREESHIP', title: 'Free Delivery', description: 'Free Delivery on orders above ₹1,499', type: 'freeship', value: 0, minOrder: 1499, expiresAt: nextYear },
  { code: 'DIWALI20', title: 'Flat 20% OFF', description: 'Festival offer (ended)', type: 'percent', value: 20, minOrder: 799, maxDiscount: 300, expiresAt: '2025-11-30T00:00:00.000Z' },
];

export const CATEGORY_BY_ID = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]));
