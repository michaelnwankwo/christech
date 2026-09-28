# Production Supabase verification

## Finding

The deployed storefront is querying Supabase, not rendering the static demo fixture:

- `GET https://chrisviscustech.netlify.app/api/health` successfully queried `public.products`, reported 10 active rows, and confirmed the generated `in_stock` column from migration 0008.
- Product image URLs are present on the deployed catalog while `src/lib/demo/data.ts` has empty `imageUrls` for the original products. That is an independent live-data signal.
- The old health response's `demoActive: true` was misleading: `demoActive()` meant “fallback is eligible,” not “this request used fallback.” The endpoint now reports actual `databaseUnavailable()` state and an explicit `mode: "live" | "demo"`.

The application catalog uses the public URL + anon key through `src/lib/supabase/browser.ts` and `server.ts`. `SUPABASE_SERVICE_ROLE_KEY` is used only by privileged server code in `admin.ts`; it is not needed for public catalog reads.

## Netlify check

In **Netlify → Site configuration → Environment variables**, verify all deploy contexts that serve production:

- `NEXT_PUBLIC_SUPABASE_URL=https://<LIVE_PROJECT_REF>.supabase.co`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key copied from that same project>`
- `SUPABASE_SERVICE_ROLE_KEY=<service-role key from that same project>` (server/admin jobs only)
- `NEXT_PUBLIC_USE_DEMO_DATA=false`
- `USE_DEMO_DATA=false`
- `DEMO_FALLBACK=false` (recommended in production so database failures fail visibly)

The URL and both keys must come from **Supabase Dashboard → Project Settings → API** for the same live project. Never expose the service-role key as a `NEXT_PUBLIC_*` variable.

After changing either `NEXT_PUBLIC_*` value, trigger a fresh Netlify production deploy because those values are compiled into the client bundle.

## Secret-safe proof

Open `https://chrisviscustech.netlify.app/api/health` and require:

```json
{
  "ok": true,
  "mode": "live",
  "env": {
    "supabasePublicEnvConfigured": true,
    "supabaseProjectRef": "<LIVE_PROJECT_REF>",
    "demoActive": false
  },
  "catalog": {
    "activeProducts": 30,
    "migration0008InStockColumn": "present"
  }
}
```

Compare `supabaseProjectRef` to the live project's dashboard URL. The health endpoint never returns keys.

Optional direct API test (anon key is public but should still be handled carefully in shell history):

```bash
curl --fail \
  -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $NEXT_PUBLIC_SUPABASE_ANON_KEY" \
  -H "Prefer: count=exact" \
  "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/products?select=id&is_active=eq.true"
```

A `200` response plus a count matching `/api/health` proves the URL/key pair addresses the expected catalog. A successful query proves connectivity; matching the exposed project ref to the dashboard is what proves it is the intended primary project rather than another valid Supabase project.
