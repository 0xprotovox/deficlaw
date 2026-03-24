/**
 * GMGN Data Source
 * Strategy: try direct API via curl first (fast), fall back to Playwright (slower but reliable).
 * GMGN uses Cloudflare which blocks Node.js fetch but allows curl and real browsers.
 */
import { MemoryCache } from '../cache/memoryCache.js';
import type { Holder } from '../types/index.js';
import { exec } from 'child_process';
import { debug } from '../utils/debug.js';

const CACHE_TTL = parseInt(process.env.DEFICLAW_CACHE_TTL ?? '', 10) || 2 * 60 * 1000;
const BASE_URL = 'https://gmgn.ai/vas/api/v1';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const SCRAPE_TIMEOUT = 40_000;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let browser: any = null;
let initializing = false;

interface HolderResult {
  holders: Holder[];
  kolHolders: Holder[];
}

const holderCache = new MemoryCache<HolderResult>(CACHE_TTL);

/**
 * Try fetching via curl (bypasses Node.js TLS fingerprint detection).
 * Returns parsed data on success, null on any failure.
 * Uses async exec to avoid blocking the event loop.
 */
function curlFetch(path: string): Promise<Record<string, unknown> | null> {
  return new Promise((resolve) => {
    const url = `${BASE_URL}${path}`;
    const cmd = `curl -s --max-time 10 "${url}" -H "User-Agent: ${UA}"`;
    const start = Date.now();

    exec(cmd, { timeout: 12_000 }, (error, stdout) => {
      if (error) {
        debug(`curl failed for ${path}: ${error.message}`);
        resolve(null);
        return;
      }

      const out = stdout.toString();
      debug(`curl ${path} completed in ${Date.now() - start}ms (${out.length} bytes)`);

      // Cloudflare sometimes returns HTML instead of JSON
      if (!out || out.startsWith('<!') || out.startsWith('<html')) {
        debug(`curl ${path} returned HTML (Cloudflare block)`);
        resolve(null);
        return;
      }

      let json: { code?: number; data?: Record<string, unknown> };
      try {
        json = JSON.parse(out);
      } catch {
        debug(`curl ${path} returned malformed JSON`);
        resolve(null);
        return;
      }

      if (json.code !== 0 || !json.data) {
        debug(`curl ${path} returned error code: ${json.code}`);
        resolve(null);
        return;
      }

      resolve(json.data);
    });
  });
}

/** Safely extract a string array of tags from raw GMGN holder data */
function extractTags(h: Record<string, unknown>): string[] {
  const raw: unknown[] = [];

  if (Array.isArray(h.tags)) raw.push(...h.tags);
  if (h.wallet_tag_v2) {
    const wt = Array.isArray(h.wallet_tag_v2) ? h.wallet_tag_v2 : [h.wallet_tag_v2];
    raw.push(...wt);
  }
  if (h.maker_token_tags) {
    const mt = Array.isArray(h.maker_token_tags) ? h.maker_token_tags : [h.maker_token_tags];
    raw.push(...mt);
  }

  const normalized = raw.map(t => {
    if (typeof t === 'string') return t.trim();
    if (typeof t === 'object' && t !== null) {
      const obj = t as Record<string, unknown>;
      return String(obj.name ?? obj.label ?? '').trim();
    }
    return '';
  }).filter(Boolean);

  return [...new Set(normalized)];
}

/** Normalize raw GMGN holder array into typed Holder objects */
function normalizeHolders(rawList: unknown): Holder[] {
  if (!Array.isArray(rawList)) return [];

  return rawList
    .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
    .map(h => {
      const num = (key: string): number => {
        const v = h[key];
        return typeof v === 'number' ? v : 0;
      };
      const str = (key: string): string | null => {
        const v = h[key];
        return typeof v === 'string' && v.length > 0 ? v : null;
      };

      const unrealizedPnl = num('unrealized_profit') || num('unrealized_pnl');
      const realizedPnl = num('realized_profit') || num('realized_pnl');
      const lastTs = h.last_active_timestamp;

      return {
        address: String(h.address ?? ''),
        tags: extractTags(h),
        twitterHandle: str('twitter_username'),
        twitterName: str('twitter_name'),
        name: str('name'),
        balance: num('balance') || num('amount_cur'),
        supplyPercent: num('amount_percentage'),
        valueUsd: num('usd_value'),
        avgBuyPrice: num('avg_cost'),
        cost: num('cost_cur') || num('cost') || num('total_cost'),
        unrealizedPnl,
        realizedPnl,
        totalPnl: unrealizedPnl + realizedPnl,
        profitMultiple: num('profit_change'),
        buyAmount: num('buy_amount_cur') || num('accu_amount'),
        sellAmount: num('sell_amount_cur') || num('current_sell_amount'),
        buyTxCount: num('buy_tx_count_cur'),
        sellTxCount: num('sell_tx_count_cur'),
        isDeployer: h.is_deployer === true,
        isFreshWallet: h.is_new === true || h.is_fresh_wallet === true,
        lastActiveAt: typeof lastTs === 'number' && lastTs > 0
          ? new Date(lastTs * 1000).toISOString()
          : null,
      };
    })
    .filter(h => h.address.length > 10);
}

/** Launch or reconnect the Playwright browser instance */
async function ensureBrowser(): Promise<void> {
  if (browser?.isConnected?.()) return;
  browser = null;

  if (initializing) {
    // Wait for another caller to finish initializing
    await new Promise<void>(resolve => {
      const iv = setInterval(() => {
        if (!initializing) { clearInterval(iv); resolve(); }
      }, 200);
    });
    return;
  }

  initializing = true;
  try {
    const pw = await import('playwright');
    browser = await pw.chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
    });
  } catch (err) {
    throw new Error(
      `Failed to launch Playwright browser: ${err instanceof Error ? err.message : String(err)}. ` +
      'Install with: npm install playwright && npx playwright install chromium'
    );
  } finally {
    initializing = false;
  }
}

/** Playwright fallback: navigate to GMGN token page and intercept holder API responses */
async function playwrightFetch(address: string): Promise<unknown[]> {
  await ensureBrowser();
  if (!browser) throw new Error('Playwright browser not available');

  const ctx = await browser.newContext({
    userAgent: UA,
    viewport: { width: 1280, height: 720 },
  });
  const page = await ctx.newPage();

  try {
    return await new Promise<unknown[]>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('GMGN scrape timeout (40s)')), SCRAPE_TIMEOUT);
      const collected: unknown[] = [];
      let resolved = false;

      const finish = (items: unknown[]) => {
        if (resolved) return;
        clearTimeout(timeout);
        resolved = true;
        resolve(items);
      };

      page.on('response', async (response: { url(): string; json(): Promise<Record<string, unknown>> }) => {
        if (resolved) return;
        const url = response.url();
        if (!url.includes('/token_holders/sol/') && !url.includes('/top_holders/sol/')) return;

        try {
          const json = await response.json();
          const data = json.data as Record<string, unknown> | unknown[] | undefined;
          const items = Array.isArray(data) ? data
            : (data && typeof data === 'object'
              ? (Array.isArray((data as Record<string, unknown>).holders) ? (data as Record<string, unknown>).holders as unknown[]
                : Array.isArray((data as Record<string, unknown>).list) ? (data as Record<string, unknown>).list as unknown[]
                : [])
              : []);

          if (Array.isArray(items) && items.length > 0) {
            collected.push(...items);
            if (collected.length >= 10) finish(collected.slice(0, 150));
          }
        } catch {
          // Response wasn't valid JSON, skip
        }
      });

      (async () => {
        try {
          await page.goto(`https://gmgn.ai/sol/token/${address}`, {
            waitUntil: 'domcontentloaded',
            timeout: 20_000,
          });
          await page.waitForTimeout(3000);

          // Try clicking the Holders tab
          for (const sel of ['button:has-text("Holder")', '[role="tab"]:has-text("Holder")', 'text=Holders']) {
            try {
              const tab = await page.$(sel);
              if (tab) { await tab.click(); break; }
            } catch { continue; }
          }

          await page.waitForTimeout(5000);
          if (!resolved && collected.length > 0) finish(collected.slice(0, 150));
          if (!resolved) {
            await page.waitForTimeout(5000);
            if (collected.length > 0) finish(collected.slice(0, 150));
          }
          if (!resolved) reject(new Error('GMGN returned no holder data via Playwright'));
        } catch (e) {
          if (!resolved) {
            clearTimeout(timeout);
            reject(e instanceof Error ? e : new Error(String(e)));
          }
        }
      })();
    });
  } finally {
    await page.close().catch(() => {});
    await ctx.close().catch(() => {});
  }
}

/** Returns true — curl fallback is always available, Playwright is optional */
export async function isPlaywrightAvailable(): Promise<boolean> {
  return true;
}

/**
 * Get holders for a Solana token.
 * Strategy: try curl first (fast, ~1s), fall back to Playwright (~11s).
 */
export async function getHolders(address: string): Promise<HolderResult> {
  if (!address || address.trim().length === 0) {
    throw new Error('Token address is required for holder analysis');
  }

  const cached = holderCache.get(address);
  if (cached) return cached;

  // Strategy 1: curl (fast, ~1s, async to avoid blocking event loop)
  debug(`Fetching holders for ${address} via curl`);
  const curlData = await curlFetch(`/token_holders/sol/${address}?limit=100`);
  if (curlData && Array.isArray((curlData as Record<string, unknown>).list) &&
      ((curlData as Record<string, unknown>).list as unknown[]).length > 0) {
    // Fetch KOL holders in parallel (now truly async)
    const kolData = await curlFetch(`/token_holders/sol/${address}?tag=renowned&limit=50`);
    const holders = normalizeHolders((curlData as Record<string, unknown>).list);
    const kolHolders = normalizeHolders(
      kolData ? (kolData as Record<string, unknown>).list : []
    );
    const result: HolderResult = { holders, kolHolders };
    holderCache.set(address, result);
    debug(`Holders for ${address}: ${holders.length} holders, ${kolHolders.length} KOLs (via curl)`);
    return result;
  }

  // Strategy 2: Playwright (slower ~11s, but bypasses Cloudflare)
  try {
    const rawHolders = await playwrightFetch(address);
    const holders = normalizeHolders(rawHolders);
    const result: HolderResult = { holders, kolHolders: [] };
    holderCache.set(address, result);
    return result;
  } catch (err) {
    throw new Error(`GMGN fetch failed for ${address}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/** Gracefully shut down the Playwright browser */
export async function shutdown(): Promise<void> {
  if (browser) {
    await browser.close().catch(() => {});
    browser = null;
  }
}
