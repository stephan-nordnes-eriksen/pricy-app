// Manual push trigger (temporary ops surface until price-drop pushes ride
// the alert cron):
//   node tools/push.mjs "Title" ["Body text"] [/url] [email]
// email narrows the send to one account's devices; default is everyone.
const base = process.env.PRICY_URL || 'https://pricy.no';
const auth = { authorization: `Bearer ${process.env.INGEST_TOKEN || (await import('node:fs')).readFileSync(new URL('./.ingest-token', import.meta.url), 'utf8').trim()}` };

const [title, body, url, email] = process.argv.slice(2);
if (!title) {
  console.error('usage: node tools/push.mjs "Title" ["Body"] [/url] [email]');
  process.exit(1);
}
const res = await fetch(base + '/api/admin/push', {
  method: 'POST',
  headers: { ...auth, 'content-type': 'application/json' },
  body: JSON.stringify({ title, body, url, email }),
});
console.log(res.status, JSON.stringify(await res.json()));
