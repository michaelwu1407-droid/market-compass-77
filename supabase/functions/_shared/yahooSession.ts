type YahooSession = {
  crumb: string;
  cookie: string;
  expiresAt: number;
};

let cached: YahooSession | null = null;

function nowMs(): number {
  return Date.now();
}

function buildCookieHeader(setCookies: string[]): string {
  // Keep only the cookie name/value part (before ';').
  const parts = setCookies
    .map((c) => String(c || '').split(';')[0].trim())
    .filter(Boolean);
  return parts.join('; ');
}

function getSetCookies(resp: Response): string[] {
  const headers: any = resp.headers as any;
  if (typeof headers.getSetCookie === 'function') {
    return headers.getSetCookie();
  }

  const single = resp.headers.get('set-cookie');
  return single ? [single] : [];
}

export async function getYahooSession(): Promise<{ crumb: string; cookie: string } | null> {
  const existing = cached;
  if (existing && existing.expiresAt > nowMs()) {
    return { crumb: existing.crumb, cookie: existing.cookie };
  }

  try {
    // Step 1: get a session cookie (B=...) via fc.yahoo.com.
    const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
    const fcResp = await fetch('https://fc.yahoo.com', {
      headers: {
        'User-Agent': ua,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });

    const setCookies = getSetCookies(fcResp);
    const cookie = buildCookieHeader(setCookies);
    if (!cookie) {
      return null;
    }

    // Step 2: fetch crumb bound to that cookie.
    const crumbResp = await fetch('https://query1.finance.yahoo.com/v1/test/getcrumb', {
      headers: {
        'User-Agent': ua,
        'Accept': 'text/plain,*/*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cookie': cookie,
      },
    });

    if (!crumbResp.ok) {
      return null;
    }

    const crumb = (await crumbResp.text()).trim();
    if (!crumb) {
      return null;
    }

    // Cache briefly to reduce extra requests.
    cached = {
      crumb,
      cookie,
      expiresAt: nowMs() + 10 * 60 * 1000,
    };

    return { crumb, cookie };
  } catch {
    return null;
  }
}
