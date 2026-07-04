// Thin client for the Drip ingestion API (drip-app/src/app/api/ingest/deals).
// Supports several target sites (e.g. driptestv2 + drip-fr) sharing one API key.

const KEY = process.env.INGEST_API_KEY || '';

const ingestUrl = (base) => `${base.replace(/\/$/, '')}/api/ingest/deals`;
const headers = () => ({ 'content-type': 'application/json', 'x-api-key': KEY });

// Reads a site's bot config the admin controls from the back office: whether the
// bot is enabled, whether posts auto-publish, and the list of sites to scan.
export async function getConfig(base) {
  const res = await fetch(ingestUrl(base), { headers: headers() });
  if (res.status === 401) throw new Error('401 — INGEST_API_KEY absente/incorrecte sur ce site');
  if (!res.ok) throw new Error(`GET config ${res.status}`);
  return res.json(); // { enabled, autoPublish, sites }
}

// Posts one deal to one site. Returns { status, duplicate? } on success.
export async function postDeal(base, payload) {
  const res = await fetch(ingestUrl(base), { method: 'POST', headers: headers(), body: JSON.stringify(payload) });
  const body = await res.json().catch(() => ({}));
  if (res.status === 503) return { skipped: 'bot_disabled' };
  if (res.status === 401) return { skipped: 'unauthorized' };
  if (res.status === 422) return { skipped: 'validation', detail: body.error };
  if (!res.ok && res.status !== 200 && res.status !== 201) {
    throw new Error(`POST ${res.status} ${JSON.stringify(body)}`);
  }
  return { status: body.status, duplicate: !!body.duplicate, id: body.id, slug: body.slug };
}
