# Supabase setup — schema, RLS, and live-data verification

This repo already ships the full Supabase stack; this page covers (a) where
each piece lives, (b) applying the new `0008` catalog/cart migration from the
Dashboard, and (c) the end-to-end test script. Windows-first commands; paths
are relative to the repo root.

## 1. Environment (`src/lib/supabase/*`, all live code — nothing to create)

| Key (`.env.local`) | Used by | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | browser + server clients | Must be the real `https://<ref>.supabase.co` origin — placeholder text is *detected* (`config.ts`) and degrades to demo mode instead of crashing the RSC stream. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | browser + server clients | RLS is the boundary; this key can never exceed the policies below. |
| `SUPABASE_SERVICE_ROLE_KEY` | `admin.ts` ONLY (server) | Bypasses RLS. Never imported by any `"use client"` file, never sent to the browser, never committed. |

Client modules: `src/lib/supabase/browser.ts` (interactive client — the
brief's "client.ts"), `server.ts` (RSC + route handlers, cookie-scoped
`@supabase/ssr`), `middleware.ts` (`updateSession`, wired by
`src/middleware.ts` next to `app/` — that location is load-bearing, see the
comment there), `config.ts` (env guards). After editing `.env.local`, restart
`npm run dev` — `NEXT_PUBLIC_*` values bake in at build time.

## 2. Applying migrations (Dashboard → SQL Editor)

Run the files **in order**, one execution each, every time:

`0001_init` → `0002_triggers` → `0003_rls` → `0004_helpers` →
`0005_checkout` → `0006_payments` → `0007_realtime_seed` → **`0008_catalog_cart`**

All eight are idempotent (create-if-missing / `on conflict do nothing`
seeding / `create or replace`), so re-running is safe. `0008` adds:
`public.categories` (+seed, public-read/staff-write RLS),
`products.in_stock` (GENERATED `inventory_qty > 0` — cannot drift, no dual
write), `public.cart_items` (user OR guest-session ownership CHECK, partial
unique indexes that double as the upsert conflict targets), and
`merge_guest_cart(p_session_id)` (SECURITY DEFINER login fold-in, returns the
number of rows folded).

## 3. RLS map (who can do what, without any app-side trust)

| Table | anon | authenticated | staff/admin |
| --- | --- | --- | --- |
| `products`, `categories` | SELECT (active rows) | SELECT | full write |
| `cart_items` | guest rows, **only** when the request header `x-cart-session` equals the row's `session_id` | own rows only (`user_id = auth.uid()`), upsert/delete | full (cleanup) |
| `users` (profiles) | — | read own; update own non-identity columns | read all |
| `orders`/`order_items`/quotes/payments | none | own reads; writes ONLY via RPC (no customer INSERT policy — by design, money math is server-owned) | staff ops via RPC/admin views |
| `service_requests` (bookings) | — | insert own (status pinned `'requested'` by WITH CHECK); read own | read/act on all |

Guest `session_id` is a random uuid kept in localStorage under
`cv.guest-cart-session`: possession = access to that anonymous bucket
(capability model — it holds product ids and quantities only, no PII, no
amounts). The cart table is a **mirror**: checkout re-prices every line from
`products`/`services` in the `0005` RPC, so a hand-edited row can never
influence what is charged.

## 4. Auth / profile automation

`0002` installs trigger `on_auth_user_created` → `handle_new_auth_user()`, so
every signup (email or OAuth) gets its `public.users` row with role
`'customer'`; `protect_user_identity` stops the browser from changing `role`
or `email` even via RLS-passing writes. The header profile pill
(`UserMenu`) reads `full_name`/`email` from that row through the RLS
`users_read_own` policy — no extra wiring needed; sign-in into a previously
guest-used browser triggers `merge_guest_cart` automatically via
`useCartSync` (Providers).

## 5. Test script (do these in order)

1. **Live catalog** — `/products?category=cameras&min=50000000&max=400000000`
   returns only in-range active rows (`unit_price_minor` is kobo: ₦500,000 →
   `50000000`). Toggle a product's `inventory_qty` to 0 in Table Editor: the
   row must disappear once `available=1` is set (or flip `is_active`).
2. **Guest cart** — sign out, add 2 items, reload → cart survives (local AND
   `select * from cart_items where session_id = '<your cv.guest-cart-session>'`
   in SQL Editor shows mirrored rows). From a different browser (no login),
   try `select` with a *wrong* `x-cart-session` — RLS must return 0 rows.
3. **Login merge** — on the guest browser, create an account. Within ~1s the
   cart is still there; `cart_items` now shows rows owned by your new
   `user_id` and the guest bucket is empty. Add one more item, open a
   second browser already signed in → after hydration both devices hold the
   union (server wins per product, local-only lines ride along).
4. **Profile** — header pill shows your name; `/account` lists profile +
   orders; try `update public.users set role='admin' where id=auth.uid()`
   from the browser anon client — it must fail on policy.
5. **Checkout integrity** — edit `quantity` in your cart row to `999` via
   Dashboard, refresh, check out: the total changes only in UNITS at the
   honest catalog price — `0005` re-prices every line server-side, so no
   value you wrote into `cart_items` can set or lower a unit price.

Offline dev with no Supabase project: leave the env keys unset —
`DEMO_FALLBACK=1 npm run dev` serves the seeded mirror and the sync layer
stays silent by construction (no client is constructed at all).
