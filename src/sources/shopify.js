import { classify } from '../classify.js';

// Shopify source — free, no account, real products. Every Shopify store exposes a
// public `/products.json` endpoint listing products with variants that carry
// `price` and `compare_at_price`; when compare_at_price > price there's a genuine
// markdown. We read it directly (clean JSON, no HTML scraping, no anti-bot fight)
// and post the best discounts with a real product link.
//
// Curated default list of fashion brands confirmed to run on Shopify and to price
// in EUR (mixing prices from a non-EUR store would be wrong, since products.json
// carries no currency). Add more via the SHOPIFY_STORES env var (comma-separated).
const DEFAULT_STORES = [
  // DTC / créateurs
  'www.leslipfrancais.fr',
  'www.bonnegueule.fr',
  'www.seasonly.fr',
  'www.loom.fr',
  'www.balibaris.com',
  'www.komono.com',
  'www.polene-paris.com',
  'www.jimmyfairly.com',
  'www.m-moustache.com',
  'www.hast.fr',
  'www.colorfulstandard.com',
  // Marques plus connues (mainstream accessible via Shopify)
  'www.napapijri.com',
  'www.lecoqsportif.com',
  'www.scotch-soda.com',
  'www.pimkie.fr',
  'www.izac.fr',
  'www.teddysmith.com',
  'www.paulandjoe.com',
  'www.repetto.fr',
  'www.jott.com',
  'www.saint-james.com',
  'www.pyrenex.com',
  'www.dim.fr',
  'www.rouje.com',
  'www.musier-paris.com',
  'www.avnier.com',
  'www.maisonlabiche.com',
  'www.cuissedegrenouille.com',
  'www.armorlux.com',
  'www.pull-in.com',
  'www.circlesportswear.com',
  'www.cluse.com',
  'www.rains.com',
  'www.organicbasics.com',
  'www.mercihandy.com',
  'www.ohmycream.com',
  'www.danielwellington.com',
  'www.kappa.com',
  'www.eytys.com',
  'www.eden-park.fr',
  'www.faguo.fr',
  'www.izipizi.com',
  'www.soeur.fr',
  'www.molli.com',
  'www.respire.co',
  'www.absolution-cosmetics.com',
  // Site multi-marques (vendeurs mainstream variés)
  'www.thebradery.com',
];

const toCents = (v) => {
  const n = parseFloat(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) ? Math.round(n * 100) : null;
};

const stripHtml = (s) => (s || '').replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/gi, ' ').replace(/\s+/g, ' ').trim();

// Best-effort promo end date: some stores tag a sale end (e.g. "sale-ends-2026-07-31"
// or "solde-jusqu-au-31/07/2026"). If we find a future date, use it; otherwise the
// caller falls back to the default TTL. (Standard Shopify feeds rarely carry one.)
function promoEndFromTags(tags) {
  for (const raw of tags || []) {
    const m = String(raw).match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})|(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
    if (!m) continue;
    const iso = m[1] ? `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}` : `${m[6]}-${m[5].padStart(2, '0')}-${m[4].padStart(2, '0')}`;
    const d = new Date(`${iso}T23:59:59`);
    if (!Number.isNaN(d.getTime()) && d.getTime() > Date.now()) return d.toISOString();
  }
  return null;
}

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

  // Use the store's promo end date if it exposes one; otherwise a safety-net TTL so
  // deals don't stay "active" forever.
  const ttlDays = Number(process.env.BOT_DEAL_TTL_DAYS || 14);
  const expiresAt = promoEndFromTags(p.tags) || new Date(Date.now() + ttlDays * 86400000).toISOString();

  return {
    payload: {
      title: name.length >= 10 ? name.slice(0, 140) : `${name} — bon plan mode`,
      brand: (p.vendor || '').trim() || null,
      description: desc.length >= 10 ? desc : `${name} — repéré par le bot Drip.`,
      priceBeforeCents: best.before,
      priceAfterCents: best.after,
      expiresAt,
      merchantUrl: `https://${store}/products/${p.handle}`,
      imageUrl: image && /^https?:\/\//.test(image) ? image : null,
      genderSlug: cat.gender,
      categorySlug: cat.category,
      subSlug: cat.sub,
    },
    disc: best.disc,
  };
}

// Fisher-Yates shuffle so each run surfaces DIFFERENT products from the store's
// discounted catalog (otherwise we'd always pick the same top-N and post nothing
// new after the first run — the server dedupes by URL).
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
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

  const minDiscount = Number(process.env.MIN_DISCOUNT || 20);
  let deals = [];
  for (const p of json.products || []) {
    const d = productToDeal(store, p);
    if (d) deals.push(d);
  }
  // Keep meaningful markdowns; fall back to all if the store has few.
  const strong = deals.filter((d) => d.disc >= minDiscount);
  const pool = strong.length >= perStore ? strong : deals;
  return shuffle(pool).slice(0, perStore).map((d) => d.payload);
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
