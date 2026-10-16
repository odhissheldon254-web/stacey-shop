# How Tacey Collections runs

Live at **https://taceycollections.odhis.co.ke**. No server of our own and nothing to pay
for except the domain.

| Piece | What it does | Where |
|---|---|---|
| **GitHub Pages** | Serves the pages, free, never sleeps | repo `odhissheldon254-web/stacey-shop`, branch `master` |
| **Supabase** | Stores the catalogue and photos, handles Stacey's login | project `tacey-collections` (org Vintage Tech) |
| **Truehost** | Owns `odhis.co.ke`; one record points the shop at GitHub | DNS Manager → zone `odhis.co.ke` |

- **Storefront:** `/`, departments `/women` `/men` `/kids` `/shop`, content
  pages `/about` `/delivery` `/size-guide` `/faq` `/contact`
- **Stacey's admin:** `/admin.html`. She signs in with email + password.

## Publishing a change

Push to `master`. The **Publish site** workflow (`.github/workflows/pages.yml`)
runs `npm run build` and `npm test`, and only publishes `_site/` if every test
passes. A broken build never goes live.

## Running locally

```bash
npm run build      # sync shared header/footer, then write _site/
npm start          # preview _site/ at http://localhost:3000
npm test           # pages, SEO, links, and the Supabase data layer
```

The local preview reads the **real** Supabase catalogue, so signing in to the
local admin and saving changes the live shop.

### Editing the shared header and footer

The footer, the content-page header and the common `<head>` tags live once in
`partials/` and are stitched into every page between marker comments
(`<!-- @partial:footer -->` … `<!-- /@partial:footer -->`). Edit the file in
`partials/`, run `npm run build`, and commit. A test fails if any page drifts.

## Supabase

`supabase/setup.sql` creates everything: the catalogue table, the security
rules, the photo bucket and the starting products. It is safe to re-run.

The rules, enforced by Supabase itself:

- anyone can **read** the catalogue and view photos
- only accounts listed in `shop_admins` can **change** the catalogue or
  upload photos
- new sign-ups are **off** (Authentication → Sign In / Providers), so nobody
  can create their own account

`store.js` contains only the **publishable** key, which on its own can only
read. Never put the secret / `service_role` key in the website; a test fails
if one appears.

### Adding or changing an admin

1. Supabase → **Authentication → Users → Add user → Create new user**. Enter
   the email and password, tick **Auto Confirm User**.
2. **SQL Editor**, run:

   ```sql
   insert into public.shop_admins (user_id)
   select id from auth.users where email = 'her-email@example.com'
   on conflict do nothing;
   ```

**To change her email later:** Authentication → Users → her account → change
the email. She stays an admin, because `shop_admins` points at her account,
not at the address. **To reset her password:** same screen → Send password
recovery, or set a new one.

## Custom domain

Truehost zone `odhis.co.ke` has two records for the shop:

| Type | Name | Target | Serves |
|---|---|---|---|
| CNAME | `taceycollections` | `odhissheldon254-web.github.io.` | the shop (this repo) |
| CNAME | `tacey` | `odhissheldon254-web.github.io.` | the old address, forwarding to the new one |

GitHub (repo → Settings → Pages) has `taceycollections.odhis.co.ke` as the custom domain
with **Enforce HTTPS** on; GitHub renews the certificate itself. The `CNAME`
file GitHub needs is written into `_site/` by `build-site.js`.

The shop first lived at `tacey.odhis.co.ke`. That address is kept alive by a
tiny separate repo, `odhissheldon254-web/tacey-redirect`, whose only job is to
send every visitor (path included) to `https://taceycollections.odhis.co.ke`.
GitHub Pages allows one custom domain per repo, which is why it is separate.

The bare `odhis.co.ke` is free for other projects.
