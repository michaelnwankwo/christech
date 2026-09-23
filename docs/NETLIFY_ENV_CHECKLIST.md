# Netlify environment — complete checklist (this codebase)

All commands below run in the VS Code terminal at the repo root.
Re-link first if any command says "No project id": `npx netlify link
chrisviscustech`.

## Variables (Site configuration → Environment variables)
| Key | Example/notes | Treat as secret? | Rebuild needed |
|---|---|---|---|
| NEXT_PUBLIC_SUPABASE_URL | https://fmjfwkgrrwacmdecixjq.supabase.co | no | yes (bakes into bundle) |
| NEXT_PUBLIC_SUPABASE_ANON_KEY | the anon public key | no | yes |
| NEXT_PUBLIC_APP_URL | https://chrisviscustech.netlify.app | no | yes |
| NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY | pk_live_… (the .env.local ones are dummies) | no | yes |
| NEXT_PUBLIC_USE_DEMO_DATA | "true"/"false" (public demo switch) | no | yes |
| NEXT_PUBLIC_AUTH_GOOGLE_ENABLED | "true" only after Supabase Google provider is configured | no | yes |
| USE_DEMO_DATA | server-side override, read at request time | yes-ish, harmless either way | no |
| SUPABASE_SERVICE_ROLE_KEY | only needed by server jobs — the web app never reads it | YES | no |
| PAYSTACK_SECRET_KEY | sk_live_… | YES | no |
| CRON_SECRET | long random string (api/jobs) | YES | no |
| FX_PROVIDER_BASE_URL | https://open.er-api.com/v6 (public endpoint) | no | no |
| FX_PROVIDER_API_KEY | optional (leave unset on er-api) | YES | no |

Note: the brief's `NEXT_PUBLIC_SITE_URL` is NOT read anywhere — this
codebase's public origin var is **NEXT_PUBLIC_APP_URL** (metadata + health).
Don't create the other name; it would silently do nothing.

## Set commands (one line each, values quoted)
```powershell
npx netlify env:set NEXT_PUBLIC_SUPABASE_URL "https://fmjfwkgrrwacmdecixjq.supabase.co"
npx netlify env:set NEXT_PUBLIC_SUPABASE_ANON_KEY "<anon key>"
npx netlify env:set NEXT_PUBLIC_APP_URL "https://chrisviscustech.netlify.app"
npx netlify env:set NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY "pk_live_..."
npx netlify env:set PAYSTACK_SECRET_KEY "sk_live_..."
npx netlify env:list
```

## Secrets scanning
netlify.toml carries `SECRETS_SCAN_OMIT_KEYS` (the public-by-design values
whose text legitimately appears in .env.example/docs/code defaults). Keep
scanning ENABLED. If a var is marked secret in the UI but its value is meant
to be public, unmark it rather than growing the omit list.

## Continuous deployment (git push → live)
Already true today: the site auto-deploys on pushes to `main`. Verify any
time with (camelCase methods — `netlify api` uses OpenAPI operationIds; in
PowerShell escape inner quotes as shown):
```powershell
npx netlify api getSite --data '{\"siteId\":\"chrisviscustech.netlify.app\"}' | Select-String -Pattern "repo_url|branch|deploy"
npx netlify api listSiteBuilds --data '{\"siteId\":\"chrisviscustech.netlify.app\"}' | Select-String -Pattern '"state"|"branch"' | Select-Object -First 8
```
If the dashboard ever shows publishing "paused": Deploys → ⋯ → or
`npx netlify api updateSite --data '{\"siteId\":\"chrisviscustech.netlify.app\",\"deploy_prod_branch_only\":true}'`.

## Post-change verification (browser)
- `https://chrisviscustech.netlify.app/api/health` → demo vs live truth.
- Push anything (even `git commit --allow-empty -m redeploy`) after changing
  a NEXT_PUBLIC_* value — those bake at build time.
