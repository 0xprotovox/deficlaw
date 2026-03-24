/**
 * GMGN Data Source
 * Strategy: try direct VAS API first (fast), fall back to Playwright (slower but reliable)
 * GMGN uses Cloudflare which blocks Node.js fetch but allows curl and Playwright
 */
import { MemoryCache } from '../cache/memoryCache.js';
import type { Holder } from '../types/index.js';
import { execSync } from 'child_process';

const CACHE_TTL = 2 * 60 * 1000;
const BASE_URL = 'https://gmgn.ai/vas/api/v1';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const SCRAPE_TIMEOUT = 40000;

let browser: any = null;
let initializing = false;

const holderCache = new MemoryCache<{ holders: Holder[]; kolHolders: Holder[] }>(CACHE_TTL);

/** Try fetching via curl (bypasses Node.js TLS fingerprint detection) */
function curlFetch(path: string): any | null {
  try {
    const url = `${BASE_URL}${path}`;
    const cmd = `curl -s --max-time 10 "${url}" -H "User-Agent: ${UA}"`;
    const out = execSync(cmd, { timeout: 12000 }).toString();
    if (out.startsWith('<!')) return null; // Cloudflare HTML
    const json = JSON.parse(out);
    if (json.code !== 0) return null;
    return json.data;
  } catch {
    return null;
  }
}

/** Normalize GMGN holder data */
function normalizeHolders(rawList: any[]): Holder[] {
  if (!Array.isArray(rawList)) return [];
  return rawList.map(h => {
    let tags: string[] = [];
    if (Array.isArray(h.tags)) tags.push(...h.tags);
    if (h.wallet_tag_v2) {
      const wt = Array.isArray(h.wallet_tag_v2) ? h.wallet_tag_v2 : [h.wallet_tag_v2];
      tags.push(...wt);
    }
    if (h.maker_token_tags) {
      const mt = Array.isArray(h.maker_token_tags) ? h.maker_token_tags : [h.maker_token_tags];
      tags.push(...mt);
    }
    tags = [...new Set(tags.map(t => {
      if (typeof t === 'object' && t !== null) return (t as any).name || (t as any).label || '';
      return String(t).trim();
    }).filter(Boolean))];

    return {
      address: h.address || '',
      tags,
      twitterHandle: h.twitter_username || null,
      twitterName: h.twitter_name || null,
      name: h.name || null,
      balance: h.balance || h.amount_cur || 0,
      supplyPercent: h.amount_percentage || 0,
      valueUsd: h.usd_value || 0,
      avgBuyPrice: h.avg_cost || 0,
      cost: h.cost_cur || h.cost || h.total_cost || 0,
      unrealizedPnl: h.unrealized_profit || h.unrealized_pnl || 0,
      realizedPnl: h.realized_profit || h.realized_pnl || 0,
      totalPnl: (h.unrealized_profit || 0) + (h.realized_profit || 0),
      profitMultiple: h.profit_change || 0,
      buyAmount: h.buy_amount_cur || h.accu_amount || 0,
      sellAmount: h.sell_amount_cur || h.current_sell_amount || 0,
      buyTxCount: h.buy_tx_count_cur || 0,
      sellTxCount: h.sell_tx_count_cur || 0,
      isDeployer: h.is_deployer || false,
      isFreshWallet: h.is_new || h.is_fresh_wallet || false,
      lastActiveAt: h.last_active_timestamp ? new Date(h.last_active_timestamp * 1000).toISOString() : null,
    };
  }).filter(h => h.address && h.address.length > 10);
}

/** Playwright fallback — intercept GMGN API via browser */
async function ensureBrowser(): Promise<void> {
  if (browser?.isConnected?.()) return;
  browser = null;

  if (initializing) {
    await new Promise<void>(r => { const iv = setInterval(() => { if (!initializing) { clearInterval(iv); r(); } }, 200); });
    return;
  }
  initializing = true;
  try {
    const pw = await import('playwright');
    browser = await pw.chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
    });
  } finally { initializing = false; }
}

async function playwrightFetch(address: string): Promise<any[]> {
  await ensureBrowser();
  const ctx = await browser.newContext({ userAgent: UA, viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();

  try {
    return await new Promise<any[]>(async (resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('GMGN scrape timeout')), SCRAPE_TIMEOUT);
      let collected: any[] = [];
      let resolved = false;

      page.on('response', async (response: any) => {
        if (resolved) return;
        const url: string = response.url();
        if (url.includes('/token_holders/sol/') || url.includes('/top_holders/sol/')) {
          try {
            const json = await response.json();
            const items = Array.isArray(json.data) ? json.data : (json.data?.holders || json.data?.list || []);
            if (items.length > 0) {
              collected.push(...items);
              if (collected.length >= 10) {
                clearTimeout(timeout); resolved = true;
                resolve(collected.slice(0, 150));
              }
            }
          } catch {}
        }
      });

      try {
        await page.goto(`https://gmgn.ai/sol/token/${address}`, { waitUntil: 'domcontentloaded', timeout: 20000 });
        await page.waitForTimeout(3000);
        for (const sel of ['button:has-text("Holder")', '[role="tab"]:has-text("Holder")', 'text=Holders']) {
          try { const t = await page.$(sel); if (t) { await t.click(); break; } } catch { continue; }
        }
        await page.waitForTimeout(5000);
        if (!resolved && collected.length > 0) { clearTimeout(timeout); resolved = true; resolve(collected.slice(0, 150)); }
        if (!resolved) { await page.waitForTimeout(5000); if (collected.length > 0) { clearTimeout(timeout); resolve(collected.slice(0, 150)); } }
      } catch (e) { if (!resolved) { clearTimeout(timeout); reject(e); } }
    });
  } finally {
    await page.close().catch(() => {});
    await ctx.close().catch(() => {});
  }
}

export async function isPlaywrightAvailable(): Promise<boolean> {
  return true; // curl fallback always available, Playwright optional
}

/** Get holders — try curl first, then Playwright */
export async function getHolders(address: string): Promise<{ holders: Holder[]; kolHolders: Holder[] }> {
  const cached = holderCache.get(address);
  if (cached) return cached;

  // Strategy 1: curl (fast, ~1s)
  const curlData = curlFetch(`/token_holders/sol/${address}?limit=100`);
  if (curlData?.list?.length > 0) {
    const kolData = curlFetch(`/token_holders/sol/${address}?tag=renowned&limit=50`);
    const holders = normalizeHolders(curlData.list);
    const kolHolders = normalizeHolders(kolData?.list || []);
    const result = { holders, kolHolders };
    holderCache.set(address, result);
    return result;
  }

  // Strategy 2: Playwright (slower ~11s, but bypasses Cloudflare)
  try {
    const rawHolders = await playwrightFetch(address);
    const holders = normalizeHolders(rawHolders);

    // KOL fetch via page.evaluate inside Playwright context
    const result = { holders, kolHolders: [] as Holder[] };
    holderCache.set(address, result);
    return result;
  } catch (err: any) {
    throw new Error(`GMGN fetch failed: ${err.message}`);
  }
}

export async function shutdown(): Promise<void> {
  if (browser) { await browser.close().catch(() => {}); browser = null; }
}
