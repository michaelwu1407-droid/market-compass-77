import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// CORRECT BULLAWARE API ENDPOINTS
const BULLAWARE_BASE = 'https://api.bullaware.com/v1';
const ENDPOINTS = {
  investors: `${BULLAWARE_BASE}/investors`,
  investorDetails: (username: string) => `${BULLAWARE_BASE}/investors/${username}`, // Contains monthlyReturns, yearlyReturns, profitableWeeksPct, etc.
  portfolio: (username: string) => `${BULLAWARE_BASE}/investors/${username}/portfolio`,
  portfolioHistory: (username: string) => `${BULLAWARE_BASE}/investors/${username}/history`, // Portfolio composition over time
  trades: (username: string) => `${BULLAWARE_BASE}/investors/${username}/trades`,
  metrics: (username: string) => `${BULLAWARE_BASE}/investors/${username}/metrics`,
  metricsHistory: (username: string) => `${BULLAWARE_BASE}/investors/${username}/metrics/history`, // Equity curve over time
  riskScore: (username: string) => `${BULLAWARE_BASE}/investors/${username}/risk-score/monthly`,
  instruments: `${BULLAWARE_BASE}/instruments`,
};

const BATCH_SIZE_TRADERS = 10; // Traders per page from Bullaware
const BATCH_SIZE_DETAILS = 2; // Trader details to sync per run (reduced to avoid rate limits)
const RATE_LIMIT_DELAY_MS = 6000; // 6 seconds between Bullaware calls (10 req/min limit)
const STALE_HOURS_DETAILS = 2; // Consider trader details stale after 2 hours
const STALE_HOURS_ASSETS = 24; // Consider assets stale after 24 hours
const STALE_HOURS_TRADERS = 6; // Re-paginate traders list every 6 hours

interface SyncState {
  id: string;
  last_run: string | null;
  last_page: number;
  total_pages: number | null;
  status: string;
  metadata: Record<string, unknown>;
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isStale(lastRun: string | null, hoursThreshold: number): boolean {
  if (!lastRun) return true;
  const lastRunDate = new Date(lastRun);
  const now = new Date();
  const hoursDiff = (now.getTime() - lastRunDate.getTime()) / (1000 * 60 * 60);
  return hoursDiff >= hoursThreshold;
}

// Parse AUM value string like "5M" or "300K" to number
function parseAumValue(str: string): number | null {
  const cleaned = str.replace(/[^0-9.kmb+]/g, '');
  const num = parseFloat(cleaned);
  if (isNaN(num)) return null;
  
  if (str.includes('b')) return num * 1_000_000_000;
  if (str.includes('m')) return num * 1_000_000;
  if (str.includes('k')) return num * 1_000;
  return num;
}

// Parse AUM strings like "$5M+", "$100K-$300K" to numeric values
function parseAum(aumStr: string | number | null | undefined): number | null {
  if (aumStr === null || aumStr === undefined) return null;
  if (typeof aumStr === 'number') return aumStr;
  
  const str = String(aumStr).replace(/[$,]/g, '').toLowerCase();
  
  // Handle ranges like "100k-300k" - take midpoint
  if (str.includes('-')) {
    const parts = str.split('-');
    const low = parseAumValue(parts[0]);
    const high = parseAumValue(parts[1]);
    if (low !== null && high !== null) return (low + high) / 2;
    return low || high;
  }
  
  return parseAumValue(str);
}

// Sector mapping for common stocks
const SECTOR_MAP: Record<string, string> = {
  // Technology
  'AAPL': 'Technology', 'MSFT': 'Technology', 'GOOG': 'Technology', 'GOOGL': 'Technology',
  'AMZN': 'Technology', 'META': 'Technology', 'NVDA': 'Technology', 'TSM': 'Technology',
  'AVGO': 'Technology', 'ORCL': 'Technology', 'CSCO': 'Technology', 'ACN': 'Technology',
  'ADBE': 'Technology', 'CRM': 'Technology', 'AMD': 'Technology', 'INTC': 'Technology',
  'QCOM': 'Technology', 'IBM': 'Technology', 'TXN': 'Technology', 'INTU': 'Technology',
  'AMAT': 'Technology', 'MU': 'Technology', 'NOW': 'Technology', 'PANW': 'Technology',
  'LRCX': 'Technology', 'KLAC': 'Technology', 'SNPS': 'Technology', 'CDNS': 'Technology',
  'ADSK': 'Technology', 'CRWD': 'Technology', 'ANET': 'Technology', 'MRVL': 'Technology',
  'PLTR': 'Technology', 'APP': 'Technology', 'NET': 'Technology', 'TEAM': 'Technology',
  'DDOG': 'Technology', 'SNOW': 'Technology', 'ZS': 'Technology', 'HUBS': 'Technology',
  'ISRG': 'Technology', 'APH': 'Technology', 'EME': 'Technology', 'GEV': 'Technology',
  
  // Financials
  'JPM': 'Financials', 'BAC': 'Financials', 'WFC': 'Financials', 'GS': 'Financials',
  'MS': 'Financials', 'C': 'Financials', 'BLK': 'Financials', 'SCHW': 'Financials',
  'AXP': 'Financials', 'BX': 'Financials', 'CB': 'Financials', 'MMC': 'Financials',
  'PGR': 'Financials', 'ICE': 'Financials', 'CME': 'Financials', 'AON': 'Financials',
  'USB': 'Financials', 'TFC': 'Financials', 'COF': 'Financials', 'MET': 'Financials',
  'V': 'Financials', 'MA': 'Financials', 'PYPL': 'Financials', 'SQ': 'Financials',
  
  // Healthcare
  'UNH': 'Healthcare', 'JNJ': 'Healthcare', 'LLY': 'Healthcare', 'ABBV': 'Healthcare',
  'MRK': 'Healthcare', 'PFE': 'Healthcare', 'TMO': 'Healthcare', 'ABT': 'Healthcare',
  'DHR': 'Healthcare', 'BMY': 'Healthcare', 'AMGN': 'Healthcare', 'GILD': 'Healthcare',
  'CVS': 'Healthcare', 'ELV': 'Healthcare', 'MDT': 'Healthcare', 'SYK': 'Healthcare',
  'CI': 'Healthcare', 'ZTS': 'Healthcare', 'BSX': 'Healthcare', 'VRTX': 'Healthcare',
  'REGN': 'Healthcare', 'HUM': 'Healthcare', 'MCK': 'Healthcare', 'BIIB': 'Healthcare',
  
  // Consumer
  'TSLA': 'Consumer Discretionary', 'HD': 'Consumer Discretionary', 'MCD': 'Consumer Discretionary',
  'NKE': 'Consumer Discretionary', 'SBUX': 'Consumer Discretionary', 'LOW': 'Consumer Discretionary',
  'TJX': 'Consumer Discretionary', 'BKNG': 'Consumer Discretionary', 'CMG': 'Consumer Discretionary',
  'ORLY': 'Consumer Discretionary', 'AZO': 'Consumer Discretionary', 'ROST': 'Consumer Discretionary',
  'DG': 'Consumer Discretionary', 'DLTR': 'Consumer Discretionary', 'EBAY': 'Consumer Discretionary',
  'MELI': 'Consumer Discretionary', 'UBER': 'Consumer Discretionary', 'ABNB': 'Consumer Discretionary',
  'TPR': 'Consumer Discretionary',
  
  'PG': 'Consumer Staples', 'KO': 'Consumer Staples', 'PEP': 'Consumer Staples',
  'COST': 'Consumer Staples', 'WMT': 'Consumer Staples', 'PM': 'Consumer Staples',
  'MO': 'Consumer Staples', 'MDLZ': 'Consumer Staples', 'CL': 'Consumer Staples',
  'KMB': 'Consumer Staples', 'KHC': 'Consumer Staples', 'GIS': 'Consumer Staples',
  
  // Industrials
  'GE': 'Industrials', 'CAT': 'Industrials', 'HON': 'Industrials', 'UNP': 'Industrials',
  'UPS': 'Industrials', 'RTX': 'Industrials', 'BA': 'Industrials', 'LMT': 'Industrials',
  'DE': 'Industrials', 'MMM': 'Industrials', 'GD': 'Industrials', 'NOC': 'Industrials',
  'FDX': 'Industrials', 'EMR': 'Industrials', 'CSX': 'Industrials', 'NSC': 'Industrials',
  
  // Energy
  'XOM': 'Energy', 'CVX': 'Energy', 'COP': 'Energy', 'SLB': 'Energy',
  'EOG': 'Energy', 'MPC': 'Energy', 'VLO': 'Energy', 'PSX': 'Energy',
  'OXY': 'Energy', 'PXD': 'Energy', 'HES': 'Energy', 'DVN': 'Energy',
  
  // Materials
  'LIN': 'Materials', 'APD': 'Materials', 'SHW': 'Materials', 'ECL': 'Materials',
  'FCX': 'Materials', 'NEM': 'Materials', 'NUE': 'Materials', 'DOW': 'Materials',
  'DD': 'Materials', 'PPG': 'Materials', 'VMC': 'Materials', 'MLM': 'Materials',
  'MT.NV': 'Materials',
  
  // Real Estate
  'AMT': 'Real Estate', 'PLD': 'Real Estate', 'CCI': 'Real Estate', 'EQIX': 'Real Estate',
  'SPG': 'Real Estate', 'O': 'Real Estate', 'PSA': 'Real Estate', 'DLR': 'Real Estate',
  
  // Utilities
  'NEE': 'Utilities', 'DUK': 'Utilities', 'SO': 'Utilities', 'D': 'Utilities',
  'AEP': 'Utilities', 'SRE': 'Utilities', 'EXC': 'Utilities', 'XEL': 'Utilities',
  
  // Communication
  'DIS': 'Communication', 'NFLX': 'Communication', 'CMCSA': 'Communication',
  'T': 'Communication', 'VZ': 'Communication', 'TMUS': 'Communication',
  'CHTR': 'Communication', 'EA': 'Communication', 'ATVI': 'Communication',
  'WBD': 'Communication', 'PARA': 'Communication', 'TTWO': 'Communication',
  
// European stocks - Germany
  'SIE.DE': 'Industrials', 'CBK.DE': 'Financials', 'HEI.DE': 'Industrials',
  'ENR.DE': 'Utilities', 'DBV.PA': 'Healthcare', 'ABVX.PA': 'Healthcare',
  'SAP.DE': 'Technology', 'ALV.DE': 'Financials', 'DTE.DE': 'Communication',
  'BAS.DE': 'Materials', 'BMW.DE': 'Consumer Discretionary', 'MBG.DE': 'Consumer Discretionary',
  'VOW3.DE': 'Consumer Discretionary', 'ADS.DE': 'Consumer Discretionary', 'MUV2.DE': 'Financials',
  
  // European stocks - France
  'OR.PA': 'Consumer Staples', 'MC.PA': 'Consumer Discretionary', 'SAN.PA': 'Healthcare',
  'BNP.PA': 'Financials', 'AI.PA': 'Industrials', 'AIR.PA': 'Industrials',
  'TTE.PA': 'Energy', 'SU.PA': 'Materials', 'CAP.PA': 'Technology',
  
  // European stocks - Spain
  'SAN.MC': 'Financials', 'CABK.MC': 'Financials', 'FER.MC': 'Industrials',
  'TEF.MC': 'Communication', 'ITX.MC': 'Consumer Discretionary', 'IBE.MC': 'Utilities',
  
  // European stocks - Italy
  'UCG.MI': 'Financials', 'ENI.MI': 'Energy', 'ISP.MI': 'Financials',
  'ENEL.MI': 'Utilities', 'STM.MI': 'Technology',
  
  // UK stocks
  'RR.L': 'Industrials', 'IAG.L': 'Industrials', 'HSBA.L': 'Financials', 
  'BP.L': 'Energy', 'SHEL.L': 'Energy', 'ULVR.L': 'Consumer Staples',
  'AZN.L': 'Healthcare', 'GSK.L': 'Healthcare', 'RIO.L': 'Materials',
  'BHP.L': 'Materials', 'LLOY.L': 'Financials', 'BARC.L': 'Financials',
  'VOD.L': 'Communication', 'DGE.L': 'Consumer Staples', 'REL.L': 'Communication',
  'LSEG.L': 'Financials', 'BA.L': 'Industrials', 'AAL.L': 'Materials',
  'NG.L': 'Utilities', 'SSE.L': 'Utilities',
  
  // Swiss stocks
  'NESN.SW': 'Consumer Staples', 'NOVN.SW': 'Healthcare', 'ROG.SW': 'Healthcare',
  'UBS.SW': 'Financials', 'CS.SW': 'Financials', 'ZURN.SW': 'Financials',
  'ABB.SW': 'Industrials', 'SIKA.SW': 'Materials',
  
  // Netherlands
  'ASML.AS': 'Technology', 'INGA.AS': 'Financials', 'UNA.AS': 'Consumer Staples',
  'PHIA.AS': 'Healthcare', 'HEIA.AS': 'Consumer Staples',
};

// US Exchange mapping for well-known stocks
const US_EXCHANGE_MAP: Record<string, string> = {
  // NASDAQ
  'AAPL': 'NASDAQ', 'MSFT': 'NASDAQ', 'GOOG': 'NASDAQ', 'GOOGL': 'NASDAQ',
  'AMZN': 'NASDAQ', 'META': 'NASDAQ', 'NVDA': 'NASDAQ', 'AVGO': 'NASDAQ',
  'CSCO': 'NASDAQ', 'ADBE': 'NASDAQ', 'AMD': 'NASDAQ', 'INTC': 'NASDAQ',
  'QCOM': 'NASDAQ', 'TXN': 'NASDAQ', 'INTU': 'NASDAQ', 'AMAT': 'NASDAQ',
  'MU': 'NASDAQ', 'LRCX': 'NASDAQ', 'KLAC': 'NASDAQ', 'SNPS': 'NASDAQ',
  'CDNS': 'NASDAQ', 'ADSK': 'NASDAQ', 'MRVL': 'NASDAQ', 'NFLX': 'NASDAQ',
  'CMCSA': 'NASDAQ', 'COST': 'NASDAQ', 'PEP': 'NASDAQ', 'SBUX': 'NASDAQ',
  'PYPL': 'NASDAQ', 'ISRG': 'NASDAQ', 'REGN': 'NASDAQ', 'VRTX': 'NASDAQ',
  'GILD': 'NASDAQ', 'AMGN': 'NASDAQ', 'BIIB': 'NASDAQ', 'BKNG': 'NASDAQ',
  'CHTR': 'NASDAQ', 'TMUS': 'NASDAQ', 'ADP': 'NASDAQ', 'PANW': 'NASDAQ',
  'CRWD': 'NASDAQ', 'ANET': 'NASDAQ', 'PLTR': 'NASDAQ', 'APP': 'NASDAQ',
  'EBAY': 'NASDAQ', 'MELI': 'NASDAQ', 'TEAM': 'NASDAQ', 'DDOG': 'NASDAQ',
  'SNOW': 'NASDAQ', 'ZS': 'NASDAQ', 'NET': 'NASDAQ', 'HUBS': 'NASDAQ',
  'TSLA': 'NASDAQ', 'EA': 'NASDAQ', 'TTWO': 'NASDAQ',
  
  // NYSE
  'JPM': 'NYSE', 'V': 'NYSE', 'UNH': 'NYSE', 'JNJ': 'NYSE', 'WMT': 'NYSE',
  'MA': 'NYSE', 'PG': 'NYSE', 'XOM': 'NYSE', 'HD': 'NYSE', 'CVX': 'NYSE',
  'LLY': 'NYSE', 'ABBV': 'NYSE', 'MRK': 'NYSE', 'PFE': 'NYSE', 'BAC': 'NYSE',
  'KO': 'NYSE', 'TMO': 'NYSE', 'ABT': 'NYSE', 'DHR': 'NYSE', 'DIS': 'NYSE',
  'CRM': 'NYSE', 'MCD': 'NYSE', 'ACN': 'NYSE', 'VZ': 'NYSE', 'BMY': 'NYSE',
  'NKE': 'NYSE', 'PM': 'NYSE', 'WFC': 'NYSE', 'T': 'NYSE', 'ORCL': 'NYSE',
  'UNP': 'NYSE', 'UPS': 'NYSE', 'GE': 'NYSE', 'GS': 'NYSE', 'MS': 'NYSE',
  'C': 'NYSE', 'BLK': 'NYSE', 'CAT': 'NYSE', 'HON': 'NYSE', 'IBM': 'NYSE',
  'RTX': 'NYSE', 'BA': 'NYSE', 'LMT': 'NYSE', 'DE': 'NYSE', 'LOW': 'NYSE',
  'SLB': 'NYSE', 'CVS': 'NYSE', 'MDT': 'NYSE', 'SYK': 'NYSE', 'CI': 'NYSE',
  'ELV': 'NYSE', 'SO': 'NYSE', 'DUK': 'NYSE', 'NEE': 'NYSE', 'D': 'NYSE',
  'COP': 'NYSE', 'MMM': 'NYSE', 'GD': 'NYSE', 'NOC': 'NYSE', 'FDX': 'NYSE',
  'EMR': 'NYSE', 'APD': 'NYSE', 'SHW': 'NYSE', 'ECL': 'NYSE', 'LIN': 'NYSE',
  'UBER': 'NYSE', 'ABNB': 'NYSE', 'SQ': 'NYSE', 'TPR': 'NYSE', 'GEV': 'NYSE',
  'APH': 'NYSE', 'EME': 'NYSE', 'NOW': 'NYSE',
};

// Static mapping of eToro instrumentId to symbol for common instruments
// This is the primary source since Bullaware API only returns ~10 entries
const INSTRUMENT_ID_MAP: Record<string, { symbol: string; type: string }> = {
  // Cryptocurrencies
  '1001': { symbol: 'BTC', type: 'crypto' },
  '5888': { symbol: 'BTC', type: 'crypto' },
  '1002': { symbol: 'ETH', type: 'crypto' },
  '1009': { symbol: 'XRP', type: 'crypto' },
  '1006': { symbol: 'LTC', type: 'crypto' },
  '1007': { symbol: 'DASH', type: 'crypto' },
  '1058': { symbol: 'ADA', type: 'crypto' },
  '1060': { symbol: 'IOTA', type: 'crypto' },
  '1064': { symbol: 'XLM', type: 'crypto' },
  '1072': { symbol: 'EOS', type: 'crypto' },
  '1081': { symbol: 'BNB', type: 'crypto' },
  '1135': { symbol: 'SOL', type: 'crypto' },
  '1159': { symbol: 'DOGE', type: 'crypto' },
  '1238': { symbol: 'AVAX', type: 'crypto' },
  '1239': { symbol: 'MATIC', type: 'crypto' },
  
  // Major US Tech Stocks
  '1': { symbol: 'AAPL', type: 'stock' },
  '2': { symbol: 'MSFT', type: 'stock' },
  '4': { symbol: 'GOOG', type: 'stock' },
  '5': { symbol: 'AMZN', type: 'stock' },
  '6': { symbol: 'META', type: 'stock' },
  '7': { symbol: 'NVDA', type: 'stock' },
  '8': { symbol: 'TSLA', type: 'stock' },
  '10': { symbol: 'NFLX', type: 'stock' },
  '18': { symbol: 'GOLD', type: 'commodity' },
  '91': { symbol: 'OIL', type: 'commodity' },
  '310': { symbol: 'EUR/USD', type: 'forex' },
  
  // Palantir and other popular stocks (discovered from logs)
  '10215': { symbol: 'PLTR', type: 'stock' },
  '2402': { symbol: 'INTC', type: 'stock' },
  '2342': { symbol: 'AMD', type: 'stock' },
  '1137': { symbol: 'SPY', type: 'etf' },
  '1125': { symbol: 'QQQ', type: 'etf' },
  '1111': { symbol: 'DIA', type: 'etf' },
  '1150': { symbol: 'IWM', type: 'etf' },
  '2918': { symbol: 'ARKK', type: 'etf' },
  '4278': { symbol: 'COIN', type: 'stock' },
  '7991': { symbol: 'RIVN', type: 'stock' },
  '8897': { symbol: 'SMCI', type: 'stock' },
  
  // Additional common stocks
  '100': { symbol: 'JPM', type: 'stock' },
  '101': { symbol: 'BAC', type: 'stock' },
  '102': { symbol: 'V', type: 'stock' },
  '103': { symbol: 'MA', type: 'stock' },
  '104': { symbol: 'JNJ', type: 'stock' },
  '105': { symbol: 'UNH', type: 'stock' },
  '106': { symbol: 'HD', type: 'stock' },
  '107': { symbol: 'PG', type: 'stock' },
  '108': { symbol: 'XOM', type: 'stock' },
  '109': { symbol: 'CVX', type: 'stock' },
  '110': { symbol: 'LLY', type: 'stock' },
  '111': { symbol: 'ABBV', type: 'stock' },
  '112': { symbol: 'MRK', type: 'stock' },
  '113': { symbol: 'PFE', type: 'stock' },
  '114': { symbol: 'KO', type: 'stock' },
  '115': { symbol: 'PEP', type: 'stock' },
  '116': { symbol: 'COST', type: 'stock' },
  '117': { symbol: 'WMT', type: 'stock' },
  '118': { symbol: 'MCD', type: 'stock' },
  '119': { symbol: 'NKE', type: 'stock' },
  '120': { symbol: 'DIS', type: 'stock' },
  '121': { symbol: 'CRM', type: 'stock' },
  '122': { symbol: 'ORCL', type: 'stock' },
  '123': { symbol: 'ADBE', type: 'stock' },
  '124': { symbol: 'AVGO', type: 'stock' },
  '125': { symbol: 'CSCO', type: 'stock' },
  '126': { symbol: 'ACN', type: 'stock' },
  '127': { symbol: 'IBM', type: 'stock' },
  '128': { symbol: 'TXN', type: 'stock' },
  '129': { symbol: 'QCOM', type: 'stock' },
  '130': { symbol: 'INTU', type: 'stock' },
  '131': { symbol: 'AMAT', type: 'stock' },
  '132': { symbol: 'MU', type: 'stock' },
  '133': { symbol: 'LRCX', type: 'stock' },
  '134': { symbol: 'PANW', type: 'stock' },
  '135': { symbol: 'SNPS', type: 'stock' },
  '136': { symbol: 'CDNS', type: 'stock' },
  '137': { symbol: 'CRWD', type: 'stock' },
  '138': { symbol: 'KLAC', type: 'stock' },
  '139': { symbol: 'ADSK', type: 'stock' },
  '140': { symbol: 'NOW', type: 'stock' },
  '141': { symbol: 'GS', type: 'stock' },
  '142': { symbol: 'MS', type: 'stock' },
  '143': { symbol: 'BLK', type: 'stock' },
  '144': { symbol: 'SCHW', type: 'stock' },
  '145': { symbol: 'C', type: 'stock' },
  '146': { symbol: 'WFC', type: 'stock' },
  '147': { symbol: 'AXP', type: 'stock' },
  '148': { symbol: 'T', type: 'stock' },
  '149': { symbol: 'VZ', type: 'stock' },
  '150': { symbol: 'TMUS', type: 'stock' },
  '200': { symbol: 'BA', type: 'stock' },
  '201': { symbol: 'CAT', type: 'stock' },
  '202': { symbol: 'GE', type: 'stock' },
  '203': { symbol: 'HON', type: 'stock' },
  '204': { symbol: 'RTX', type: 'stock' },
  '205': { symbol: 'LMT', type: 'stock' },
  '206': { symbol: 'UPS', type: 'stock' },
  '207': { symbol: 'UNP', type: 'stock' },
  '208': { symbol: 'DE', type: 'stock' },
  '209': { symbol: 'FDX', type: 'stock' },
  
  // Indices and ETFs
  '1500': { symbol: 'SPX500', type: 'index' },
  '1501': { symbol: 'NSDQ100', type: 'index' },
  '1502': { symbol: 'DJ30', type: 'index' },
  '1503': { symbol: 'UK100', type: 'index' },
  '1504': { symbol: 'GER40', type: 'index' },
  '1505': { symbol: 'FRA40', type: 'index' },
  '1506': { symbol: 'JPN225', type: 'index' },
  '1507': { symbol: 'HKG50', type: 'index' },
  '1508': { symbol: 'AUS200', type: 'index' },
};

// Infer exchange/country from symbol suffix (e.g. ".L" = London, ".PA" = Paris)
function inferExchangeFromSymbol(symbol: string): { exchange: string | null; country: string | null; sector: string | null } {
  const suffix = symbol.includes('.') ? symbol.split('.').pop()?.toUpperCase() : null;
  const exchangeMap: Record<string, { exchange: string; country: string }> = {
    'L': { exchange: 'LSE', country: 'GB' },
    'PA': { exchange: 'Euronext Paris', country: 'FR' },
    'DE': { exchange: 'XETRA', country: 'DE' },
    'AS': { exchange: 'Euronext Amsterdam', country: 'NL' },
    'MI': { exchange: 'Borsa Italiana', country: 'IT' },
    'MC': { exchange: 'BME', country: 'ES' },
    'SW': { exchange: 'SIX', country: 'CH' },
    'HK': { exchange: 'HKEX', country: 'HK' },
    'T': { exchange: 'TSE', country: 'JP' },
    'TW': { exchange: 'TWSE', country: 'TW' },
    'AX': { exchange: 'ASX', country: 'AU' },
    'TO': { exchange: 'TSX', country: 'CA' },
    'NV': { exchange: 'Euronext Amsterdam', country: 'NL' },
  };
  
  // Get sector from map
  const sector = SECTOR_MAP[symbol] || null;
  
  if (suffix && exchangeMap[suffix]) {
    return { ...exchangeMap[suffix], sector };
  }
  
  // No suffix typically means US stock - check our US exchange map
  if (!symbol.includes('.')) {
    const usExchange = US_EXCHANGE_MAP[symbol] || 'US Stock Exchange';
    return { exchange: usExchange, country: 'US', sector };
  }
  
  return { exchange: null, country: null, sector };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const bullwareApiKey = Deno.env.get('BULLAWARE_API_KEY')!;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase: any = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // Check if this is an on-demand sync request for a specific trader
    let body: { trader_id?: string; force_assets?: boolean } = {};
    try {
      body = await req.json();
    } catch {
      // No body, regular sync
    }

    // On-demand sync for specific trader
    if (body.trader_id) {
      console.log(`[sync-worker] On-demand sync requested for trader ID: ${body.trader_id}`);
      
      const { data: trader, error } = await supabase
        .from('traders')
        .select('id, etoro_username')
        .eq('id', body.trader_id)
        .single();
      
      if (error || !trader) {
        return new Response(JSON.stringify({ error: 'Trader not found' }), { 
          status: 404, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        });
      }
      
      console.log(`[sync-worker] On-demand syncing: ${trader.etoro_username}`);
      const result = await syncTraderDetailsBatch(supabase, bullwareApiKey, [trader]);
      return new Response(JSON.stringify({ 
        action: 'on_demand_sync', 
        ...result 
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Force assets sync (can be triggered manually)
    if (body.force_assets) {
      console.log('[sync-worker] Force assets sync requested...');
      const result = await syncAssetsBatch(supabase, bullwareApiKey);
      return new Response(JSON.stringify({ 
        action: 'force_assets_sync', 
        ...result 
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    console.log('[sync-worker] Starting sync cycle...');

    // Get current sync states
    const { data: syncStates, error: stateError } = await supabase
      .from('sync_state')
      .select('*');

    if (stateError) throw stateError;

    const states: Record<string, SyncState> = {};
    for (const state of syncStates || []) {
      states[state.id] = state;
    }

    // Priority 0: Force assets sync if never run (needed for sector/exchange/country data)
    const assetsState = states['assets'];
    if (!assetsState?.last_run) {
      console.log('[sync-worker] Assets never synced, forcing initial asset sync...');
      const result = await syncAssetsBatch(supabase, bullwareApiKey);
      return new Response(JSON.stringify({ 
        action: 'initial_assets_sync', 
        ...result 
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Priority 1: Check if we need to discover/refresh traders list
    const tradersState = states['traders'];
    const needsTradersPagination = 
      tradersState?.status === 'paginating' || 
      isStale(tradersState?.last_run, STALE_HOURS_TRADERS);

    // IMPORTANT: Also sync trader details while paginating traders
    // This ensures portfolio data gets populated even while we're still discovering traders
    const staleTraders = await getStaleTraders(supabase, BATCH_SIZE_DETAILS, STALE_HOURS_DETAILS);
    
    // Prioritize trader details if we have any stale ones (for portfolio data)
    if (staleTraders.length > 0) {
      console.log(`[sync-worker] Syncing ${staleTraders.length} stale trader details (priority over pagination)...`);
      const result = await syncTraderDetailsBatch(supabase, bullwareApiKey, staleTraders);
      return new Response(JSON.stringify({ 
        action: 'sync_trader_details', 
        ...result 
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (needsTradersPagination) {
      console.log('[sync-worker] Syncing traders list...');
      const result = await syncTradersBatch(supabase, bullwareApiKey, tradersState);
      return new Response(JSON.stringify({ 
        action: 'sync_traders', 
        ...result 
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Priority 2: Check if assets need refresh
    if (isStale(assetsState?.last_run, STALE_HOURS_ASSETS)) {
      console.log('[sync-worker] Assets stale, syncing...');
      const result = await syncAssetsBatch(supabase, bullwareApiKey);
      return new Response(JSON.stringify({ 
        action: 'sync_assets', 
        ...result 
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    console.log('[sync-worker] Everything is fresh, skipping this cycle.');
    return new Response(JSON.stringify({ 
      action: 'skip', 
      message: 'All data is fresh' 
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[sync-worker] Error:', errorMessage);
    return new Response(JSON.stringify({ 
      error: errorMessage 
    }), { 
      status: 500, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });
  }
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function syncTradersBatch(
  supabase: any,
  apiKey: string,
  state: SyncState | undefined
): Promise<{ synced: number; page: number; totalPages: number | null; status: string }> {
  const currentPage = state?.status === 'paginating' ? state.last_page : 1;
  
  // Update state to paginating
  await supabase
    .from('sync_state')
    .upsert({ 
      id: 'traders', 
      status: 'paginating', 
      last_page: currentPage,
      updated_at: new Date().toISOString()
    });

  console.log(`[sync-worker] Fetching traders page ${currentPage} from ${ENDPOINTS.investors}...`);

  const response = await fetch(
    `${ENDPOINTS.investors}?page=${currentPage}`,
    { 
      headers: { 
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      } 
    }
  );

  if (!response.ok) {
    throw new Error(`Bullaware API error: ${response.status}`);
  }

  const data = await response.json();
  const traders = data.items || data.data || data.investors || [];
  const total = data.total || data.totalCount || 0;
  const totalPages = Math.ceil(total / BATCH_SIZE_TRADERS) || 1;

  console.log(`[sync-worker] Got ${traders.length} traders from page ${currentPage}, total: ${total}`);

  // Map and upsert traders - use same field names as working sync-traders function
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tradersToUpsert = traders.map((t: any) => ({
    etoro_username: t.username || t.userName || t.etoro_username,
    display_name: t.displayName || t.fullName || t.fullname || t.username || t.userName,
    avatar_url: t.avatarUrl || t.avatar || t.avatar_url || t.image,
    bio: t.aboutMe || t.bio || t.about || t.description,
    country: t.country,
    verified: t.verified ?? t.isVerified ?? false,
    risk_score: t.riskScore ?? t.risk ?? t.risk_score,
    gain_12m: t.gain12Months ?? t.return1Year ?? t.yearlyReturn ?? t.gain12m ?? t.gain_12m,
    gain_24m: t.gain24Months ?? t.return2Years ?? t.gain24m ?? t.gain_24m,
    max_drawdown: t.maxDrawdown ?? t.maxDailyDrawdown ?? t.dailyDD ?? t.max_drawdown,
    copiers: t.copiers ?? t.copiersCount ?? 0,
    aum: parseAum(t.aum ?? t.assetsUnderManagement),
    profitable_weeks_pct: t.profitableWeeksPct ?? t.winRatio ?? t.profitable_weeks_pct,
    profitable_months_pct: t.profitableMonthsPct ?? t.profitable_months_pct,
    avg_trades_per_week: t.tradesPerWeek ?? t.avgTradesPerWeek ?? t.avg_trades_per_week,
    avg_holding_time_days: t.avgHoldingTime ?? t.avgPositionDays ?? t.avg_holding_time_days,
    active_since: t.activeSince ?? t.firstActivity ?? t.active_since,
    tags: t.tags || t.investsIn || [],
    updated_at: new Date().toISOString(),
  }));

  if (tradersToUpsert.length > 0) {
    const { error } = await supabase
      .from('traders')
      .upsert(tradersToUpsert, { onConflict: 'etoro_username' });
    
    if (error) {
      console.error('[sync-worker] Error upserting traders:', error);
    }
  }

  // Check if we've finished all pages
  const isComplete = currentPage >= totalPages || traders.length === 0;
  const nextPage = isComplete ? 1 : currentPage + 1;
  const newStatus = isComplete ? 'idle' : 'paginating';

  // Update state
  await supabase
    .from('sync_state')
    .upsert({ 
      id: 'traders', 
      status: newStatus, 
      last_page: nextPage,
      total_pages: totalPages,
      last_run: isComplete ? new Date().toISOString() : state?.last_run,
      updated_at: new Date().toISOString()
    });

  return { 
    synced: tradersToUpsert.length, 
    page: currentPage, 
    totalPages, 
    status: newStatus 
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getStaleTraders(
  supabase: any,
  limit: number,
  hoursThreshold: number
): Promise<Array<{ id: string; etoro_username: string }>> {
  const thresholdTime = new Date();
  thresholdTime.setHours(thresholdTime.getHours() - hoursThreshold);

  // Use details_synced_at to check staleness (not updated_at which is set during list sync)
  // Order by copiers DESC to prioritize popular traders first
  const { data, error } = await supabase
    .from('traders')
    .select('id, etoro_username, details_synced_at, copiers')
    .or(`details_synced_at.is.null,details_synced_at.lt.${thresholdTime.toISOString()}`)
    .order('copiers', { ascending: false, nullsFirst: false })
    .limit(limit);

  if (error) {
    console.error('[sync-worker] Error fetching stale traders:', error);
    return [];
  }

  return data || [];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function syncTraderDetailsBatch(
  supabase: any,
  apiKey: string,
  traders: Array<{ id: string; etoro_username: string }>
): Promise<{ synced: number; traders: string[] }> {
  const syncedTraders: string[] = [];

  for (const trader of traders) {
    try {
      console.log(`[sync-worker] Syncing details for ${trader.etoro_username}...`);

      // Fetch portfolio
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let holdingsArray: any[] = [];
      const holdingsRes = await fetch(
        ENDPOINTS.portfolio(trader.etoro_username),
        { 
          headers: { 
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          } 
        }
      );

      if (holdingsRes.ok) {
        const holdingsData = await holdingsRes.json();
        holdingsArray = holdingsData.data || holdingsData.positions || holdingsData.holdings || [];

        console.log(`[sync-worker] Got ${holdingsArray.length} holdings for ${trader.etoro_username}`);
        
        // DEBUG: Log first holding to see available fields
        if (holdingsArray.length > 0) {
          console.log(`[sync-worker] Sample holding fields for ${trader.etoro_username}:`, JSON.stringify(holdingsArray[0], null, 2));
        }

        // Process holdings
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const h of holdingsArray as any[]) {
          const symbol = h.symbol || h.instrumentId || h.ticker || h.asset;
          if (!symbol) continue;

          // Get or create asset, enriching with data from holdings
          let { data: asset } = await supabase
            .from('assets')
            .select('id, asset_type, exchange, country, sector')
            .eq('symbol', symbol)
            .single();

          // Infer exchange/country/sector from symbol
          const inferred = inferExchangeFromSymbol(symbol);
          
          // Map Bullaware type to our asset_type
          const assetType = h.type?.toLowerCase() || 'stock';
          
          if (!asset) {
            // Create asset with enriched data from holdings
            const { data: newAsset } = await supabase
              .from('assets')
              .insert({ 
                symbol, 
                name: h.name || h.instrumentName || symbol,
                asset_type: assetType,
                exchange: inferred.exchange,
                country: inferred.country,
                sector: inferred.sector,
              })
              .select('id, asset_type, exchange, country, sector')
              .single();
            asset = newAsset;
            console.log(`[sync-worker] Created asset ${symbol} with type=${assetType}, exchange=${inferred.exchange}, country=${inferred.country}, sector=${inferred.sector}`);
          } else {
            // Update asset if missing type/exchange/country/sector
            const updates: Record<string, unknown> = {};
            if (!asset.asset_type || asset.asset_type === 'stock') {
              updates.asset_type = assetType;
            }
            if (!asset.exchange && inferred.exchange) {
              updates.exchange = inferred.exchange;
            }
            if (!asset.country && inferred.country) {
              updates.country = inferred.country;
            }
            if (!asset.sector && inferred.sector) {
              updates.sector = inferred.sector;
            }
            if (Object.keys(updates).length > 0) {
              await supabase.from('assets').update(updates).eq('id', asset.id);
              console.log(`[sync-worker] Updated asset ${symbol} with:`, updates);
            }
          }

          if (asset) {
            // Bullaware API returns:
            // - "value": percentage allocation of portfolio (e.g. 7.659151 = 7.66%)
            // - "netProfit": P&L percentage (can be negative)
            const allocationValue = h.value ?? h.allocationPct ?? h.allocation_pct ?? h.allocation ?? h.weight ?? h.percentage ?? h.invested;
            const allocation = typeof allocationValue === 'number' ? allocationValue : parseFloat(allocationValue) || 0;
            
            // netProfit is the P&L field from Bullaware
            const pnlValue = h.netProfit ?? h.profitLossPct ?? h.profit_loss_pct ?? h.pnl ?? h.gain ?? h.profitLoss ?? h.pl ?? h.unrealizedPnl ?? h.unrealizedPnlPct ?? h.returnPct ?? h.returns;
            const pnl = typeof pnlValue === 'number' ? pnlValue : (pnlValue ? parseFloat(pnlValue) : null);
            
            await supabase
              .from('trader_holdings')
              .upsert({
                trader_id: trader.id,
                asset_id: asset.id,
                allocation_pct: allocation, // This is the primary allocation field
                avg_open_price: h.avgOpenPrice ?? h.avg_open_price ?? h.openPrice ?? h.openRate ?? h.avgPrice,
                current_value: allocation, // Keep as backup
                profit_loss_pct: pnl, // P&L percentage
                updated_at: new Date().toISOString(),
              }, { onConflict: 'trader_id,asset_id' });
          }
        }
      } else {
        console.log(`[sync-worker] Portfolio fetch failed for ${trader.etoro_username}: ${holdingsRes.status}`);
      }

      await delay(RATE_LIMIT_DELAY_MS);

      // Build instrumentId -> symbol mapping from MULTIPLE sources for better coverage
      // Priority order: 1. Static map, 2. Database, 3. Holdings, 4. Bullaware API
      const instrumentMap: Record<string, { symbol: string; name: string; type: string }> = {};
      
      // Source 1: Start with static INSTRUMENT_ID_MAP (most reliable for common instruments)
      for (const [instId, data] of Object.entries(INSTRUMENT_ID_MAP)) {
        instrumentMap[instId] = {
          symbol: data.symbol,
          name: data.symbol,
          type: data.type,
        };
      }
      console.log(`[sync-worker] Loaded ${Object.keys(instrumentMap).length} entries from static INSTRUMENT_ID_MAP`);
      
      // Source 2: Query database for assets with instrument_id stored
      try {
        const { data: dbAssets } = await supabase
          .from('assets')
          .select('symbol, name, asset_type, instrument_id')
          .not('instrument_id', 'is', null);
        
        if (dbAssets && dbAssets.length > 0) {
          for (const asset of dbAssets) {
            const instId = String(asset.instrument_id);
            if (!instrumentMap[instId]) {
              instrumentMap[instId] = {
                symbol: asset.symbol,
                name: asset.name || asset.symbol,
                type: asset.asset_type || 'stock',
              };
            }
          }
          console.log(`[sync-worker] Added ${dbAssets.length} entries from database instrument_id mappings`);
        }
      } catch (err) {
        console.log(`[sync-worker] Could not fetch instrument mappings from database:`, err);
      }
      
      // Source 3: Build from portfolio holdings (which have symbol and sometimes instrumentId)
      if (holdingsArray.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const h of holdingsArray as any[]) {
          const instId = h.instrumentId || h.instrument_id;
          const symbol = h.symbol || h.ticker;
          if (instId && symbol && !instrumentMap[String(instId)]) {
            instrumentMap[String(instId)] = {
              symbol,
              name: h.name || h.instrumentName || symbol,
              type: (h.type || 'stock').toLowerCase(),
            };
            
            // Store this discovered mapping in the database for future use
            try {
              await supabase
                .from('assets')
                .update({ instrument_id: parseInt(instId) })
                .eq('symbol', symbol)
                .is('instrument_id', null);
            } catch {
              // Ignore errors - just a cache optimization
            }
          }
        }
        console.log(`[sync-worker] Built instrument map from holdings, total entries: ${Object.keys(instrumentMap).length}`);
      }
      
      // Source 4: Try Bullaware instruments API as final backup (limited to ~10 entries)
      try {
        const instrumentsRes = await fetch(
          `${ENDPOINTS.instruments}?limit=1000`,
          { 
            headers: { 
              'Authorization': `Bearer ${apiKey}`,
              'Content-Type': 'application/json'
            } 
          }
        );
        
        if (instrumentsRes.ok) {
          const instrumentsData = await instrumentsRes.json();
          const instruments = instrumentsData.items || instrumentsData.data || instrumentsData.instruments || [];
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          for (const inst of instruments as any[]) {
            const instId = String(inst.instrumentId || inst.id);
            if (!instrumentMap[instId]) {
              instrumentMap[instId] = {
                symbol: inst.symbol || inst.ticker || instId,
                name: inst.name || inst.displayName || inst.instrumentName || inst.symbol || instId,
                type: (inst.type || inst.instrumentType || 'stock').toLowerCase(),
              };
            }
          }
          console.log(`[sync-worker] Total instrument map entries after all sources: ${Object.keys(instrumentMap).length}`);
        }
      } catch (err) {
        console.log(`[sync-worker] Could not fetch instruments from API:`, err);
      }

      await delay(RATE_LIMIT_DELAY_MS);

      // Fetch trades
      const tradesRes = await fetch(
        ENDPOINTS.trades(trader.etoro_username),
        { 
          headers: { 
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          } 
        }
      );

      if (tradesRes.ok) {
        const tradesData = await tradesRes.json();
        // Bullaware returns trades in "positions" array for closed positions
        const trades = tradesData.positions || tradesData.data || tradesData.trades || tradesData.items || [];

        console.log(`[sync-worker] Got ${trades.length} trades for ${trader.etoro_username}`);
        
        // DEBUG: Log first trade to see available fields
        if (trades.length > 0) {
          console.log(`[sync-worker] Sample trade fields for ${trader.etoro_username}:`, JSON.stringify(trades[0], null, 2));
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const t of (trades as any[]).slice(0, 20)) {
          // First try to get symbol directly, then fallback to instrumentId lookup
          let symbol = t.symbol || t.ticker;
          let assetName = t.name || t.instrumentName;
          let assetType = 'stock';
          
          // If we only have instrumentId, look it up
          if (!symbol && t.instrumentId) {
            const instId = String(t.instrumentId);
            const mapped = instrumentMap[instId];
            if (mapped) {
              symbol = mapped.symbol;
              assetName = assetName || mapped.name;
              assetType = mapped.type;
              console.log(`[sync-worker] Mapped instrumentId ${instId} -> ${symbol}`);
            } else {
              // Skip trades with unknown instrumentId
              console.log(`[sync-worker] Unknown instrumentId ${instId}, skipping trade`);
              continue;
            }
          }
          
          if (!symbol) continue;

          // Infer exchange/country from symbol
          const inferred = inferExchangeFromSymbol(symbol);

          let { data: asset } = await supabase
            .from('assets')
            .select('id')
            .eq('symbol', symbol)
            .single();

          if (!asset) {
            const { data: newAsset } = await supabase
              .from('assets')
              .insert({ 
                symbol, 
                name: assetName || symbol,
                asset_type: assetType,
                exchange: inferred.exchange,
                country: inferred.country,
                sector: inferred.sector,
              })
              .select('id')
              .single();
            asset = newAsset;
          }

          if (asset) {
            // Bullaware positions array fields: positionId, isBuy, openRate, closeRate, openDateTime, closeDateTime, netProfit
            const positionId = t.positionId ? Number(t.positionId) : null;
            
            await supabase
              .from('trades')
              .upsert({
                trader_id: trader.id,
                asset_id: asset.id,
                position_id: positionId,
                action: t.isBuy === true ? 'buy' : t.isBuy === false ? 'sell' : (t.action || t.side || t.type || 'unknown'),
                open_price: t.openRate ?? t.openPrice ?? null,
                close_price: t.closeRate ?? t.closePrice ?? null,
                profit_loss_pct: t.netProfit ?? null,
                open_date: t.openDateTime ?? t.openDate ?? null,
                executed_at: t.closeDateTime ?? t.executedAt ?? t.date ?? t.timestamp ?? null,
                amount: t.amount ?? t.units ?? t.quantity ?? null,
                price: t.closeRate ?? t.closePrice ?? t.openRate ?? t.openPrice ?? null,
                percentage_of_portfolio: t.portfolioPercentage ?? t.weight ?? null,
              }, { 
                onConflict: 'position_id',
                ignoreDuplicates: false 
              });
          }
        }
      } else {
        console.log(`[sync-worker] Trades fetch failed for ${trader.etoro_username}: ${tradesRes.status}`);
      }

      await delay(RATE_LIMIT_DELAY_MS);

      // Fetch investor details (contains monthlyReturns, yearlyReturns, profitableWeeksPct, etc.)
      const investorRes = await fetch(
        ENDPOINTS.investorDetails(trader.etoro_username),
        { 
          headers: { 
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          } 
        }
      );

      if (investorRes.ok) {
        const investorData = await investorRes.json();
        const investor = investorData.investor || investorData.data || investorData;
        
        console.log(`[sync-worker] Got investor details for ${trader.etoro_username}:`, JSON.stringify({
          hasMonthlyReturns: !!investor.monthlyReturns,
          monthlyReturnsKeys: investor.monthlyReturns ? Object.keys(investor.monthlyReturns).slice(0, 5) : [],
          profitableWeeksPct: investor.profitableWeeksPct,
          profitableMonthsPct: investor.profitableMonthsPct,
          dailyDD: investor.dailyDD,
          weeklyDD: investor.weeklyDD,
        }, null, 2));
        
        // Extract and save monthly returns (format: {"2021-01": 5.5, "2021-02": 9.2})
        const monthlyReturns = investor.monthlyReturns || {};
        const monthlyEntries = Object.entries(monthlyReturns);
        
        if (monthlyEntries.length > 0) {
          console.log(`[sync-worker] Saving ${monthlyEntries.length} monthly performance records for ${trader.etoro_username}`);
          
          for (const [key, value] of monthlyEntries) {
            // Key format is "YYYY-MM" e.g. "2024-01"
            const parts = key.split('-');
            if (parts.length >= 2) {
              const year = parseInt(parts[0], 10);
              const month = parseInt(parts[1], 10);
              
              if (!isNaN(year) && !isNaN(month) && typeof value === 'number') {
                await supabase
                  .from('trader_performance')
                  .upsert({
                    trader_id: trader.id,
                    year,
                    month,
                    return_pct: value,
                  }, { onConflict: 'trader_id,year,month' });
              }
            }
          }
        }
        
        // Update trader with additional stats from investor details
        const traderUpdates: Record<string, unknown> = {};
        
        if (investor.profitableWeeksPct !== undefined && investor.profitableWeeksPct !== null) {
          traderUpdates.profitable_weeks_pct = investor.profitableWeeksPct;
        }
        if (investor.profitableMonthsPct !== undefined && investor.profitableMonthsPct !== null) {
          traderUpdates.profitable_months_pct = investor.profitableMonthsPct;
        }
        if (investor.dailyDD !== undefined && investor.dailyDD !== null) {
          traderUpdates.daily_drawdown = investor.dailyDD;
        }
        if (investor.weeklyDD !== undefined && investor.weeklyDD !== null) {
          traderUpdates.weekly_drawdown = investor.weeklyDD;
        }
        // Also capture additional useful metrics if available
        if (investor.maxDrawdown !== undefined && investor.maxDrawdown !== null) {
          traderUpdates.max_drawdown = investor.maxDrawdown;
        }
        if (investor.avgPosSize !== undefined && investor.avgPosSize !== null) {
          traderUpdates.avg_holding_time_days = investor.avgPosSize; // Approximate mapping
        }
        
        if (Object.keys(traderUpdates).length > 0) {
          console.log(`[sync-worker] Updating trader stats for ${trader.etoro_username}:`, traderUpdates);
          await supabase
            .from('traders')
            .update(traderUpdates)
            .eq('id', trader.id);
        }
      } else {
        console.log(`[sync-worker] Investor details fetch failed for ${trader.etoro_username}: ${investorRes.status}`);
      }

      await delay(RATE_LIMIT_DELAY_MS);

      // Fetch risk score from dedicated endpoint
      const riskRes = await fetch(
        ENDPOINTS.riskScore(trader.etoro_username),
        { 
          headers: { 
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          } 
        }
      );

      let riskScoreValue: number | null = null;
      if (riskRes.ok) {
        const riskData = await riskRes.json();
        console.log(`[sync-worker] Risk score response for ${trader.etoro_username}:`, JSON.stringify(riskData, null, 2).slice(0, 500));
        
        // API returns { points: [{ date, riskScore, minRiskScore, maxRiskScore }, ...] }
        // Get the latest riskScore from the points array
        const points = riskData.points || riskData.data || [];
        if (Array.isArray(points) && points.length > 0) {
          // Get the last point (most recent)
          const latest = points[points.length - 1];
          riskScoreValue = latest.riskScore ?? latest.risk ?? latest.value ?? null;
        } else if (typeof riskData === 'number') {
          riskScoreValue = riskData;
        } else if (riskData.riskScore !== undefined) {
          riskScoreValue = riskData.riskScore;
        }
        
        if (riskScoreValue !== null) {
          console.log(`[sync-worker] Setting risk_score=${riskScoreValue} for ${trader.etoro_username}`);
          await supabase
            .from('traders')
            .update({ risk_score: riskScoreValue })
            .eq('id', trader.id);
        } else {
          console.log(`[sync-worker] Could not extract risk score for ${trader.etoro_username}`);
        }
      } else {
        console.log(`[sync-worker] Risk score fetch failed for ${trader.etoro_username}: ${riskRes.status}`);
      }

      await delay(RATE_LIMIT_DELAY_MS);

      // Fetch metrics (for advanced metrics like Sharpe, Sortino, Alpha, Beta, Volatility)
      const metricsRes = await fetch(
        ENDPOINTS.metrics(trader.etoro_username),
        { 
          headers: { 
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          } 
        }
      );

      if (metricsRes.ok) {
        const metricsData = await metricsRes.json();
        const metrics = metricsData.data || metricsData.metrics || metricsData;
        
        console.log(`[sync-worker] Got metrics for ${trader.etoro_username}:`, JSON.stringify(metrics, null, 2).slice(0, 500));
        
        // Update trader with advanced metrics
        const advancedMetrics: Record<string, unknown> = {};
        
        // Try various field names for each metric
        if (metrics.sharpeRatio !== undefined || metrics.sharpe !== undefined || metrics.sharpe_ratio !== undefined) {
          advancedMetrics.sharpe_ratio = metrics.sharpeRatio ?? metrics.sharpe ?? metrics.sharpe_ratio;
        }
        if (metrics.sortinoRatio !== undefined || metrics.sortino !== undefined || metrics.sortino_ratio !== undefined) {
          advancedMetrics.sortino_ratio = metrics.sortinoRatio ?? metrics.sortino ?? metrics.sortino_ratio;
        }
        // Map jensensAlpha to alpha
        if (metrics.jensensAlpha !== undefined || metrics.alpha !== undefined || metrics.jensenAlpha !== undefined) {
          advancedMetrics.alpha = metrics.jensensAlpha ?? metrics.alpha ?? metrics.jensenAlpha;
        }
        if (metrics.beta !== undefined) {
          advancedMetrics.beta = metrics.beta;
        }
        if (metrics.volatility !== undefined || metrics.stdDev !== undefined || metrics.standardDeviation !== undefined) {
          advancedMetrics.volatility = metrics.volatility ?? metrics.stdDev ?? metrics.standardDeviation;
        }
        if (metrics.dailyDrawdown !== undefined || metrics.dailyDD !== undefined || metrics.daily_drawdown !== undefined) {
          advancedMetrics.daily_drawdown = metrics.dailyDrawdown ?? metrics.dailyDD ?? metrics.daily_drawdown;
        }
        // Save additional ratios from Bullaware
        if (metrics.omegaRatio !== undefined || metrics.omega !== undefined) {
          advancedMetrics.omega_ratio = metrics.omegaRatio ?? metrics.omega;
        }
        if (metrics.treynorRatio !== undefined || metrics.treynor !== undefined) {
          advancedMetrics.treynor_ratio = metrics.treynorRatio ?? metrics.treynor;
        }
        if (metrics.calmarRatio !== undefined || metrics.calmar !== undefined) {
          advancedMetrics.calmar_ratio = metrics.calmarRatio ?? metrics.calmar;
        }
        if (metrics.informationRatio !== undefined || metrics.information !== undefined) {
          advancedMetrics.information_ratio = metrics.informationRatio ?? metrics.information;
        }
        
        if (Object.keys(advancedMetrics).length > 0) {
          console.log(`[sync-worker] Updating advanced metrics for ${trader.etoro_username}:`, advancedMetrics);
          await supabase
            .from('traders')
            .update(advancedMetrics)
            .eq('id', trader.id);
        }
      } else {
        console.log(`[sync-worker] Metrics fetch failed for ${trader.etoro_username}: ${metricsRes.status}`);
      }

      await delay(RATE_LIMIT_DELAY_MS);

      // Fetch equity/metrics history for performance vs benchmark chart
      const metricsHistoryRes = await fetch(
        ENDPOINTS.metricsHistory(trader.etoro_username),
        { 
          headers: { 
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          } 
        }
      );

      if (metricsHistoryRes.ok) {
        const historyData = await metricsHistoryRes.json();
        const points = historyData.points || historyData.data || historyData.history || [];
        
        console.log(`[sync-worker] Got ${points.length} equity history points for ${trader.etoro_username}`);
        
        // Save equity history points (format: { date, equity, benchmark })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const point of (points as any[]).slice(-365)) { // Keep last 365 days
          const date = point.date || point.timestamp;
          const equity = point.equity ?? point.value ?? point.cumReturn ?? point.cumulativeReturn;
          const benchmark = point.benchmark ?? point.spx ?? point.sp500 ?? point.benchmarkReturn;
          
          if (date && equity !== undefined) {
            await supabase
              .from('trader_equity_history')
              .upsert({
                trader_id: trader.id,
                date: typeof date === 'string' ? date.split('T')[0] : new Date(date).toISOString().split('T')[0],
                equity_value: equity,
                benchmark_value: benchmark,
              }, { onConflict: 'trader_id,date' });
          }
        }
      } else {
        console.log(`[sync-worker] Metrics history fetch failed for ${trader.etoro_username}: ${metricsHistoryRes.status}`);
      }

      await delay(RATE_LIMIT_DELAY_MS);

      // Fetch portfolio history for stacked area chart
      const portfolioHistoryRes = await fetch(
        ENDPOINTS.portfolioHistory(trader.etoro_username),
        { 
          headers: { 
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          } 
        }
      );

      if (portfolioHistoryRes.ok) {
        const historyData = await portfolioHistoryRes.json();
        const snapshots = historyData.data || historyData.snapshots || historyData.history || [];
        
        console.log(`[sync-worker] Got ${snapshots.length} portfolio history snapshots for ${trader.etoro_username}`);
        
        // Save portfolio snapshots (format: { date, holdings: [{symbol, value}] })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const snapshot of (snapshots as any[]).slice(-52)) { // Keep last 52 weeks
          const date = snapshot.date || snapshot.timestamp;
          const holdings = snapshot.holdings || snapshot.positions || snapshot.portfolio || [];
          
          if (date && holdings.length > 0) {
            await supabase
              .from('trader_portfolio_history')
              .upsert({
                trader_id: trader.id,
                date: typeof date === 'string' ? date.split('T')[0] : new Date(date).toISOString().split('T')[0],
                holdings: holdings,
              }, { onConflict: 'trader_id,date' });
          }
        }
      } else {
        console.log(`[sync-worker] Portfolio history fetch failed for ${trader.etoro_username}: ${portfolioHistoryRes.status}`);
      }

      // Update trader's details_synced_at (not updated_at which is for list sync)
      await supabase
        .from('traders')
        .update({ details_synced_at: new Date().toISOString() })
        .eq('id', trader.id);

      syncedTraders.push(trader.etoro_username);
      console.log(`[sync-worker] Completed sync for ${trader.etoro_username}`);

      // Rate limit between traders
      if (traders.indexOf(trader) < traders.length - 1) {
        await delay(RATE_LIMIT_DELAY_MS);
      }

    } catch (err) {
      console.error(`[sync-worker] Error syncing ${trader.etoro_username}:`, err);
    }
  }

  // Update sync state
  await supabase
    .from('sync_state')
    .upsert({ 
      id: 'trader_details', 
      last_run: new Date().toISOString(),
      status: 'idle',
      updated_at: new Date().toISOString()
    });

  return { synced: syncedTraders.length, traders: syncedTraders };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function syncAssetsBatch(
  supabase: any,
  apiKey: string
): Promise<{ synced: number }> {
  let totalSynced = 0;
  let page = 1;
  let hasMore = true;
  const pageSize = 50;

  while (hasMore) {
    console.log(`[sync-worker] Fetching assets page ${page} from ${ENDPOINTS.instruments}...`);

    const response = await fetch(
      `${ENDPOINTS.instruments}?page=${page}&limit=${pageSize}`,
      { 
        headers: { 
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        } 
      }
    );

    if (!response.ok) {
      console.error(`[sync-worker] Assets API error: ${response.status}`);
      break;
    }

    const data = await response.json();
    const assets = data.items || data.data || data.instruments || [];

    if (assets.length === 0) {
      hasMore = false;
      break;
    }

    console.log(`[sync-worker] Got ${assets.length} assets from page ${page}`);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const assetsToUpsert = assets.map((a: any) => ({
      symbol: a.symbol || a.ticker || a.instrumentId,
      name: a.name || a.displayName || a.instrumentName || a.symbol,
      asset_type: a.type || a.asset_type || a.instrumentType || 'stock',
      logo_url: a.logoUrl || a.logo_url || a.image || a.icon,
      exchange: a.exchange || a.market,
      sector: a.sector,
      industry: a.industry,
      country: a.country || a.countryCode || a.region, // Add country for geographic diversification
      market_cap: a.marketCap ?? a.market_cap,
      pe_ratio: a.peRatio ?? a.pe_ratio ?? a.pe,
      eps: a.eps,
      dividend_yield: a.dividendYield ?? a.dividend_yield ?? a.dividend,
      beta: a.beta,
      high_52w: a.high52w ?? a.high_52w ?? a.yearHigh ?? a.week52High,
      low_52w: a.low52w ?? a.low_52w ?? a.yearLow ?? a.week52Low,
      avg_volume: a.avgVolume ?? a.avg_volume ?? a.averageVolume,
      current_price: a.currentPrice ?? a.current_price ?? a.price ?? a.lastPrice,
      price_change: a.priceChange ?? a.price_change ?? a.change,
      price_change_pct: a.priceChangePct ?? a.price_change_pct ?? a.changePercent,
      updated_at: new Date().toISOString(),
    }));

    const { error } = await supabase
      .from('assets')
      .upsert(assetsToUpsert, { onConflict: 'symbol' });

    if (error) {
      console.error('[sync-worker] Error upserting assets:', error);
    } else {
      totalSynced += assetsToUpsert.length;
    }

    page++;
    hasMore = assets.length === pageSize;

    if (hasMore) {
      await delay(RATE_LIMIT_DELAY_MS);
    }
  }

  // Update sync state
  await supabase
    .from('sync_state')
    .upsert({ 
      id: 'assets', 
      last_run: new Date().toISOString(),
      status: 'idle',
      updated_at: new Date().toISOString()
    });

  console.log(`[sync-worker] Synced ${totalSynced} assets`);
  return { synced: totalSynced };
}
