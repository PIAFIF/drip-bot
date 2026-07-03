import { gunzipSync } from 'node:zlib';
import { parse } from 'csv-parse/sync';
import { classify } from '../classify.js';

// Reads Awin product datafeeds. In the Awin dashboard (Toolbox → Create-a-Feed)
// you generate one download URL per merchant with the columns below; paste those
// URLs (comma-separated) into AWIN_FEED_URLS. Reliable + legal (Awin authorizes
// this data), and the merchant_url carries your affiliate tracking.
//
// Recommended columns when generating the feed:
//   product_name, description, brand_name, search_price, store_price, rrp_price,
//   currency, merchant_deep_link, aw_image_url, merchant_category, in_stock

const NEEDED = [
  'product_name', 'aw_deep_link', 'merchant_deep_link', 'search_price', 'store_price',
  'rrp_price', 'currency', 'brand_name', 'aw_image_url', 'merchant_image_url',
  'description', 'merchant_category', 'category_name', 'in_stock',
];

const toCents = (v) => {
  const n = parseFloat(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) ? Math.round(n * 100) : null;
};

function rowToDeal(row) {
  const after = toCents(row.search_price ?? row.store_price);
  const before = toCents(row.rrp_price) ?? toCents(row.store_price);
  if (after == null || before == null || after <= 0 || after >= before) return null; // needs a real discount
  if (String(row.in_stock ?? '1') === '0') return null;

  const url = row.aw_deep_link || row.merchant_deep_link;
  const image = row.aw_image_url || row.merchant_image_url || null;
  const name = (row.product_name || '').trim();
  if (!url || name.length < 5) return null;

  const cat = classify({
    title: name,
    categoryHint: `${row.merchant_category || ''} ${row.category_name || ''}`,
    genderHint: `${row.merchant_category || ''} ${row.category_name || ''}`,
  });
  if (!cat) return null;

  const discount = Math.round((1 - after / before) * 100);
  const title = name.length >= 10 ? name.slice(0, 140) : `${name} — bon plan mode`;
  const desc = (row.description || name).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 4900) || name;

  return {
    payload: {
      title,
      brand: (row.brand_name || '').trim() || null,
      description: desc.length >= 10 ? desc : `${desc} — repéré par le bot Drip.`,
      priceBeforeCents: before,
      priceAfterCents: after,
      merchantUrl: url,
      imageUrl: image && /^https?:\/\//.test(image) ? image : null,
      genderSlug: cat.gender,
      categorySlug: cat.category,
      subSlug: cat.sub,
    },
    discount,
  };
}

async function fetchFeed(url) {
  const res = await fetch(url, { headers: { 'user-agent': 'drip-bot/1.0' } });
  if (!res.ok) throw new Error(`feed ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const isGzip = buf[0] === 0x1f && buf[1] === 0x8b;
  return (isGzip ? gunzipSync(buf) : buf).toString('utf8');
}

// Returns the best-discounted, in-stock products across all configured feeds.
export async function fromAwin({ perFeed = 5 } = {}) {
  const urls = (process.env.AWIN_FEED_URLS || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (urls.length === 0) return [];

  const deals = [];
  for (const url of urls) {
    try {
      const csv = await fetchFeed(url);
      const rows = parse(csv, { columns: true, skip_empty_lines: true, relax_column_count: true });
      const mapped = rows.map(rowToDeal).filter(Boolean).sort((a, b) => b.discount - a.discount).slice(0, perFeed);
      for (const m of mapped) deals.push(m.payload);
      console.log(`  awin: ${mapped.length} deals depuis un flux (${rows.length} lignes)`);
    } catch (e) {
      console.warn(`  awin: flux ignoré (${e.message})`);
    }
  }
  return deals;
}

export const _internal = { rowToDeal, NEEDED };
