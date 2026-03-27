/**
 * deficlaw speed benchmarks
 * Tests each tool's response time and prints results in a table.
 * Run with: npm test
 */
import { handleGetPrice } from './tools/getPrice.js';
import { handleAnalyzeToken } from './tools/analyzeToken.js';
import { handleSearchToken } from './tools/searchToken.js';

// Well-known Solana token for testing (BONK)
const TEST_TOKEN = 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263';
const TEST_SEARCH = 'BONK';

interface BenchResult {
  name: string;
  timeMs: number;
  status: 'OK' | 'FAIL';
  detail: string;
}

async function bench(name: string, fn: () => Promise<string>): Promise<BenchResult> {
  const start = Date.now();
  try {
    const detail = await fn();
    return { name, timeMs: Date.now() - start, status: 'OK', detail };
  } catch (err) {
    return { name, timeMs: Date.now() - start, status: 'FAIL', detail: err instanceof Error ? err.message : String(err) };
  }
}

async function main() {
  console.log('deficlaw v0.6.0 — Speed Benchmarks');
  console.log('='.repeat(70));
  console.log(`Test token: ${TEST_TOKEN}`);
  console.log(`Test search: "${TEST_SEARCH}"`);
  console.log('');

  const results: BenchResult[] = [];

  // 1. get_price
  results.push(await bench('get_price', async () => {
    const r = await handleGetPrice({ token: TEST_TOKEN, chain: 'solana' });
    if ('error' in r) throw new Error(r.error);
    return `$${r.priceUsd} (${r.symbol})`;
  }));

  // 2. search_token
  results.push(await bench('search_token', async () => {
    const r = await handleSearchToken({ query: TEST_SEARCH, limit: 5 });
    if ('error' in r) throw new Error(r.error);
    return `${r.count} results`;
  }));

  // 3. analyze_token (quick mode — no holders)
  results.push(await bench('analyze_token (quick)', async () => {
    const r = await handleAnalyzeToken({ address: TEST_TOKEN, chain: 'solana', include_holders: false });
    if ('error' in r && typeof r.error === 'string') throw new Error(r.error);
    const data = r as Record<string, unknown>;
    const meta = data.meta as { fetchTimeMs: number };
    return `${meta.fetchTimeMs}ms internal`;
  }));

  // 4. analyze_token (full — with holders)
  results.push(await bench('analyze_token (full)', async () => {
    const r = await handleAnalyzeToken({ address: TEST_TOKEN, chain: 'solana', include_holders: true });
    if ('error' in r && typeof r.error === 'string') throw new Error(r.error);
    const data = r as Record<string, unknown>;
    const meta = data.meta as { fetchTimeMs: number; sources: string[] };
    const holders = data.holders as { total: number } | undefined;
    return `${meta.fetchTimeMs}ms internal, ${holders?.total ?? 0} holders, sources: ${meta.sources.join('+')}`;
  }));

  // Print table
  console.log('Results:');
  console.log('-'.repeat(70));
  console.log(
    padR('Test', 28) +
    padR('Time', 10) +
    padR('Status', 8) +
    'Detail'
  );
  console.log('-'.repeat(70));

  for (const r of results) {
    const timeStr = r.timeMs < 1000 ? `${r.timeMs}ms` : `${(r.timeMs / 1000).toFixed(1)}s`;
    console.log(
      padR(r.name, 28) +
      padR(timeStr, 10) +
      padR(r.status, 8) +
      r.detail
    );
  }

  console.log('-'.repeat(70));

  const totalMs = results.reduce((s, r) => s + r.timeMs, 0);
  const failures = results.filter(r => r.status === 'FAIL').length;
  console.log(`Total: ${(totalMs / 1000).toFixed(1)}s | ${results.length - failures}/${results.length} passed`);

  if (failures > 0) {
    console.log(`\nFailed tests:`);
    for (const r of results.filter(r => r.status === 'FAIL')) {
      console.log(`  ${r.name}: ${r.detail}`);
    }
    process.exit(1);
  }
}

function padR(s: string, w: number): string {
  return s.length >= w ? s.slice(0, w) : s + ' '.repeat(w - s.length);
}

main().catch(err => {
  console.error('Benchmark failed:', err);
  process.exit(1);
});
