/**
 * CSV bulk import: parsing and validation only. No database, network or file access, so every rule here is unit-tested.
 * The routes (import.routes.ts) feed it what already exists and then write what it approves.
 *
 * Rules mirror the admin forms: a product lives in the most specific (leaf) category, SKUs are unique, a price never goes
 * above MRP, and products or categories that already exist are skipped, never overwritten.
 */

export const MAX_ROWS = 1000;

export const slug = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-').replace(/-+/g, '-').slice(0, 60);

/* ------------------------------------------------------------------ CSV reading */

export type CsvRow = { line: number; cells: Record<string, string> };

/** Reads CSV text: quotes, doubled quotes, commas and line breaks inside quotes, optional BOM. Headers are case/space-insensitive. */
export function parseCsv(text: string): { headers: string[]; rows: CsvRow[] } {
  const t = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const table: { line: number; cells: string[] }[] = [];
  let row: string[] = [];
  let cell = '';
  let inQ = false;
  let line = 1;
  let rowLine = 1;
  const endRow = () => {
    row.push(cell);
    cell = '';
    if (row.some((x) => x.trim() !== '')) table.push({ line: rowLine, cells: row });
    row = [];
  };
  for (let i = 0; i < t.length; i++) {
    const c = t[i]!;
    if (inQ) {
      if (c === '"' && t[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') inQ = false;
      else { if (c === '\n') line++; cell += c; }
    } else if (c === '"') inQ = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i++;
      endRow();
      line++;
      rowLine = line;
    } else cell += c;
  }
  if (cell !== '' || row.length) endRow();
  if (inQ) throw new Error('The file has an opening quote (") that is never closed.');
  const head = table.shift();
  if (!head) return { headers: [], rows: [] };
  const headers = head.cells.map((h) => h.trim().toLowerCase().replace(/[\s-]+/g, '_'));
  return {
    headers,
    rows: table.map((r) => ({ line: r.line, cells: Object.fromEntries(headers.map((h, i) => [h, (r.cells[i] ?? '').trim()])) })),
  };
}

const yes = new Set(['yes', 'y', 'true', '1']);
const no = new Set(['no', 'n', 'false', '0']);
/** Blank means "use the default". Returns null for something that is neither yes nor no. */
function flag(v: string | undefined, dflt: boolean): boolean | null {
  const s = (v ?? '').trim().toLowerCase();
  if (s === '') return dflt;
  if (yes.has(s)) return true;
  if (no.has(s)) return false;
  return null;
}

/** Accepts "1,250", "₹1250", "1250.50". Returns NaN when it is not a number. */
function money(v: string | undefined): number {
  const s = (v ?? '').replace(/[₹,\s]|rs\.?/gi, '');
  if (s === '' || !/^\d+(\.\d{1,2})?$/.test(s)) return NaN;
  return Number(s);
}

/* ------------------------------------------------------------------ results */

export type Status = 'ok' | 'skip' | 'error';
export type ItemResult<T> = { line: number; name: string; status: Status; message: string; data?: T };

/** The columns each template has. `required` ones must be present in the header row. */
export const CATEGORY_COLUMNS = { required: ['name'], optional: ['parent', 'sort_order', 'active'] };
export const PRODUCT_COLUMNS = {
  required: ['name', 'category', 'price'],
  optional: ['size', 'mrp', 'sku', 'stock', 'tagline', 'description', 'badge', 'tags', 'bestseller', 'new_arrival', 'festive', 'active', 'image_url'],
};

function missingColumns(headers: string[], cols: { required: string[] }) {
  return cols.required.filter((c) => !headers.includes(c));
}

export function tooManyRows(n: number) {
  return n > MAX_ROWS ? `The file has ${n} rows. Import up to ${MAX_ROWS} at a time.` : null;
}

/* ------------------------------------------------------------------ categories */

export type ExistingCategory = { id: string; name: string; parentId: string | null };
export type CategoryData = { id: string; name: string; parentId: string | null; sortOrder: number; isActive: boolean };

/**
 * Parents may be existing categories or other rows of the same file, in any order. `data` comes back sorted so a parent
 * is always created before its children.
 */
export function validateCategories(rows: CsvRow[], headers: string[], existing: ExistingCategory[]): { fileError?: string; results: ItemResult<CategoryData>[]; creationOrder: ItemResult<CategoryData>[] } {
  const miss = missingColumns(headers, CATEGORY_COLUMNS);
  if (miss.length) return { fileError: `Missing column${miss.length > 1 ? 's' : ''}: ${miss.join(', ')}. Download the template to see the expected columns.`, results: [], creationOrder: [] };
  const big = tooManyRows(rows.length);
  if (big) return { fileError: big, results: [], creationOrder: [] };

  const existingById = new Map(existing.map((c) => [c.id, c]));
  const results: ItemResult<CategoryData>[] = [];
  const seen = new Map<string, number>(); // id -> index in results
  const byName = (name: string) => existing.filter((c) => c.name.toLowerCase() === name.toLowerCase());

  for (const r of rows) {
    const c = r.cells;
    const name = (c.name ?? '').trim();
    const res: ItemResult<CategoryData> = { line: r.line, name: name || '(no name)', status: 'ok', message: '' };
    results.push(res);
    const fail = (m: string) => { res.status = 'error'; res.message = m; };
    if (name.length < 2 || name.length > 60) { fail('Name must be 2 to 60 characters.'); continue; }
    const id = slug(name);
    if (!id) { fail('Name must contain letters or numbers.'); continue; }
    if (seen.has(id)) { fail(`Listed twice (also on line ${results[seen.get(id)!]!.line}).`); continue; }
    seen.set(id, results.length - 1);
    if (existingById.has(id)) { res.status = 'skip'; res.message = 'Already exists.'; continue; }
    const sort = (c.sort_order ?? '') === '' ? 0 : Number(c.sort_order);
    if (!Number.isInteger(sort) || sort < 0 || sort > 10000) { fail('sort_order must be a whole number from 0 to 10000.'); continue; }
    const active = flag(c.active, true);
    if (active === null) { fail('active must be yes or no.'); continue; }
    res.data = { id, name, parentId: null, sortOrder: sort, isActive: active };
  }

  // Resolve parents (second pass, so file order does not matter).
  const fileIdByName = new Map<string, string[]>();
  for (const r of results) if (r.data) { const k = r.data.name.toLowerCase(); fileIdByName.set(k, [...(fileIdByName.get(k) ?? []), r.data.id]); }
  rows.forEach((row, i) => {
    const res = results[i]!;
    const parentName = (row.cells.parent ?? '').trim();
    if (!res.data || !parentName) return;
    const fromDb = byName(parentName);
    const fromFile = fileIdByName.get(parentName.toLowerCase()) ?? [];
    const all = [...fromDb.map((p) => p.id), ...fromFile];
    if (all.length === 0) { res.status = 'error'; res.message = `Parent "${parentName}" was not found (create it first or add it to this file).`; delete res.data; return; }
    if (new Set(all).size > 1) { res.status = 'error'; res.message = `More than one category is called "${parentName}". Rename one so the parent is clear.`; delete res.data; return; }
    if (all[0] === res.data.id) { res.status = 'error'; res.message = 'A category cannot be its own parent.'; delete res.data; return; }
    res.data.parentId = all[0]!;
  });

  // A parent that itself failed or was skipped must not leave its children orphaned or cyclic.
  const okById = new Map(results.filter((r) => r.data).map((r) => [r.data!.id, r]));
  for (const r of results) {
    if (!r.data?.parentId) continue;
    const parent = okById.get(r.data.parentId);
    if (!parent && !existingById.has(r.data.parentId)) { r.status = 'error'; r.message = 'Its parent category has an error in this file.'; delete r.data; continue; }
    // Cycle: walk up through file rows only (existing categories cannot point back at new ones).
    const walked = new Set<string>([r.data.id]);
    let p = parent;
    while (p?.data) {
      if (walked.has(p.data.id)) { r.status = 'error'; r.message = 'Parents form a loop.'; delete r.data; break; }
      walked.add(p.data.id);
      p = p.data.parentId ? okById.get(p.data.parentId) : undefined;
    }
  }
  // Repeat once: a row removed above can orphan its own children.
  for (let pass = 0; pass < 5; pass++) {
    let changed = false;
    const live = new Map(results.filter((r) => r.data).map((r) => [r.data!.id, r]));
    for (const r of results) {
      if (r.data?.parentId && !live.has(r.data.parentId) && !existingById.has(r.data.parentId)) {
        r.status = 'error'; r.message = 'Its parent category has an error in this file.'; delete r.data; changed = true;
      }
    }
    if (!changed) break;
  }

  // Parents first.
  const depth = (r: ItemResult<CategoryData>) => { let d = 0; let p = r.data?.parentId ? okById.get(r.data.parentId) : undefined; while (p?.data && d < 50) { d++; p = p.data.parentId ? okById.get(p.data.parentId) : undefined; } return d; };
  const order = new Map(results.map((r, i) => [r, i]));
  const ordered = [...results].sort((a, b) => (a.data && b.data ? depth(a) - depth(b) : 0) || order.get(a)! - order.get(b)!);
  // Results stay in file order for display; `creationOrder` is the order to insert them in.
  return { results, creationOrder: ordered.filter((r) => r.data) };
}

/* ------------------------------------------------------------------ products */

export type ExistingCat = { id: string; name: string; parentId: string | null; isActive: boolean };
export type ProductVariantData = { id: string; sku: string; label: string; mrp: number; price: number; stock: number };
export type ProductData = {
  id: string; name: string; tagline: string; description: string; categoryId: string; badge: string | null; tags: string[];
  featured: { bestseller: boolean; newArrival: boolean; festive: boolean }; isActive: boolean; isCake: boolean; imageUrl: string | null;
  variants: ProductVariantData[];
};
export type ProductContext = {
  categories: ExistingCat[];
  productIds: Set<string>;
  productNames: Set<string>; // lower-case
  skus: Set<string>; // upper-case
  isAllowedImage: (url: string) => boolean;
};

const skuOk = /^[A-Za-z0-9._-]{3,40}$/;

/**
 * Rows with the same product name become ONE product with several sizes (variants). All-or-nothing per product:
 * one bad row means that product is not imported, and the message says which line and why.
 */
export function validateProducts(rows: CsvRow[], headers: string[], ctx: ProductContext): { fileError?: string; results: ItemResult<ProductData>[] } {
  const miss = missingColumns(headers, PRODUCT_COLUMNS);
  if (miss.length) return { fileError: `Missing column${miss.length > 1 ? 's' : ''}: ${miss.join(', ')}. Download the template to see the expected columns.`, results: [] };
  const big = tooManyRows(rows.length);
  if (big) return { fileError: big, results: [] };

  const hasKids = new Set(ctx.categories.map((c) => c.parentId).filter(Boolean) as string[]);
  const catById = new Map(ctx.categories.map((c) => [c.id, c]));
  const rootOf = (c: ExistingCat) => { let x = c; for (let i = 0; i < 10 && x.parentId; i++) x = catById.get(x.parentId) ?? x; return x; };

  /** "Milk Sweets" or "Sweets > Milk Sweets". Only active leaf categories qualify. */
  const findCategory = (text: string): { cat?: ExistingCat; error?: string } => {
    const parts = text.split('>').map((p) => p.trim()).filter(Boolean);
    const leafName = parts[parts.length - 1];
    if (!leafName) return { error: 'category is empty.' };
    let matches = ctx.categories.filter((c) => c.name.toLowerCase() === leafName.toLowerCase());
    if (parts.length > 1) {
      const parentName = parts[parts.length - 2]!.toLowerCase();
      matches = matches.filter((c) => c.parentId && catById.get(c.parentId)?.name.toLowerCase() === parentName);
    }
    if (matches.length === 0) return { error: `category "${text}" does not exist. Add it first (Categories > Import, or Add category).` };
    const leaves = matches.filter((c) => !hasKids.has(c.id));
    if (leaves.length === 0) {
      const kids = ctx.categories.filter((c) => c.parentId === matches[0]!.id).slice(0, 4).map((c) => c.name).join(', ');
      return { error: `"${text}" has subcategories (${kids}…). Use one of them.` };
    }
    if (leaves.length > 1) return { error: `More than one category is called "${leafName}". Write it as "Parent > ${leafName}".` };
    const cat = leaves[0]!;
    if (!cat.isActive) return { error: `category "${cat.name}" is hidden. Show it first.` };
    return { cat };
  };

  // Group rows by product name, keeping file order.
  const groups = new Map<string, CsvRow[]>();
  for (const r of rows) {
    const key = (r.cells.name ?? '').trim().toLowerCase() || `\u0000line${r.line}`;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }

  const results: ItemResult<ProductData>[] = [];
  const idsInFile = new Set<string>();
  const skusInFile = new Set<string>();

  for (const [, grp] of groups) {
    const first = grp[0]!;
    const name = (first.cells.name ?? '').trim();
    const res: ItemResult<ProductData> = { line: first.line, name: name || '(no name)', status: 'ok', message: '' };
    results.push(res);
    const errs: string[] = [];
    const at = (r: CsvRow, m: string) => errs.push(`Line ${r.line}: ${m}`);

    if (name.length < 2 || name.length > 100) { at(first, 'name must be 2 to 100 characters.'); }
    const id = slug(name);
    if (name && !id) at(first, 'name must contain letters or numbers.');
    if (id && (ctx.productIds.has(id) || ctx.productNames.has(name.toLowerCase()))) { res.status = 'skip'; res.message = 'Already exists.'; continue; }
    if (id && idsInFile.has(id)) at(first, `another product in this file makes the same id "${id}". Rename one.`);
    idsInFile.add(id);

    const catText = (first.cells.category ?? '').trim();
    const found = findCategory(catText);
    if (found.error) at(first, found.error);
    for (const r of grp.slice(1)) if ((r.cells.category ?? '').trim().toLowerCase() !== catText.toLowerCase() && (r.cells.category ?? '').trim() !== '') at(r, 'a product has one category; sizes of the same product must repeat the same category.');

    const badge = (first.cells.badge ?? '').trim();
    if (badge.length > 24) at(first, 'badge is longer than 24 characters.');
    const tagline = (first.cells.tagline ?? '').trim();
    if (tagline.length > 160) at(first, 'tagline is longer than 160 characters.');
    const description = (first.cells.description ?? '').trim();
    if (description.length > 2000) at(first, 'description is longer than 2000 characters.');
    const tags = (first.cells.tags ?? '').split(/[;|]/).map((t) => t.trim()).filter(Boolean);
    if (tags.length > 20 || tags.some((t) => t.length > 30)) at(first, 'tags: up to 20 tags of 30 characters, separated by ;');
    const bestseller = flag(first.cells.bestseller, false);
    const newArrival = flag(first.cells.new_arrival, true);
    const festive = flag(first.cells.festive, false);
    const active = flag(first.cells.active, true);
    for (const [k, v] of [['bestseller', bestseller], ['new_arrival', newArrival], ['festive', festive], ['active', active]] as const) if (v === null) at(first, `${k} must be yes or no.`);
    const imageUrl = (first.cells.image_url ?? '').trim();
    if (imageUrl && !ctx.isAllowedImage(imageUrl)) at(first, 'image_url must be an https link (or an image already uploaded here).');

    const variants: ProductVariantData[] = [];
    const labelsHere = new Set<string>();
    if (grp.length > 12) errs.push('A product can have up to 12 sizes.');
    for (const r of grp) {
      const label = (r.cells.size ?? '').trim() || 'Standard';
      if (label.length > 40) { at(r, 'size is longer than 40 characters.'); continue; }
      if (labelsHere.has(label.toLowerCase())) { at(r, `size "${label}" is listed twice.`); continue; }
      labelsHere.add(label.toLowerCase());
      const price = money(r.cells.price);
      if (!Number.isFinite(price) || price <= 0) { at(r, `price "${r.cells.price ?? ''}" must be a number above 0.`); continue; }
      const mrpText = (r.cells.mrp ?? '').trim();
      const mrp = mrpText === '' ? price : money(mrpText);
      if (!Number.isFinite(mrp)) { at(r, `mrp "${mrpText}" is not a number.`); continue; }
      if (price > mrp) { at(r, `price ₹${price} is above MRP ₹${mrp}.`); continue; }
      const stockText = (r.cells.stock ?? '').trim();
      const stock = stockText === '' ? 0 : Number(stockText);
      if (!Number.isInteger(stock) || stock < 0 || stock > 1_000_000) { at(r, `stock "${stockText}" must be a whole number, 0 or more.`); continue; }
      let sku = (r.cells.sku ?? '').trim();
      if (sku === '') sku = ('SH-' + slug(name) + '-' + slug(label)).toUpperCase().replace(/[^A-Z0-9._-]/g, '').slice(0, 40);
      if (!skuOk.test(sku)) { at(r, `sku "${sku}" must be 3 to 40 letters, numbers, . _ -`); continue; }
      const upper = sku.toUpperCase();
      if (ctx.skus.has(upper)) { at(r, `sku ${sku} is already used by another product.`); continue; }
      if (skusInFile.has(upper)) { at(r, `sku ${sku} appears more than once in this file.`); continue; }
      skusInFile.add(upper);
      variants.push({ id: `${id}-${slug(label) || 'std'}`, sku, label, mrp, price, stock });
    }

    if (errs.length) {
      res.status = 'error';
      res.message = errs.slice(0, 3).join(' ') + (errs.length > 3 ? ` (+${errs.length - 3} more)` : '');
      continue;
    }
    const cat = found.cat!;
    res.data = {
      id, name, tagline, description, categoryId: cat.id, badge: badge || null, tags,
      featured: { bestseller: !!bestseller, newArrival: !!newArrival, festive: !!festive }, isActive: !!active,
      isCake: rootOf(cat).id === 'cakes', imageUrl: imageUrl || null, variants,
    };
    res.message = `${variants.length} size${variants.length > 1 ? 's' : ''} in ${cat.name}`;
  }
  return { results };
}

/* ------------------------------------------------------------------ templates */

export const CATEGORY_TEMPLATE = {
  headers: ['name', 'parent', 'sort_order', 'active'],
  rows: [
    ['Dry Fruit Sweets', 'Sweets', '60', 'yes'],
    ['Premium Hampers', 'Gift Boxes', '', 'yes'],
  ] as string[][],
};

export const PRODUCT_TEMPLATE = {
  headers: ['name', 'category', 'size', 'mrp', 'price', 'sku', 'stock', 'tagline', 'description', 'tags', 'bestseller', 'new_arrival', 'festive', 'active', 'image_url'],
  rows: [
    ['Kaju Pista Roll', 'Kaju Sweets', '250 g', '400', '380', '', '40', 'Cashew and pistachio roll', 'Made fresh with pure ghee.', 'kaju;festive', 'no', 'yes', 'no', 'yes', ''],
    ['Kaju Pista Roll', 'Kaju Sweets', '500 g', '780', '740', '', '25', '', '', '', '', '', '', '', ''],
    ['Butter Murukku', 'Murukku & Snacks', '250 g', '130', '120', 'SH-BUTTER-MURUKKU-250', '60', 'Crisp and buttery', '', '', 'yes', '', '', '', ''],
  ] as string[][],
};
