(async () => {
  try {
    const fs = await import('node:fs');

    const env = fs.readFileSync('.env', 'utf8');
    const match = env.match(/VITE_SUPABASE_ANON_KEY="([^"]+)"/);
    if (!match) {
      throw new Error('Missing VITE_SUPABASE_ANON_KEY in .env');
    }

    const anonKey = match[1];

    const cliArgs = process.argv.slice(2);

    // Usage:
    // 1) JSON body as a single arg (best-effort): node scripts/invoke-fetch-daily-prices.js '{"debug_failed":true}'
    // 2) Flags: node scripts/invoke-fetch-daily-prices.js --debug_failed --dry_run --max_assets=10 --failed_limit=50
    // 3) Optional URL as the last arg: ... https://.../fetch-daily-prices

    let url = 'https://xgvaibxxiwfraklfbwey.functions.supabase.co/fetch-daily-prices';
    const lastArg = cliArgs[cliArgs.length - 1];
    if (lastArg && /^https?:\/\//i.test(lastArg)) {
      url = lastArg;
      cliArgs.pop();
    }

    let body = {};
    const first = cliArgs[0];
    if (first && String(first).trim().startsWith('{')) {
      let normalizedArg = String(first).trim();
      if (normalizedArg.startsWith("'")) normalizedArg = normalizedArg.slice(1);
      if (normalizedArg.endsWith("'")) normalizedArg = normalizedArg.slice(0, -1);
      if (normalizedArg.startsWith('"')) normalizedArg = normalizedArg.slice(1);
      if (normalizedArg.endsWith('"')) normalizedArg = normalizedArg.slice(0, -1);
      try {
        body = JSON.parse(normalizedArg);
      } catch (e) {
        console.error('Failed to parse JSON arg:', normalizedArg.slice(0, 300));
        throw e;
      }
    } else {
      for (const arg of cliArgs) {
        const s = String(arg);
        if (!s.startsWith('--')) continue;

        const [rawKey, rawValue] = s.slice(2).split('=', 2);
        const key = rawKey.trim();
        const value = rawValue === undefined ? true : rawValue;

        if (value === 'true') body[key] = true;
        else if (value === 'false') body[key] = false;
        else if (typeof value === 'string' && /^-?\d+$/.test(value)) body[key] = Number(value);
        else body[key] = value;
      }
    }

    const res = await fetch(
      url,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${anonKey}`,
        },
        body: JSON.stringify(body ?? {}),
      },
    );

    console.log('status', res.status);
    const text = await res.text();
    console.log(text);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();
