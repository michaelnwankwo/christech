# Chrisviscus Technologies — Storefront + Service Platform

Next.js 15 (App Router) · TypeScript strict · Supabase (Postgres/Auth/Realtime) · Paystack Inline.
Implemented from `Chrisviscus_Technologies_Full_Build_Specification.md` (the "blueprint").

Two deliberately separate domains:

| | Storefront | Service booking |
|---|---|---|
| Routes | `/`, `/products/**`, `/cart`, `/checkout` | `/services/**`, `/booking` |
| Client state | `src/stores/cart-store.ts` (persisted) | `src/stores/booking-draft-store.ts` (session-only) |
| Server truth | `currency_quotes` → `orders` + `order_items` | `service_requests` (no `order_id`, by design) |
| Payment | Paystack Inline → signed webhook finalization | none — staff quote/schedule workflow |

The booking modules never import the cart store; the storefront never imports
the booking store. `service_requests` has no FK into `orders` and vice versa.

## Repo map

```text
supabase/migrations/0001–0007  schema, triggers, RLS, checkout & payment RPCs, realtime + seed
src/app/(storefront)           home, product list/detail, cart, checkout (force-dynamic)
src/app/(services)             service list/detail, booking wizard (no cart drawer mounted)
src/app/account                profile, orders, order detail (Realtime), service requests
src/app/api                    quote · initialize · verify · service-requests · webhooks/paystack · fx · jobs/maintenance
src/components                 layout shell, sidebar accordion engine, cart, checkout, services, account
src/lib                        supabase clients, zod validation, security (rate limit, raw-body, origin),
                               currency (money/fx), shipping zones, paystack adapter + signature
src/stores                     zustand cart / storefront / booking-draft
src/hooks                      useCurrency · useOrderRealtime · useMediaQuery
scripts/db-verify.sh           applies ALL migrations on real Postgres + runs the §19 assertion battery
tests/                         vitest units (currency adapter, money math, cart store, signature, rate limit, schemas)
```

## Local development

```bash
npm install
cp .env.example .env.local          # fill Supabase + Paystack test keys
psql "$DATABASE_URL" -f supabase/migrations/0001_init.sql   # …through 0007 (or `supabase db push`)
npm run dev
```

Deterministic FX for dev/CI: set `MANUAL_FX_RATES=USD=0.00065;GBP=0.00051;EUR=0.00060`.

## Quality gates (all wired as commands)

```bash
npm run typecheck   # tsc --noEmit, strict + noUncheckedIndexedAccess
npm run test        # vitest (38 unit cases over the money/security/store cores)
npm run test:db     # real-Postgres verification battery (schema/RLS/triggers/RPCs/jobs)
npm run build       # production build (type-checks pages too)
```

`npm run test:db` needs a local Postgres with `postgresql-contrib` (pgcrypto).
It creates `chrisviscus_verify`, applies every migration verbatim, and asserts
the blueprint's §19 checklist: cross-tenant invisibility, role-escalation
block, booking-vs-cart segregation, quote expiry/hash rejection, webhook HMAC
idempotency, mismatch quarantine, inventory reservation/release, realtime
publication.

## Deployment sequence (blueprint §20.2)

1. Provision Supabase project (staging first). Run migrations 0001→0007 in the
   SQL editor or via `supabase db push` **as the `postgres` role** — the
   SECURITY DEFINER functions rely on Supabase's default RLS-bypass posture
   for migrations.
2. Confirm Realtime: `orders` + `order_events` are published by 0007.
3. Seeds ship with 0007 (products, services, rate cards); replace prices with
   the real catalog.
4. Paystack dashboard: set the webhook URL to
   `https://<host>/api/webhooks/paystack`, event `charge.success` (+ failed).
5. Configure env (see `.env.example`). `PAYSTACK_ENABLED_CURRENCIES=NGN,USD`
   must match the merchant account's actual charge currencies.
6. Deploy Next.js (Vercel/Node ≥ 20). Bind 0.0.0.0 behind TLS.
7. Cron `POST /api/jobs/maintenance` with `Authorization: Bearer $CRON_SECRET`
   every 5–15 minutes (expired-order release, quote purge, payload archive).
8. Smoke: sign up → browse → add product + add-on → quote (NGN/USD/GBP/EUR) →
   test Paystack card → confirm webhook-paid state arrives via Realtime.
9. Signed webhook test (staging):
   ```bash
   BODY='{"event":"charge.success","data":{"id":1,"reference":"CV-XXXXXXXX-ABC123","amount":41850000,"currency":"NGN","status":"success"}}'
   SIG=$(printf '%s' "$BODY" | openssl dgst -sha512 -hmac "$PAYSTACK_SECRET_KEY" -hex | awk '{print $2}')
   curl -sX POST -H "x-paystack-signature: $SIG" -H 'content-type: application/json' -d "$BODY" https://<host>/api/webhooks/paystack
   ```
10. Flip to live keys; repeat smoke with a ₦100 product or Paystack test
    mode; enable traffic.

## Security posture (summary)

- Amounts, shipping, FX, and charge currency are computed **server-side only**;
  the browser submits ids + quantities. `create_order_from_quote` re-prices and
  re-verifies against the quote hash before one atomic insert of order+items.
- Webhook: raw-body HMAC-SHA512, constant-time compare, JSON parsed **after**
  verification, `payment_events.event_key` unique = idempotent, mismatch →
  `payment_review` (never fulfillment), paid is terminal.
- GBP/EUR are display-only (Paystack has no charge support); the adapter can
  only narrow, never broaden, what `PAYSTACK_ENABLED_CURRENCIES` may charge.
- RLS everywhere; `users.role` mutations blocked by trigger for non-staff;
  booking inserts pinned to `requested`; `daily_sequences` revoked from
  clients; CSP is set per request in `src/middleware.ts` with a fresh nonce
  (`src/lib/security/csp.ts`) — scripts: `'self'` + nonce + `js.paystack.co`,
  frames: `*.paystack.co`, connect: `'self'` + Supabase + api.paystack.co.
  Do NOT move the CSP into `next.config headers()`: Next.js ships the RSC
  flight payload as inline scripts and a static CSP without a matching nonce
  blanks the page ("Connection closed" RSC stream errors in the console).

## Supabase SQL

`supabase/SUPABASE_SETUP.sql` is migrations 0001–0007 concatenated for the
Dashboard SQL Editor (paste once → Run → verification queries at the bottom).
`docs/ENVIRONMENT_SETUP_WINDOWS.md` covers `.env.local` for Windows dev.
- Rate limits (token buckets) on all five money endpoints + fx + cron;
  request-size caps; same-origin checks; PII-safe structured logs.

## Light-only visual system

`src/app/globals.css` is the single stylesheet: `#2563EB` accent, `#F8FAFC`
app background, `#FFFFFF` surfaces, `#0F172A` text, success `#22C55E`,
error `#EF4444`, Paystack navy as accent only. There is no dark-mode branch —
by contract. The uploaded logo lives at `public/brand/chrisviscus-logo.png`
(header + home hero + favicon).

## Offline demo layer (`src/lib/demo/`)

When Supabase is unconfigured or unreachable, every page, cart flow, quote,
and booking form renders from `src/lib/demo/data.ts` — a mirror of the
0007 seed (same SKUs, prices, zones, rate card) — behind a visible
"Demo data" banner. Policy:

- dev (`npm run dev`): fallback activates automatically on any DB failure;
- production: activates ONLY with `DEMO_FALLBACK=1` (staging smoke tests);
- money stays honest: demo quotes re-price from the server-side catalog copy
  (clients send ids + quantities only), `/api/checkout/initialize` refuses
  demo callers with 503 (Paystack never sees demo money), and demo quotes,
  tickets, and account rows all carry a `demo: true` / `(demo)` marker.
- the same React-cached probe opens the `/account/**` guard in middleware so
  the account views render demo rows instead of bouncing to /login.

Tests: `tests/demo-layer.test.ts` pins filter semantics, the bulky-wins
shipping rule, zone mapping, the missing-rate 503, quantity/dup/orphan/
booking-in-cart rejections, and uuid-shaped demo ids.

## Responsive contract (globals.css)

Mobile-first rules live at the bottom of `src/app/globals.css`:
`<meta viewport>` comes from the root layout (`export const viewport`), the
header collapses into a 44×44 hamburger + slide-down panel ≤768px
(`MobileNav.tsx`), product/service grids force `1 / 2 / auto-fill` columns
at `≤768 / ≤1024 / >1024`, the cart drawer becomes a safe-area-aware
bottom sheet, `.table-scroll` wraps the account tables, forms stack one
column with 44px controls and 16px inputs (kills iOS focus-zoom), and
`html { overflow-x: clip }` backstops horizontal drift. No component uses a
fixed pixel width; the services shell uses `.page-container`.
