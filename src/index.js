import { getConfig, postDeal } from './drip.js';
import { fromAwin } from './sources/awin.js';
import { fromShopify } from './sources/shopify.js';
import { fromSites } from './sources/jsonld.js';

const DRY = process.env.DRY_RUN === '1';
const MAX_PER_RUN = Number(process.env.MAX_PER_RUN || 20);

// One or more target sites, comma-separated. Both share the same INGEST_API_KEY.
const TARGETS = (process.env.DRIP_TARGETS || process.env.DRIP_BASE_URL || 'https://driptestv2.netlify.app')
  .split(',')
  .map((s) => s.trim().replace(/\/$/, ''))
  .filter(Boolean);

async function main() {
  console.log(`▶ drip-bot ${DRY ? '(DRY RUN)' : ''} — ${new Date().toISOString()}`);
  console.log(`cibles: ${TARGETS.join(', ')}`);

  // Read each target's config; keep only the enabled, reachable ones.
  const active = [];
  for (const base of TARGETS) {
    try {
      const c = await getConfig(base);
      console.log(`  ${base}: enabled=${c.enabled} autoPublish=${c.autoPublish} sites=${c.sites.length}`);
      if (c.enabled) active.push({ base, ...c });
    } catch (e) {
      console.warn(`  ${base}: ${e.message} — cible ignorée`);
    }
  }
  if (active.length === 0) {
    console.log('Aucune cible active — rien à faire.');
    return;
  }

  // Gather candidate deals once (sources are site-independent; jsonld scans the
  // union of every target's admin site list).
  console.log('Sources :');
  const allSites = [...new Set(active.flatMap((t) => t.sites))];
  const [awinDeals, shopifyDeals, siteDeals] = await Promise.all([
    fromAwin({ perFeed: Number(process.env.AWIN_PER_FEED || 5) }),
    fromShopify({ perStore: Number(process.env.SHOPIFY_PER_STORE || 4) }),
    fromSites(allSites),
  ]);

  const seen = new Set();
  const candidates = [...shopifyDeals, ...awinDeals, ...siteDeals]
    .filter((d) => {
      if (seen.has(d.merchantUrl)) return false;
      seen.add(d.merchantUrl);
      return true;
    })
    .slice(0, MAX_PER_RUN);

  console.log(`\n${candidates.length} deal(s) candidat(s).`);
  if (DRY) {
    for (const d of candidates) {
      const pct = Math.round((1 - d.priceAfterCents / d.priceBeforeCents) * 100);
      console.log(`  [dry] ${d.genderSlug}/${d.categorySlug}/${d.subSlug} · -${pct}% · ${d.title}`);
    }
    return;
  }

  // Post every candidate to every active target (each site dedupes server-side).
  for (const t of active) {
    let posted = 0;
    let dupes = 0;
    let skipped = 0;
    for (const d of candidates) {
      try {
        const res = await postDeal(t.base, d);
        if (res.skipped) skipped++;
        else if (res.duplicate) dupes++;
        else posted++;
      } catch (e) {
        skipped++;
        console.warn(`  ⚠ ${t.base}: ${e.message}`);
      }
    }
    console.log(`${t.base} → ${posted} publié(s), ${dupes} doublon(s), ${skipped} ignoré(s)`);
  }
}

main().catch((e) => {
  console.error('❌ drip-bot a échoué :', e.message);
  process.exit(1);
});
