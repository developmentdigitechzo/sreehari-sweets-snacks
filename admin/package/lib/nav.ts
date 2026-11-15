import { BarChart3, Bell, Boxes, Gift, Image as ImageIcon, LayoutDashboard, Package, RotateCcw, Settings, ShoppingCart, Target, Truck, Users, Wallet, type LucideIcon } from 'lucide-react';

export type NavItem = { label: string; href: string; icon: LucideIcon; perm: string; children?: { label: string; href: string; perm?: string }[] };

/** Mirrors the reference screens. `perm` hides items the signed-in role cannot use; the API enforces it regardless. */
export const NAV: NavItem[] = [
  { label: 'Dashboard', href: '/', icon: LayoutDashboard, perm: 'dashboard' },
  {
    label: 'Products', href: '/products', icon: Package, perm: 'catalog',
    children: [
      { label: 'All Products', href: '/products' },
      { label: 'Add Product', href: '/products/new' },
      { label: 'Categories', href: '/products/categories' },
      { label: 'Import CSV', href: '/products/import' },
      { label: 'Cakes', href: '/products/cakes' },
    ],
  },
  { label: 'Inventory', href: '/inventory', icon: Boxes, perm: 'inventory', children: [{ label: 'Stock Levels', href: '/inventory' }, { label: 'Stock Movements', href: '/inventory/movements' }] },
  {
    label: 'Orders', href: '/orders', icon: ShoppingCart, perm: 'orders',
    children: [{ label: 'All Orders', href: '/orders' }, { label: 'Returns & Refunds', href: '/returns', perm: 'returns' }],
  },
  { label: 'Banners & Campaigns', href: '/banners', icon: ImageIcon, perm: 'banners', children: [{ label: 'App Banners', href: '/banners' }, { label: 'Campaigns', href: '/banners/campaigns', perm: 'offers' }, { label: 'Offer Popups', href: '/banners/popups' }, { label: 'Promotional Sections', href: '/banners/sections' }] },
  { label: 'Notifications', href: '/notifications', icon: Bell, perm: 'broadcast', children: [{ label: 'Create Notification', href: '/notifications' }, { label: 'Notification History', href: '/notifications/history' }, { label: 'Templates', href: '/notifications/templates' }] },
  { label: 'Customers', href: '/customers', icon: Users, perm: 'customers' },
  { label: 'Customer Segmentation', href: '/segments', icon: Target, perm: 'customers' },
  { label: 'Offers & Rewards', href: '/offers', icon: Gift, perm: 'offers', children: [{ label: 'Coupons', href: '/offers' }, { label: 'Rewards', href: '/offers/rewards' }] },
  { label: 'Payments', href: '/payments', icon: Wallet, perm: 'payments' },
  { label: 'Delivery', href: '/delivery', icon: Truck, perm: 'delivery' },
  { label: 'Reports & Analytics', href: '/reports', icon: BarChart3, perm: 'reports' },
  { label: 'Settings', href: '/settings', icon: Settings, perm: 'settings', children: [{ label: 'Business', href: '/settings' }, { label: 'Admin Users', href: '/settings/staff', perm: 'admins' }, { label: 'Audit Log', href: '/settings/audit', perm: 'audit' }] },
];

export const RETURNS_ICON = RotateCcw;
