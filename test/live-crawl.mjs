// On-demand crawler check (`npm run test:crawlers`): scrapes ONE real page
// per shop in tools/crawl-urls.json and asserts a sane row, so a broken
// crawler is caught per-site before a full crawl. Hits live shop pages —
// deliberately NOT matched by `npm test`'s test/*.test.js glob.
import test from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { scrapeSource } from '../worker/sources.js';

const urlsByShop = JSON.parse(readFileSync(new URL('../tools/crawl-urls.json', import.meta.url), 'utf8'));
const shops = Object.entries(urlsByShop);

test('crawl-urls.json has shops configured', () => {
  assert.ok(shops.length, 'tools/crawl-urls.json is empty — nothing to test');
});

for (const [shop, { $ua, ...urls }] of shops) {
  test(`${shop} crawler`, async () => {
    const [pid, url] = Object.entries(urls)[0]; // ponytail: one page per shop is enough to prove the crawler works
    const rows = await scrapeSource(shop, { ua: $ua, urls: { [pid]: url } });
    assert.equal(rows.length, 1, `no row scraped from ${url} (see warn above for why)`);
    assert.ok(rows[0].price > 0, `bad price ${rows[0].price}`);
  });
}
