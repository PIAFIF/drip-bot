import { classify } from '../classify.js';

// Shopify source — free, no account, real products. Every Shopify store exposes a
// public `/products.json` endpoint listing products with variants that carry
// `price` and `compare_at_price`; when compare_at_price > price there's a genuine
// markdown. We read it directly (clean JSON, no HTML scraping, no anti-bot fight)
// and post the best discounts with a real product link.
//
// Curated default list of fashion brands confirmed to run on Shopify (EUR).
// Add more via the SHOPIFY_STORES env var (comma-separated hostnames).
const DEFAULT_STORES = [
  'www.leslipfrancais.fr',
  'www.bonnegueule.fr',
  'www.seasonly.fr',
  'www.loom.fr',
  'www.balibaris.com',
  'www.komono.com',
  'www.polene-paris.com',
  'www.jimmyfairly.com',
];

const toCents = (v) => {
  const n = parseFloat(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) ? Math.round(n * 100) : null;
};

const stripHtml = (s) => (s || '').replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/gi, ' ').replace(/\s+/g, ' ').trim();

function productToDeal(store, p) {
  // Best available variant with a real markdown.
  let best = null;
  for (const v of p.variants || []) {
    const after = toCents(v.price);
    const before = toCents(v.compare_at_price);
    if (after == null || before == null || after <= 0 || after >= before) continue;
    if (v.available === false) continue;
    const disc = Math.round((1 - after / before) * 100);
    if (!best || disc > best.disc) best = { after, before, disc };
  }
  if (!best) return null;

  const cat = classify({
    title: p.title,
    categoryHint: `${p.product_type || ''} ${(p.tags || []).join(' ')}`,
    genderHint: `${p.product_type || ''} ${(p.tags || []).join(' ')} ${p.title}`,
  });
  if (!cat) return null;

  const name = (p.title || '').trim();
  const image = p.images?.[0]?.src || p.image?.src || null;
  const desc = stripHtml(p.body_html).slice(0, 4900) || name;

  return {
    payload: {
      title: name.length >= 10 ? name.slice(0, 140) : `${name} — bon plan mode`,
      brand: (p.vendor || '').trim() || null,
      description: desc.length >= 10 ? desc : `${name} — repéré par le bot Drip.`,
      priceBeforeCents: best.before,
      priceAfterCents: best.after,
      merchantUrl: `https://${store}/products/${p.handle}`,
      imageUrl: image && /^https?:\/\//.test(image) ? image : null,
      genderSlug: cat.gender,
      categorySlug: cat.category,
      subSlug: cat.sub,
    },
    disc: best.disc,
  };
}

async function fetchStore(store, perStore) {
  // One polite request per store (first 250 products carry plenty of markdowns).
  const url = `https://${store}/products.json?limit=250`;
  const res = await fetch(url, {
    headers: { 'user-agent': 'Mozilla/5.0 (compatible; drip-bot/1.0)' },
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) throw new Error(`http ${res.status}`);
  const json = await res.json();
  const deals = [];
  for (const p of json.products || []) {
    const d = productToDeal(store, p);
    if (d) deals.push(d);
  }
  return deals.sort((a, b) => b.disc - a.disc).slice(0, perStore).map((d) => d.payload);
}

// Pulls the best-discounted products across the default + env-configured stores.
export async function fromShopify({ perStore = 4 } = {}) {
  const extra = (process.env.SHOPIFY_STORES || '')
    .split(',')
    .map((s) => s.trim().replace(/^https?:\/\//, '').replace(/\/.*$/, ''))
    .filter(Boolean);
  const stores = [...new Set([...DEFAULT_STORES, ...extra])];

  const deals = [];
  for (const store of stores) {
    try {
      const found = await fetchStore(store, perStore);
      deals.push(...found);
      console.log(`  shopify: ${found.length} deals depuis ${store}`);
    } catch (e) {
      console.warn(`  shopify: ${store} ignoré (${e.message})`);
    }
  }
  return deals;
}

export const _internal = { productToDeal, DEFAULT_STORES };
