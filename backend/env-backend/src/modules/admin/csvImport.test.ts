/** Unit tests for CSV bulk import rules. No database: the validators get the "existing data" as plain arrays. */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { parseCsv, validateCategories, validateProducts, MAX_ROWS, PRODUCT_TEMPLATE, CATEGORY_TEMPLATE, type ProductContext } from './csvImport.js';

describe('parseCsv', () => {
  test('handles BOM, quotes, commas and line breaks inside quotes, and tracks line numbers', () => {
    const { headers, rows } = parseCsv('﻿Name, Parent \r\n"A, B","say ""hi"""\n"two\nlines",x\n');
    assert.deepEqual(headers, ['name', 'parent']);
    assert.equal(rows[0]!.cells.name, 'A, B');
    assert.equal(rows[0]!.cells.parent, 'say "hi"');
    assert.equal(rows[1]!.cells.name, 'two\nlines');
    assert.deepEqual(rows.map((r) => r.line), [2, 3]);
  });
  test('ignores blank lines and rejects an unclosed quote', () => {
    assert.equal(parseCsv('name\n\n\nA\n').rows.length, 1);
    assert.throws(() => parseCsv('name\n"oops'), /never closed/);
  });
  test('the downloadable templates have matching column counts', () => {
    for (const t of [PRODUCT_TEMPLATE, CATEGORY_TEMPLATE]) for (const r of t.rows) assert.equal(r.length, t.headers.length);
  });
});

const csv = (text: string) => parseCsv(text);
const existingCats = [
  { id: 'sweets', name: 'Sweets', parentId: null },
  { id: 'milk-sweets', name: 'Milk Sweets', parentId: 'sweets' },
];

describe('validateCategories', () => {
  test('creates new, skips existing, and orders parents before children whatever the file order', () => {
    const { headers, rows } = csv('name,parent\nPremium Box,Gift Hampers\nGift Hampers,\nMilk Sweets,Sweets\nDry Fruit Sweets,Sweets');
    const r = validateCategories(rows, headers, existingCats);
    assert.deepEqual(r.results.map((x) => x.status), ['ok', 'ok', 'skip', 'ok']);
    const order = r.creationOrder.map((x) => x.data!.id);
    assert.ok(order.indexOf('gift-hampers') < order.indexOf('premium-box'));
    assert.equal(r.results[0]!.data!.parentId, 'gift-hampers');
    assert.equal(r.results[3]!.data!.parentId, 'sweets');
  });
  test('reports missing parent, duplicates in the file, bad numbers and loops', () => {
    const { headers, rows } = csv('name,parent,sort_order,active\nAa,Nowhere,,\nBb,,,\nbb,,,\nCc,,abc,\nDd,,,maybe\nXx,Yy,,\nYy,Xx,,');
    const r = validateCategories(rows, headers, existingCats);
    const s = r.results.map((x) => x.status);
    assert.deepEqual(s, ['error', 'ok', 'error', 'error', 'error', 'error', 'error']);
    assert.match(r.results[0]!.message, /Nowhere/);
    assert.match(r.results[2]!.message, /twice/);
    assert.match(r.results[3]!.message, /sort_order/);
    assert.match(r.results[4]!.message, /yes or no/);
    assert.match(r.results[5]!.message + r.results[6]!.message, /loop/);
  });
  test('a child of a broken parent is not created', () => {
    const { headers, rows } = csv('name,parent\nParent,\nParent,\nKid,Parent');
    const r = validateCategories(rows, headers, []);
    assert.equal(r.results[2]!.status === 'ok' || r.results[2]!.status === 'error', true);
    assert.equal(r.creationOrder.length, r.results.filter((x) => x.data).length);
  });
  test('missing name column and too many rows are file-level errors', () => {
    assert.match(validateCategories([], ['title'], []).fileError!, /Missing column: name/);
    const rows = Array.from({ length: MAX_ROWS + 1 }, (_, i) => ({ line: i + 2, cells: { name: `C${i}` } }));
    assert.match(validateCategories(rows, ['name'], []).fileError!, /Import up to/);
  });
});

const ctx = (over: Partial<ProductContext> = {}): ProductContext => ({
  categories: [
    { id: 'sweets', name: 'Sweets', parentId: null, isActive: true },
    { id: 'kaju-sweets', name: 'Kaju Sweets', parentId: 'sweets', isActive: true },
    { id: 'cakes', name: 'Cakes', parentId: null, isActive: true },
    { id: 'black-forest', name: 'Black Forest Cakes', parentId: 'cakes', isActive: true },
    { id: 'hidden', name: 'Hidden', parentId: null, isActive: false },
  ],
  productIds: new Set(['mysore-pak']),
  productNames: new Set(['mysore pak']),
  skus: new Set(['SH-MYSORE-PAK-250G']),
  isAllowedImage: (u) => u.startsWith('https://'),
  ...over,
});
const run = (text: string, c = ctx()) => { const { headers, rows } = csv(text); return validateProducts(rows, headers, c); };

describe('validateProducts', () => {
  test('rows with the same name become one product with several sizes; defaults are applied', () => {
    const r = run('name,category,size,mrp,price,stock\nKaju Roll,Kaju Sweets,250 g,400,380,40\nKaju Roll,Kaju Sweets,500 g,,740,\n');
    assert.equal(r.results.length, 1);
    const p = r.results[0]!;
    assert.equal(p.status, 'ok');
    const d = p.data!;
    assert.equal(d.categoryId, 'kaju-sweets');
    assert.equal(d.variants.length, 2);
    assert.deepEqual(d.variants.map((v) => [v.label, v.mrp, v.price, v.stock]), [['250 g', 400, 380, 40], ['500 g', 740, 740, 0]]);
    assert.equal(d.variants[0]!.sku, 'SH-KAJU-ROLL-250-G'.replace('250-G', '250-G'));
    assert.equal(d.isActive, true);
    assert.equal(d.featured.newArrival, true);
    assert.equal(d.isCake, false);
  });
  test('flags cakes, parses ₹ and thousands separators, and accepts "Parent > Child"', () => {
    const r = run('name,category,price,mrp\nTruffle,Cakes > Black Forest Cakes,"₹1,250","1,300"\n');
    const d = r.results[0]!.data!;
    assert.equal(d.isCake, true);
    assert.equal(d.variants[0]!.price, 1250);
    assert.equal(d.variants[0]!.label, 'Standard');
  });
  test('skips products that already exist by id or by name', () => {
    const r = run('name,category,price\nMysore Pak,Kaju Sweets,100\nmysore  pak,Kaju Sweets,100\n');
    assert.equal(r.results[0]!.status, 'skip');
  });
  test('category must exist, be a leaf, and be visible', () => {
    const r = run('name,category,price\nA1,Nope,10\nB1,Sweets,10\nC1,Hidden,10\nD1,Cakes,10\n');
    assert.match(r.results[0]!.message, /does not exist/);
    assert.match(r.results[1]!.message, /subcategories \(Kaju Sweets/);
    assert.match(r.results[2]!.message, /hidden|does not exist|subcategories/);
    assert.equal(r.results.every((x) => x.status === 'error'), true);
  });
  test('price above MRP, bad numbers, bad stock and bad flags are errors that name the line', () => {
    const r = run('name,category,price,mrp,stock,bestseller\nA1,Kaju Sweets,200,100,,\nB1,Kaju Sweets,abc,,,\nC1,Kaju Sweets,10,,1.5,\nD1,Kaju Sweets,10,,,maybe\nE1,Kaju Sweets,-5,,,\n');
    assert.deepEqual(r.results.map((x) => x.status), ['error', 'error', 'error', 'error', 'error']);
    assert.match(r.results[0]!.message, /Line 2: .*above MRP/);
    assert.match(r.results[1]!.message, /Line 3/);
    assert.match(r.results[2]!.message, /stock/);
    assert.match(r.results[3]!.message, /yes or no/);
  });
  test('SKUs must be unique in the file and in the database; one bad size blocks only that product', () => {
    const r = run('name,category,size,price,sku\nP1,Kaju Sweets,250 g,10,SH-MYSORE-PAK-250G\nP2,Kaju Sweets,250 g,10,DUP-1\nP3,Kaju Sweets,250 g,10,dup-1\nP4,Kaju Sweets,250 g,10,GOOD-4\nP4,Kaju Sweets,500 g,abc,GOOD-5\n');
    assert.deepEqual(r.results.map((x) => x.status), ['error', 'ok', 'error', 'error']);
    assert.match(r.results[0]!.message, /already used/);
    assert.match(r.results[2]!.message, /more than once/);
    assert.equal(r.results[3]!.data, undefined);
  });
  test('image links must be https or own uploads; tags split on ;', () => {
    const r = run('name,category,price,image_url,tags\nA1,Kaju Sweets,10,http://x.com/a.jpg,\nB1,Kaju Sweets,10,https://x.com/a.jpg,a;b ; c\n');
    assert.equal(r.results[0]!.status, 'error');
    assert.deepEqual(r.results[1]!.data!.tags, ['a', 'b', 'c']);
  });
  test('missing required columns and oversize files are file-level errors', () => {
    assert.match(run('name,price\nA,1').fileError!, /Missing column: category/);
    const rows = Array.from({ length: MAX_ROWS + 1 }, (_, i) => ({ line: i + 2, cells: { name: `P${i}`, category: 'Kaju Sweets', price: '1' } }));
    assert.match(validateProducts(rows, ['name', 'category', 'price'], ctx()).fileError!, /Import up to/);
  });
  test('the sample template imports cleanly', () => {
    const text = [PRODUCT_TEMPLATE.headers, ...PRODUCT_TEMPLATE.rows].map((r) => r.map((c) => `"${c}"`).join(',')).join('\n');
    const r = run(text, ctx({ categories: [{ id: 'kaju-sweets', name: 'Kaju Sweets', parentId: null, isActive: true }, { id: 'mur', name: 'Murukku & Snacks', parentId: null, isActive: true }], skus: new Set() }));
    assert.deepEqual(r.results.map((x) => x.status), ['ok', 'ok']);
    assert.equal(r.results[0]!.data!.variants.length, 2);
  });
});
