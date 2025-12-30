import fs from 'node:fs';

function getEnvFromDotEnv(key) {
  const env = fs.readFileSync('.env', 'utf8');
  const m = env.match(new RegExp(`${key}="([^"]+)"`));
  return m ? m[1] : null;
}

const baseUrl = getEnvFromDotEnv('VITE_SUPABASE_URL');
const anonKey = getEnvFromDotEnv('VITE_SUPABASE_ANON_KEY');

if (!baseUrl || !anonKey) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env');
}

const symbols = process.argv.slice(2);
if (symbols.length === 0) {
  console.error('Usage: node scripts/query-assets.mjs SYMBOL1 SYMBOL2 ...');
  process.exit(2);
}

const url = new URL(baseUrl.replace(/\/+$/, '') + '/rest/v1/assets');
url.searchParams.set('select', 'symbol,name,asset_type,exchange,country,instrument_id,market_cap,sector');
url.searchParams.set('symbol', `in.(${symbols.join(',')})`);

const res = await fetch(url, {
  headers: {
    apikey: anonKey,
    Authorization: `Bearer ${anonKey}`,
  },
});

console.log('status', res.status);
const text = await res.text();
console.log(text);
