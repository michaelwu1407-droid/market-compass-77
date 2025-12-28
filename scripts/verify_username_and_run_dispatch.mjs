import fs from 'node:fs';

function parseDotEnv(text) {
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    if (!line || line.trim().startsWith('#')) continue;
    const m = line.match(/^([^=]+)=(.*)$/);
    if (!m) continue;
    const key = m[1].trim();
    let value = m[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

const envText = fs.readFileSync(new URL('../.env', import.meta.url), 'utf8');
const env = parseDotEnv(envText);
const SUPABASE_URL = env.VITE_SUPABASE_URL;
const ANON_KEY = env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !ANON_KEY) {
  console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env');
  process.exit(1);
}

const headers = {
  apikey: ANON_KEY,
  Authorization: `Bearer ${ANON_KEY}`,
  'Content-Type': 'application/json',
};

async function getCount(pathQuery) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${pathQuery}`, {
    headers: { ...headers, Prefer: 'count=exact' },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status} ${res.statusText}: ${text}`);
  }
  const cr = res.headers.get('content-range') || res.headers.get('Content-Range');
  return cr || '';
}

function parseTotalFromContentRange(cr) {
  // Formats: "0-0/123" or "*/0"
  const slash = cr.lastIndexOf('/');
  if (slash === -1) return null;
  const total = cr.slice(slash + 1).trim();
  const n = Number(total);
  return Number.isFinite(n) ? n : null;
}

async function getJson(url) {
  const res = await fetch(url, { headers });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${text}`);
  return text ? JSON.parse(text) : null;
}

async function postJson(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${text}`);
  return text ? JSON.parse(text) : null;
}

async function main() {
  // 1) Verify `traders.username` is selectable
  const traders = await getJson(`${SUPABASE_URL}/rest/v1/traders?select=id,etoro_username,username&limit=1`);
  console.log('traders select ok. sample row:', traders?.[0] ?? null);

  // 2) Check pending count before
  const beforeCR = await getCount(`sync_jobs?select=id&status=eq.pending&limit=1`);
  const before = parseTotalFromContentRange(beforeCR);
  console.log('sync_jobs pending(before):', beforeCR, '=>', before);

  // 3) Run one dispatch batch (processes up to 10 jobs)
  const dispatch = await postJson(`${SUPABASE_URL}/functions/v1/dispatch-sync-jobs`, {});
  console.log('dispatch-sync-jobs:', dispatch);

  // 4) Check pending count after
  const afterCR = await getCount(`sync_jobs?select=id&status=eq.pending&limit=1`);
  const after = parseTotalFromContentRange(afterCR);
  console.log('sync_jobs pending(after):', afterCR, '=>', after);
}

main().catch((e) => {
  console.error('FAILED:', e?.message || e);
  process.exit(1);
});
