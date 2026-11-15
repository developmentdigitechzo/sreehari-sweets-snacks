export const rupee = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

export const percentOff = (mrp: number, price: number) =>
  mrp > price ? Math.round(((mrp - price) / mrp) * 100) : 0;

export function formatDateTime(iso: string) {
  const d = new Date(iso);
  const day = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return `${day}, ${time}`;
}

export const uid = (prefix = 'id') =>
  `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
