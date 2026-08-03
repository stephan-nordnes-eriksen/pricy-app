# Push notifications + barcode scanner (upstream PROMPT 04)

Backend plan for `proto/PROMPT - 04 Push & Barcode Scanner.md` (fetched
2026-08-03, not yet built upstream). Upstream prototypes BOTH flows as
simulations — mock permission sheet, fake EAN detection. The backend
halves are very different sizes.

## Scanner: small and real

The fake part upstream is only the camera. The lookup is one endpoint:

1. **`GET /api/products?ean=<digits>`** — resolve via the `eans` table
   (runtime rows win, same routing ingest uses), serve the row through
   `rowsFor`. Hidden `ean-*` rows stay hidden (the 2026-07-26 rule —
   a scanned backlog row returns not-found, not a half-served page).
   Not-found response includes nothing; optionally log the miss (a
   scanned-but-unknown EAN is free product-discovery signal — a
   `scan_misses` counter table, or skip; YAGNI until scanning exists).
2. **Real camera is client work, no backend**: `BarcodeDetector` where
   available (Chrome/Android — the installed-PWA audience), no fallback
   library v1. Lives in boot/upstream sync, not the worker.
3. The "in-store price vs best online" compare card needs no backend —
   it's the served offers. Upstream's fabricated in-store price
   (`best + 300…600`, labelled "eksempel") must NOT survive the sync:
   real version compares the scanned shelf price the user is looking at
   (or shows best online only). Flag in the sync prompt.

## Push: real work, already decided against (for now)

alert-notification-claims.md (2026-07-19, still open) already ruled:
web push is a service worker + subscription storage + VAPID + per-device
rows, and alerts only fire when ingest runs — the manual laptop crawl.
Push delivering "within minutes" is false until
**ingest-crawl-robustness (B)** makes checks scheduled. That decision
stands; upstream's simulated flow changes nothing server-side.

When B lands and push is greenlit:

1. `push_subscriptions (user_id, endpoint TEXT PRIMARY KEY, p256dh, auth, created_at)`
   + `POST/DELETE /api/push` (session).
2. VAPID keypair as a secret; Web Push JWT is ES256 via WebCrypto —
   no library needed on Workers, ~100 lines incl. the aes128gcm
   payload encryption.
3. `fireAlerts` gains a second channel next to email; per-type
   preferences already persist in `users.settings` (the existing
   toggles stop being dead UI).
4. `pwa/sw.js` gains `push`/`notificationclick` handlers (build.js owns
   `pwa/` — no upstream edit).
5. Tests: subscribe/unsubscribe, alert fans out to both channels,
   expired-endpoint (410) rows are deleted.

## Order

Scanner lookup (step 1) is a one-evening change — do it with the
upstream sync. Push waits on B; until then the synced UI's opt-in flow
must be gated or labelled preview (same posture as magic-link email).
