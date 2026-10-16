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

Admins today: Stacey (`taceycollections@gmail.com`) and Sheldon
(`odhissheldon254@gmail.com`, backup).

**Deleting and recreating an account gives it a new id**, so it drops off the
admin list: run step 2 again afterwards. **To change an email** instead:
Authentication → Users → the account → change the email. It stays an admin,
because `shop_admins` points at the account, not the address.

### Forgotten passwords

The admin sign-in screen has **Forgot password?**. It emails a link back to
`/admin.html` (allowed under Authentication → URL Configuration, with the Site
URL set to the shop), where she chooses a new password and is signed in.

**Pending: a custom email sender.** Supabase's built-in sender only mails
members of the Supabase team, at most 2 an hour, so the reset email cannot
reach Stacey yet. To fix it: on her Gmail, turn on 2-Step Verification, create
an app password (myaccount.google.com/apppasswords), then in Supabase →
Authentication → Emails → SMTP Settings enable custom SMTP with host
`smtp.gmail.com`, port `465`, username and sender `taceycollections@gmail.com`,
sender name `Tacey Collections`, and the app password. Until then the page
says the email couldn't be sent, rather than pretending it was.

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
