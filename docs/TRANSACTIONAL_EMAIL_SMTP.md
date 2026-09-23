# Custom-branded auth emails (SMTP) — Supabase

## Which sender address to use
`noreply@chrisviscustech.netlify.app` is NOT usable — you don't control
netlify.app, so SPF/DKIM can never verify it and Gmail will treat mail from
it as spoofing. Use the apex domain you own:
`no-reply@chrisviscustech.com` (or `hello@…` if you prefer). If the domain
registration is pending, keep Supabase's system sender until it exists.

## 1 · Pick a transactional provider (free tiers all fine)
- **Resend** (recommended, 3,000/mo free): resend.com → Domains → Add
  `chrisviscustech.com` → it shows 1 SPF TXT + 3 DKIM CNAME records → add
  them at your DNS host → verify. Create an API key → also shows SMTP
  credentials (host `smtp.resend.com`, user `resend`, port 587/TLS).
- **Mailtrap** or **SendGrid**: same shape — verify domain (SPF+DKIM), then
  an SMTP host/user/key. SendGrid free = 100/day; Mailtrap dev tier is for
  TESTING (don't ship its sandbox endpoint to prod: it swallows mail).

## 2 · Supabase SMTP settings
Supabase dashboard → Project Settings → Authentication → **SMTP Settings**
(or Auth → SMTP in the new UI):
- Host: e.g. `smtp.resend.com` · Port: **587** · Username: `resend` ·
  Password: the API key · Connection secure: **STARTTLS** → Save.
- Same page: **Rate limits** — leave defaults; **Email → Secure email
  change** ON.

## 3 · Sender identity
Auth → Email → **Sender email** `no-reply@chrisviscustech.com`,
**Sender name** `Chrisviscus Technologies`, Reply-to `support@chrisviscustech.com`.

## 4 · Templates
Auth → Email Templates. Edit **Confirm signup** and **Reset password** (leave
Invite/Magic Link unless used). Paste-safe branded skeleton (replace the
default HTML; `{{ .ConfirmationURL }}` / `{{ .Token }}` are the variables):

```html
<div style="font-family:Inter,Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;border:1px solid #e5e7eb;border-radius:12px">
  <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px">
    <img src="https://chrisviscustech.netlify.app/logo-header.png" alt="Chrisviscus Technologies" width="180">
  </div>
  <h2 style="margin:0 0 8px;font-size:20px">One step left</h2>
  <p style="color:#4b5563;font-size:14px;line-height:1.55">Confirm this email to activate your Chrisviscus account — orders and service bookings are private to it.</p>
  <a href="{{ .ConfirmationURL }}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:700;margin:10px 0">Confirm email</a>
  <p style="color:#9ca3af;font-size:12px">Ignore this email if you didn't sign up. Link expires in 24 h.</p>
</div>
```
For **Reset password** the button URL is the same variable
(`{{ .ConfirmationURL }}`) and the copy becomes: "We received a request to
reset your password. The link is valid for one hour."

## 5 · Verify
1. New (unmatched) email → signup on the live site → the confirm mail must
   arrive in Gmail **Inbox** with "Signed-by: chrisviscustech.com" and
   show SPF/DKIM pass in Show original.
2. Forgot-password flow → recovery mail with branded template → link must
   land on the site and complete at /update-password.
3. Until SMTP is configured Supabase's sender works but lands in Promotions
   /Spam more often — that's why this doc exists.

## 6 · Netlify note
SMTP credentials live ONLY in Supabase's dashboard — no env vars, no build
secrets. Nothing here changes the Netlify env checklist.
