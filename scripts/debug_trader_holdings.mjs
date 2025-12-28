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

async function getCount(table) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=id&limit=1`, {
    headers: { ...headers, Prefer: 'count=exact' },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status} ${res.statusText}: ${text}`);
  }
  const contentRange = res.headers.get('content-range') || res.headers.get('Content-Range');
  return contentRange || '(no Content-Range header)';
}

async function main() {
  const jobs = await getJson(
    `${SUPABASE_URL}/rest/v1/sync_jobs?select=id,job_type,status,created_at&status=in.(pending,retry)&order=created_at.desc&limit=1`
  );

  if (!Array.isArray(jobs) || jobs.length === 0) {
    console.log('No pending/retry trader_profiles jobs found.');
    return;
  }

  const job = jobs[0];
  console.log('Running job:', { id: job.id, job_type: job.job_type, status: job.status });

  const before = await getCount('trader_holdings');
  console.log('trader_holdings count(before):', before);

  const resp = await postJson(`${SUPABASE_URL}/functions/v1/process-sync-job`, { job_id: job.id });
  console.log('process-sync-job response:', resp);

  const after = await getCount('trader_holdings');
  console.log('trader_holdings count(after):', after);
}

main().catch((e) => {
  console.error('FAILED:', e?.message || e);
  process.exit(1);
});
