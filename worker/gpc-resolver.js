// EAN→GPC-brick resolver seam (gpc-strict). This is the ONLY writer of
// product categorization — no name/breadcrumb guessing exists anymore.
//
// Contract: resolveGtins(gtins, env) → Promise<Map<gtin, brickCode|null>>
//   - gtins arrive eanKey-normalized (digits only, no leading zeros)
//   - null = the source knows no GPC category for this GTIN (status 'none')
//   - the caller validates returned codes against worker/gpc.json; an
//     unknown/inactive code is treated as null, never stamped
//
// STUB implementation: answers from the checked-in fixture
// (worker/gpc-fixture.json — demo/dev EANs curated to real bricks, so tests
// and dev exercise the full pipeline) merged under env.GPC_FIXTURE (JSON
// string or object; test override). Everything else resolves null.
//
// The real implementation is Verified by GS1 (GS1 Norway GRP API):
//   POST {env.VBG_API_URL}/api/v2/Grp/gtins/verified  {"gtins": [...]}
//   gtins zero-padded to 14 digits, auth via env.VBG_API_KEY (secret),
//   batches ≤500 per POST; map each result's gpcCategoryCode (nullable)
//   back to its eanKey. Set RESOLVER_SOURCE = 'vbg'.
//   LICENSING BOUNDARY: read and DISCARD every other response field
//   (brandName, productDescription, productImageUrl, netContent, licence…)
//   — only gtin → brick + timestamp + provenance may ever be stored. The
//   gpc table's five columns are that boundary; do not widen them.
import fixture from './gpc-fixture.json' with { type: 'json' };

export const RESOLVER_SOURCE = 'stub';

export async function resolveGtins(gtins, env) {
  const extra = typeof env.GPC_FIXTURE === 'string' ? JSON.parse(env.GPC_FIXTURE) : (env.GPC_FIXTURE || {});
  const fix = { ...fixture, ...extra };
  return new Map(gtins.map(g => [g, fix[g] ?? null]));
}
