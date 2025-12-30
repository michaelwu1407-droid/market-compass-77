export type YahooSymbolHint = {
  symbol: string;
  exchange?: string | null;
  country?: string | null;
  currency?: string | null;
  asset_type?: string | null;
  sector?: string | null;
};

function uniquePreserveOrder(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    const t = String(v || '').trim();
    if (!t) continue;
    if (seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

function mapKnownSuffixes(symbol: string): string {
  // Normalize some upstream suffixes to Yahoo suffixes.
  // Keep this conservative and additive; we also try the original symbol.
  const suffixMappings: Record<string, string> = {
    '.ASX': '.AX',
    '.LON': '.L',
    '.PAR': '.PA',
    '.FRA': '.F',
    '.MIL': '.MI',
    '.MAD': '.MC',
    '.AMS': '.AS',
    '.BRU': '.BR',
    '.STO': '.ST',
    '.HEL': '.HE',
    '.OSL': '.OL',
    '.CPH': '.CO',
    '.SWX': '.SW',
    // Common BullAware-ish suffixes
    '.ZU': '.SW',
    // Some sources store Amsterdam as .NV
    '.NV': '.AS',
    '.TSE': '.TO',
    '.NSE': '.NS',
    '.BSE': '.BO',
    // Some sources store US symbols as .US
    '.US': '',
  };

  for (const [from, to] of Object.entries(suffixMappings)) {
    if (symbol.endsWith(from)) {
      return symbol.slice(0, symbol.length - from.length) + to;
    }
  }

  return symbol;
}

function guessYahooSuffix(hint: YahooSymbolHint): string | null {
  const exchange = String(hint.exchange || '').toUpperCase();
  const country = String(hint.country || '').toUpperCase();
  const currency = String(hint.currency || '').toUpperCase();

  const has = (needle: string) => exchange.includes(needle);

  // Prefer exchange-based inference when present.
  if (has('SIX') || has('SWISS') || country === 'SWITZERLAND' || currency === 'CHF') return '.SW';
  if (has('LONDON') || has('LSE') || country === 'UNITED KINGDOM' || country === 'UK' || currency === 'GBP') return '.L';

  if (has('XETRA')) return '.DE';
  if (has('FRANKFURT')) return '.F';
  if (country === 'GERMANY' && !exchange) return '.DE';

  if (has('AMSTERDAM') || has('EURONEXT AMSTERDAM') || country === 'NETHERLANDS') return '.AS';
  if (has('PARIS') || has('EURONEXT PARIS') || country === 'FRANCE') return '.PA';
  if (has('BRUSSELS') || has('EURONEXT BRUSSELS') || country === 'BELGIUM') return '.BR';

  if (has('MADRID') || country === 'SPAIN') return '.MC';
  if (has('MILAN') || country === 'ITALY') return '.MI';

  if (has('STOCKHOLM') || country === 'SWEDEN') return '.ST';
  if (has('HELSINKI') || country === 'FINLAND') return '.HE';
  if (has('OSLO') || country === 'NORWAY') return '.OL';
  if (has('COPENHAGEN') || country === 'DENMARK') return '.CO';

  if (has('TORONTO') || country === 'CANADA' || currency === 'CAD') return '.TO';
  if (has('ASX') || country === 'AUSTRALIA' || currency === 'AUD') return '.AX';

  // HK is commonly numeric tickers.
  if (has('HONG KONG') || country === 'HONG KONG' || currency === 'HKD') return '.HK';

  // UAE / Dubai / Abu Dhabi
  if (has('DUBAI') || country === 'UNITED ARAB EMIRATES' || country === 'UAE' || currency === 'AED') return '.DU';
  if (has('ABU DHABI')) return '.AD';

  return null;
}

export function yahooSymbolCandidates(hint: YahooSymbolHint): string[] {
  const raw = String(hint.symbol || '').trim().toUpperCase();
  if (!raw) return [];

  const candidates: string[] = [];

  let looksFxPair = false;

  // FX pairs: Yahoo convention is EURUSD=X.
  if (/^[A-Z]{6}$/.test(raw)) {
    const ccy = new Set(['USD', 'EUR', 'GBP', 'JPY', 'CHF', 'CAD', 'AUD', 'NZD']);
    const base = raw.slice(0, 3);
    const quote = raw.slice(3, 6);
    if (ccy.has(base) && ccy.has(quote)) {
      candidates.push(`${raw}=X`);
      looksFxPair = true;
    }
  }

  // Crypto: try SYMBOL-USD when it looks like crypto.
  const assetType = String(hint.asset_type || '').toLowerCase();
  const sector = String(hint.sector || '').toLowerCase();
  const looksCrypto = assetType.includes('crypto') || sector.includes('crypto');
  if (looksCrypto && !raw.includes('-') && !raw.includes('=') && !raw.includes('.')) {
    candidates.push(`${raw}-USD`);
  }

  // Always try the stored symbol first.
  candidates.push(raw);

  // Try known suffix conversions / cleanup.
  const mapped = mapKnownSuffixes(raw);
  if (mapped !== raw) candidates.push(mapped);

  // Numeric-only tickers are often HK.
  if (/^\d{4,5}$/.test(raw) && !raw.includes('.')) {
    candidates.push(`${raw}.HK`);
  }
  if (/^\d{1,3}$/.test(raw) && !raw.includes('.')) {
    candidates.push(`${raw.padStart(4, '0')}.HK`);
  }

  // If it has no suffix, infer from exchange/country/currency.
  if (!raw.includes('.')) {
    const suffix = guessYahooSuffix(hint);
    if (suffix) {
      candidates.push(`${raw}${suffix}`);
    } else if (!looksFxPair && !looksCrypto) {
      // If we have no reliable location hints, try a small set of common Yahoo
      // exchange suffixes as a fallback.
      //
      // Important: keep this list short to avoid excessive Yahoo requests.
      // Only attempt this for symbols that look like non-US tickers (typically >= 4 chars).
      const looksLikeEquityTicker = raw.length >= 4 && /^[A-Z0-9-]+$/.test(raw);
      if (looksLikeEquityTicker) {
        const fallbackSuffixes = [
          '.SW', // Switzerland (SIX)
          '.L',  // London
          '.AS', // Amsterdam
          '.PA', // Paris
          '.DE', // XETRA
          '.F',  // Frankfurt
          '.MI', // Milan
          '.MC', // Madrid
          '.ST', // Stockholm
          '.HE', // Helsinki
          '.OL', // Oslo
          '.CO', // Copenhagen
        ];

        for (const s of fallbackSuffixes) {
          candidates.push(`${raw}${s}`);
        }
      }
    }
  }

  return uniquePreserveOrder(candidates);
}
