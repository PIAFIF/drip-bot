import { getConfig, postDeal } from './drip.js';
import { fromAwin } from './sources/awin.js';
import { fromSites } from './sources/jsonld.js';

const DRY = process.env.DRY_RUN === '1';
const MAX_PER_RUN = Number(process.env.MAX_PER_RUN || 20);

async function main() {
  console.log(`▶ drip-bot ${DRY ? '(DRY RUN)' : ''} — ${new Date().toISOString()}`);

  const config = await getConfig();
  console.log(`config: enabled=${config.enabled} autoPublish=${config.autoPublish} sites=${config.sites.length}`);
  if (!config.enabled) {
    console.log('Bot désactivé depuis l’admin — rien à faire.');
    return;
  }

  // Gather candidate deals from every source.
  console.log('Sources :');
  const [awinDeals, siteDeals] = await Promise.all([
    fromAwin({ perFeed: Number(process.env.AWIN_PER_FEED || 5) }),
    fromSites(config.sites),
  ]);

  // Dedupe within this run by merchant URL, cap the batch (server also dedupes
  // against already-published deals).
  const seen = new Set();
  const candidates = [...awinDeals, ...siteDeals].filter((d) => {
    if (seen.has(d.merchantUrl)) return false;
    seen.add(d.merchantUrl);
    return true;
  }).slice(0, MAX_PER_RUN);

  console.log(`\n${candidates.length} deal(s) candidat(s) à envoyer.`);
  if (DRY) {
    for (const d of candidates) {
      const pct = Math.round((1 - d.priceAfterCents / d.priceBeforeCents) * 100);
      console.log(`  [dry] ${d.genderSlug}/${d.categorySlug}/${d.subSlug} · -${pct}% · ${d.title}`);
    }
    return;
  }

  let posted = 0;
  let dupes = 0;
  let skipped = 0;
  for (const d of candidates) {
    try {
      const res = await postDeal(d);
      if (res.skipped) skipped++;
      else if (res.duplicate) dupes++;
      else {
        posted++;
        console.log(`  ✅ ${res.status} · ${d.title}`);
      }
    } catch (e) {
      skipped++;
      console.warn(`  ⚠ ${e.message}`);
    }
  }
  console.log(`\nTerminé : ${posted} publié(s), ${dupes} doublon(s), ${skipped} ignoré(s).`);
}

main().catch((e) => {
  console.error('❌ drip-bot a échoué :', e.message);
  process.exit(1);
});
