# Local Windows Environment Setup — `.env.local`

Copy the block below to `<repo>\.env.local` (same folder as `package.json`) and replace the placeholder
values per the checklist. Restart `npm run dev` after any change.

```dotenv
# ── Supabase ────────────────────────────────────────────────────────────────
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOi...your_anon_public_key_here
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOi...your_service_role_secret_key_here

# ── Paystack ────────────────────────────────────────────────────────────────
NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY=pk_test_your_paystack_test_public_key_here
PAYSTACK_SECRET_KEY=sk_test_your_paystack_test_secret_key_here
PAYSTACK_ENABLED_CURRENCIES=NGN,USD

# ── FX (display conversion; server-side only) ───────────────────────────────
FX_PROVIDER_BASE_URL=https://open.er-api.com/v6
FX_PROVIDER_API_KEY=
FX_PROVIDER_BASE_CURRENCY=NGN
FX_CACHE_TTL_SECONDS=300
FX_MAX_AGE_SECONDS=3600
MANUAL_FX_RATES=USD=0.00065;GBP=0.00051;EUR=0.00060

# ── App ─────────────────────────────────────────────────────────────────────
NEXT_PUBLIC_APP_URL=http://localhost:3000
CRON_SECRET=replace_me_local_dev_cron_secret
CHECKOUT_QUOTE_TTL_SECONDS=600
```

The full per-variable checklist (purpose / where to obtain / Windows-specific notes) is maintained in the
project chat handoff and mirrors this file. Variable names were verified against every
`process.env.*` reference in `src/` (incl. `src/middleware.ts`) — no dead or missing keys.

## Windows quick notes

1. **Encoding**: save as **UTF-8 without BOM**. Windows PowerShell 5.x `Set-Content`/`Out-File` write a
   BOM that corrupts the first key. Safest: edit with VS Code ("UTF-8" in status bar, no "-with BOM"),
   or `notepad` on Win 11 (defaults to no BOM), or PowerShell 7+: `Set-Content -Encoding utf8NoBOM`.
2. **No quotes, no spaces around `=`**: values are literal; `KEY = "value"` will include the quotes and spaces.
3. **Verify it loaded**: `npx next dev` prints `Environments: .env.local` at startup.
4. **Supabase redirect allow-list**: Dashboard → Authentication → URL Configuration →
   Redirect URLs add `http://localhost:3000/auth/callback`; Site URL `http://localhost:3000`.
5. **Paystack webhooks from Windows**: Paystack only delivers to `https` URLs. For local e2e, tunnel:
   `npx ngrok http 3000` → set Dashboard → Settings → API Keys & Webhooks → event URL to
   `https://<tunnel-host>/api/webhooks/paystack` (Test mode). Without a tunnel, the in-app
   `/api/payments/verify` recovery path still finalizes payments server-side.
6. **LAN testing on a phone**: use `http://<your-windows-ip>:3000` for device testing and open the port:
   `netsh advfirewall firewall add rule name="Next 3000" dir=in action=allow protocol=TCP localport=3000`.
   Do not change `NEXT_PUBLIC_APP_URL` unless you want share metadata to point at that host.
7. **Generate a throwaway CRON_SECRET in PowerShell**: `[guid]::NewGuid().ToString('N')`.
8. This file is `.gitignore`d (see repo `.gitignore`); never commit real keys.

## Troubleshooting: blank page, CSP violation, or "Connection closed"

Symptom → cause → fix:

0. **Blank / misaligned specifically on a phone, with no console errors** — check the served HTML contains `<meta name="viewport" content="width=device-width, initial-scale=1">` (defined once in `src/app/layout.tsx` via `export const viewport`). If someone removed that export, every media query below 768px stops applying and the page renders on a ~980px virtual canvas. Also: if the app looks empty while `npm run dev` prints Supabase errors, that is the offline demo layer active (amber "Demo data" banner) — pages, cart, quotes, and booking all run on the seeded mock catalog until a real project is connected.

1. **Blank white page + console shows `Executing inline script violates
   the Content Security Policy directive "script-src ..."`** — a CSP without
   a `nonce-` source blocks Next.js's inline bootstrap/flight `<script>`
   tags. This is why CSP is minted per request in `src/middleware.ts`
   (see `src/lib/security/csp.ts`). If you hand-edited `next.config.ts` to
   add CSP back to `headers()`, remove it.
2. **`React Server Component Stream Error: Connection closed`** — the dev
   server died mid-render. Two historic causes, both fixed in the repo:
   static CSP (see above) and `new URL(process.env.NEXT_PUBLIC_SUPABASE_URL)`
   running at config-load time — a bare placeholder like
   `your_supabase_url_here` (no `https://`) crashed startup. URLs are now
   validated lazily and a missing/invalid Supabase config degrades to a
   clear "Supabase is not configured" error inside `npm run dev` output
   instead of a dead stream. If you still see it: `Ctrl-C` the dev server,
   delete `.next`, re-run `npm run dev`, and watch the **terminal** — the
   real error is printed there, not in the browser.
3. Ensure port 3000 is free (`Get-NetTCPConnection -LocalPort 3000`); a
   stale `next start` from a previous session is a common dev-server killer.
