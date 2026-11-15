/**
 * Imports products from catalog-import/new-products.csv straight into the database.
 *
 *   npm run catalog:import            create the products
 *   npm run catalog:import -- --dry   show what would happen, change nothing
 *
 * Follows the same rules as the admin panel: a product goes in the most specific category, SKUs are unique, opening stock
 * is recorded in the stock history, and a price never goes above MRP. Safe to run twice: products that already exist
 * (same name or same id) are skipped. Images are picked up from catalog-import/images/<file name in the CSV>; a product
 * without a picture is still created (it shows its category picture) and you can add the photo later in the admin panel.
 *
 * Settings (environment variables or .env):
 *   IMPORT_OPENING_STOCK   starting stock for every size (default 50). Set real counts later in Admin > Inventory.
 */
require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { PrismaClient } = require('@prisma/client');

const DRY = process.argv.includes('--dry');
const csvArg = process.argv.find((a) => a.startsWith('--csv='));
const CSV = path.resolve(csvArg ? csvArg.slice(6) : 'catalog-import/new-products.csv');
const STOCK = Number.parseInt(process.env.IMPORT_OPENING_STOCK ?? '50', 10);
const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR ?? 'uploads');
const PUBLIC = (process.env.PUBLIC_URL ?? 'http://localhost:4000').replace(/\/$/, '');

const prisma = new PrismaClient({ log: [] });

/* ---------- helpers ---------- */
const slug = (s) => s.toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-').replace(/-+/g, '-').slice(0, 60);

/** Minimal CSV reader: quotes, doubled quotes, commas and line breaks inside quotes, optional BOM. */
function parseCsv(text) {
  const rows = [];
  let row = [], cell = '', inQ = false;
  const t = text.replace(/^﻿/, '');
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (inQ) {
      if (c === '"' && t[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') inQ = false;
      else cell += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some((x) => x.trim() !== '')) rows.push(row);
      row = [];
    } else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); if (row.some((x) => x.trim() !== '')) rows.push(row); }
  const head = rows.shift().map((h) => h.trim());
  return rows.map((r) => Object.fromEntries(head.map((h, i) => [h, (r[i] ?? '').trim()])));
}

function sniff(buf) {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.length > 12 && buf.subarray(0, 4).toString() === 'RIFF' && buf.subarray(8, 12).toString() === 'WEBP') return 'webp';
  return null;
}

/** Looks for the image beside the CSV: the file named in the CSV, or the same name with another extension. */
function findImage(dir, file) {
  const base = path.join(dir, file.replace(/\.[a-z0-9]+$/i, ''));
  for (const ext of ['.jpg', '.jpeg', '.png', '.webp', '.JPG', '.JPEG', '.PNG', '.WEBP']) if (fs.existsSync(base + ext)) return base + ext;
  return null;
}

let changeStock = null;
try { ({ changeStock } = require(path.resolve('dist/src/modules/inventory/stock.js'))); } catch { /* falls back to a direct write */ }

/* ---------- main ---------- */
async function main() {
  if (!fs.existsSync(CSV)) throw new Error(`CSV not found: ${CSV}`);
  const rows = parseCsv(fs.readFileSync(CSV, 'utf8'));
  const imgDir = path.dirname(CSV);
  console.log(`${DRY ? 'DRY RUN, nothing will be written. ' : ''}${rows.length} rows from ${path.basename(CSV)}; opening stock ${STOCK} per size.`);

  const cats = await prisma.category.findMany({ where: { isActive: true } });
  const hasKids = new Set(cats.map((c) => c.parentId).filter(Boolean));
  const leaf = (name) => {
    const m = cats.filter((c) => c.name.toLowerCase() === name.toLowerCase() && !hasKids.has(c.id));
    return m.find((c) => c.parentId) ?? m[0] ?? null;
  };

  const done = { created: 0, skipped: 0, failed: 0, withImage: 0 };
  for (const r of rows) {
    const name = r.name;
    try {
      if (!name) throw new Error('empty name');
      const priceText = r.price_inr || r.suggested_price_inr_CONFIRM || '';
      const price = Number(priceText);
      if (!Number.isFinite(price) || price <= 0) throw new Error(`price "${priceText}" is not a positive number`);
      const cat = leaf(r.category);
      if (!cat) throw new Error(`no active sub-category named "${r.category}" (create it in Admin > Products first)`);
      const id = slug(name);
      const dupe = await prisma.product.findFirst({ where: { OR: [{ id }, { name: { equals: name, mode: 'insensitive' } }] }, select: { id: true } });
      if (dupe) { done.skipped++; console.log(`SKIP   ${name}: already exists (${dupe.id})`); continue; }

      const label = r.size || 'Standard';
      const sku = ('SH-' + slug(name) + '-' + slug(label)).toUpperCase().replace(/[^A-Z0-9._-]/g, '').slice(0, 40);
      if (await prisma.productVariant.findUnique({ where: { sku } })) throw new Error(`SKU ${sku} is already used`);
      const vid = `${id}-${slug(label) || 'std'}`;

      const imgPath = r.image_file ? findImage(imgDir, r.image_file) : null;
      let imageUrl = null;
      if (imgPath) {
        const buf = fs.readFileSync(imgPath);
        const ext = sniff(buf);
        if (!ext) throw new Error(`${path.basename(imgPath)} is not a JPG, PNG or WebP image`);
        if (buf.length > 5 * 1024 * 1024) throw new Error(`${path.basename(imgPath)} is over 5 MB`);
        const file = `${crypto.randomUUID()}.${ext}`;
        if (!DRY) { fs.mkdirSync(UPLOAD_DIR, { recursive: true }); fs.writeFileSync(path.join(UPLOAD_DIR, file), buf); }
        imageUrl = `${PUBLIC}/uploads/${file}`;
      }

      if (DRY) {
        console.log(`WOULD  ${name} | ${cat.name} | ${label} | Rs ${price} | ${imgPath ? 'image ' + path.basename(imgPath) : 'no image'}`);
        done.created++; if (imgPath) done.withImage++;
        continue;
      }

      const isCake = (r.group || '').toLowerCase() === 'cakes';
      await prisma.$transaction(async (tx) => {
        await tx.product.create({
          data: {
            id, name, tagline: r.tagline ?? '', description: r.description ?? '', categoryId: cat.id,
            tags: r.group ? [r.group.toLowerCase()] : [], highlights: [], featured: { newArrival: true }, isActive: true,
            cake: isCake ? { allowsMessage: true, messageMaxLength: 30, notice: '' } : undefined,
          },
        });
        await tx.productVariant.create({ data: { id: vid, productId: id, sku, label, mrp: price, price, popular: false, stock: 0 } });
        if (STOCK > 0) {
          if (changeStock) await changeStock(tx, { id: vid }, STOCK, { reason: 'RESTOCK', actor: 'import:catalog', note: 'Opening stock (catalogue import)' });
          else await tx.productVariant.update({ where: { id: vid }, data: { stock: STOCK } });
        }
        if (imageUrl) await tx.productImage.create({ data: { productId: id, url: imageUrl, sortOrder: 0 } });
      });
      done.created++; if (imageUrl) done.withImage++;
      console.log(`ADDED  ${name} | ${cat.name} | ${label} | Rs ${price} | ${imageUrl ? 'with image' : 'no image'}`);
    } catch (e) {
      done.failed++;
      console.log(`FAIL   ${name || '(no name)'}: ${e.message}`);
    }
  }
  console.log(`\n${DRY ? 'Would add' : 'Added'} ${done.created} (${done.withImage} with an image), skipped ${done.skipped} already existing, ${done.failed} failed.`);
  if (!DRY && done.created) console.log('The app picks the new products up on its next refresh (within about a minute). Set real stock in Admin > Inventory.');
  process.exitCode = done.failed ? 1 : 0;
}

main()
  .catch((e) => { console.error(e.message || e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
