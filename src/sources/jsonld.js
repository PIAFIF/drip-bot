import { classify } from '../classify.js';

// Generic scraper: fetches a product page and reads the embedded schema.org
// Product data (JSON-LD `<script type="application/ld+json">`). Most modern
// e-commerce sites publish it, which lets one adapter cover many sites without
// per-site code. It does NOT crawl: give it product-page URLs (or a site's deal
// page that redirects to product pages), one per line in the admin site list.
//
// Reality check: sites with strong anti-bot protection, or that render prices
// only client-side, won't expose JSON-LD — those need the Awin feed instead.

const toCents = (v) => {
  const n = parseFloat(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) ? Math.round(n * 100) : null;
};

function extractJsonLd(html) {
  const blocks = [];
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    try {
      blocks.push(JSON.parse(m[1].trim()));
    } catch {
      /* malformed block — ignore */
    }
  }
  return blocks;
}

function findProduct(node) {
  if (!node || typeof node !== 'object') return null;
  if (Array.isArray(node)) {
    for (const n of node) {
      const p = findProduct(n);
      if (p) return p;
    }
    return null;
  }
  const type = node['@type'];
  const isProduct = type === 'Product' || (Array.isArray(type) && type.includes('Product'));
  if (isProduct && node.offers) return node;
  if (node['@graph']) return findProduct(node['@graph']);
  return null;
}

function metaContent(html, prop) {
  const re = new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']+)["']`, 'i');
  return html.match(re)?.[1] ?? null;
}

async function scrapeOne(url) {
  const res = await fetch(url, {
    headers: { 'user-agent': 'Mozilla/5.0 (compatible; drip-bot/1.0; +https://drip-fr.netlify.app)' },
    redirect: 'follow',
    signal: AbortSignal.timeout(12000), // never let one slow/hanging site stall the run
  });
  if (!res.ok) throw new Error(`http ${res.status}`);
  const html = await res.text();

  const product = extractJsonLd(html).map(findProduct).find(Boolean);
  const offer = product ? (Array.isArray(product.offers) ? product.offers[0] : product.offers) : null;

  const name = product?.name || metaContent(html, 'og:title') || '';
  const after = toCents(offer?.price ?? offer?.lowPrice);
  // Discount reference: JSON-LD rarely carries the old price; fall back to
  // highPrice or a listPrice-style field when present.
  const before = toCents(offer?.highPrice) ?? toCents(product?.listPrice) ?? null;
  const image = (Array.isArray(product?.image) ? product.image[0] : product?.image) || metaContent(html, 'og:image');
  const brand = typeof product?.brand === 'object' ? product?.brand?.name : product?.brand;

  if (!name || after == null) return null;
  if (before == null || after >= before) return null; // only surface genuine discounts

  const cat = classify({ title: name, categoryHint: name });
  if (!cat) return null;

  const desc = (product?.description || metaContent(html, 'og:description') || name)
    .replace(/\s+/g, ' ').trim().slice(0, 4900);

  return {
    title: name.length >= 10 ? name.slice(0, 140) : `${name} — bon plan mode`,
    brand: (brand || '').toString().trim() || null,
    description: desc.length >= 10 ? desc : `${desc} — repéré par le bot Drip.`,
    priceBeforeCents: before,
    priceAfterCents: after,
    merchantUrl: url,
    imageUrl: image && /^https?:\/\//.test(image) ? image : null,
    genderSlug: cat.gender,
    categorySlug: cat.category,
    subSlug: cat.sub,
  };
}

// Scrapes each URL in the admin-configured site list. Failures are logged and
// skipped, never fatal.
export async function fromSites(sites = []) {
  const deals = [];
  for (const url of sites) {
    if (!/^https?:\/\//.test(url)) continue;
    try {
      const d = await scrapeOne(url);
      if (d) {
        deals.push(d);
        console.log(`  scrape: OK ${url}`);
      } else {
        console.log(`  scrape: rien d'exploitable ${url}`);
      }
    } catch (e) {
      console.warn(`  scrape: échec ${url} (${e.message})`);
    }
  }
  return deals;
}
