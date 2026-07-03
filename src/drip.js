// Thin client for the Drip ingestion API (drip-app/src/app/api/ingest/deals).

const BASE = (process.env.DRIP_BASE_URL || 'https://drip-fr.netlify.app').replace(/\/$/, '');
const KEY = process.env.INGEST_API_KEY || '';
const INGEST = `${BASE}/api/ingest/deals`;

function headers() {
  return { 'content-type': 'application/json', 'x-api-key': KEY };
}

// Reads the bot config the admin controls from the back office: whether the bot
// is enabled, whether posts auto-publish, and the list of sites to scan.
export async function getConfig() {
  const res = await fetch(INGEST, { headers: headers() });
  if (res.status === 401) throw new Error('INGEST_API_KEY invalide (401). Vérifie la clé côté Netlify et côté bot.');
  if (!res.ok) throw new Error(`GET config a échoué : ${res.status}`);
  return res.json(); // { enabled, autoPublish, sites }
}

// Posts one deal. Returns { status, duplicate? } on success, throws on hard error.
export async function postDeal(payload) {
  const res = await fetch(INGEST, { method: 'POST', headers: headers(), body: JSON.stringify(payload) });
  const body = await res.json().catch(() => ({}));
  if (res.status === 503) return { skipped: 'bot_disabled' };
  if (res.status === 422) return { skipped: 'validation', detail: body.error };
  if (!res.ok && res.status !== 200 && res.status !== 201) {
    throw new Error(`POST deal a échoué : ${res.status} ${JSON.stringify(body)}`);
  }
  return { status: body.status, duplicate: !!body.duplicate, id: body.id, slug: body.slug };
}
