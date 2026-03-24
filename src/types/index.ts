/** DexScreener pair data from /latest/dex/tokens endpoint */
export interface DexPair {
  chainId: string;
  dexId: string;
  pairAddress: string;
  baseToken: { address: string; name: string; symbol: string };
  quoteToken: { address: string; name: string; symbol: string };
  priceNative: string;
  priceUsd: string;
  volume: { h24: number; h6: number; h1: number; m5: number };
  priceChange: { h24: number; h6: number; h1: number; m5: number };
  liquidity: { usd: number; base: number; quote: number };
  fdv: number;
  marketCap: number;
  info?: { imageUrl?: string; websites?: { url: string }[]; socials?: { type: string; url: string }[] };
  pairCreatedAt?: number;
}

/** Normalized price result from DexScreener */
export interface PriceResult {
  address: string;
  symbol: string;
  name: string;
  priceUsd: number;
  priceChange1h: number;
  priceChange24h: number;
  volume24h: number;
  liquidity: number;
  marketCap: number;
  dex: string;
}

/** Boosted/trending token from DexScreener */
export interface TrendingToken {
  address: string;
  symbol: string;
  name: string;
  chainId: string;
  url: string;
  boostAmount: number;
}

/** Raw GMGN boost entry from /token-boosts endpoints */
export interface DexBoostEntry {
  tokenAddress?: string;
  chainId?: string;
  description?: string;
  url?: string;
  totalAmount?: number;
}

/** Normalized holder from GMGN API */
export interface Holder {
  address: string;
  tags: string[];
  twitterHandle: string | null;
  twitterName: string | null;
  name: string | null;
  balance: number;
  supplyPercent: number;
  valueUsd: number;
  avgBuyPrice: number;
  cost: number;
  unrealizedPnl: number;
  realizedPnl: number;
  totalPnl: number;
  profitMultiple: number;
  buyAmount: number;
  sellAmount: number;
  buyTxCount: number;
  sellTxCount: number;
  isDeployer: boolean;
  isFreshWallet: boolean;
  lastActiveAt: string | null;
}

/** Individual risk flag from analysis */
export interface RiskFlag {
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
}

export interface RiskAssessment {
  score: number;
  level: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  flags: RiskFlag[];
  summary: string;
}

/** Complete token analysis result */
export interface TokenAnalysis {
  token: {
    address: string;
    name: string;
    symbol: string;
    chain: string;
    imageUrl?: string;
  };
  price: {
    usd: number;
    nativePrice: string;
    change1h: number;
    change24h: number;
  };
  market: {
    marketCap: number;
    fdv: number;
    volume24h: number;
    volume1h: number;
    liquidity: number;
    dex: string;
    pairAddress: string;
    pairCreatedAt?: string;
  };
  holders?: {
    total: number;
    top: Holder[];
    devWallet: {
      address: string;
      holdingPercent: number;
      status: string;
    } | null;
    distribution: {
      top10Percent: number;
      top20Percent: number;
      freshWalletPercent: number;
      sniperCount: number;
      kolCount: number;
    };
  };
  risk: RiskAssessment;
  meta: {
    sources: string[];
    fetchTimeMs: number;
  };
}
