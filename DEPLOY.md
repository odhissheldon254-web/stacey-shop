# Deploying Tacey Collections — free, online, and permanent

The shop is one small Node server (no npm dependencies) that serves the
storefront, the admin panel, and the products API.

- **Storefront:** `/` (index.html)
- **Stacey's admin:** `/admin.html` (password-protected, saves to the server)
- **API:** `/api/products` (public read), `PUT` requires login

## 1. Host the site on Render (free)

1. Push this repository to GitHub.
2. Go to [render.com](https://render.com) → **New → Web Service** → connect the repo.
   Render reads `render.yaml` automatically.
3. When prompted for environment variables, set:
   - `ADMIN_PASSWORD` — the passcode Stacey uses to log in at `/admin.html`
     (currently agreed as `2265`; you can change it any time in the Render
     dashboard). If unset, the server falls back to `2265` with a warning.
   - `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` — see step 2 (you can leave them
     empty at first, but product edits will then be lost whenever Render
     restarts the free service).
4. Deploy. Your shop is live at `https://stacey-shop.onrender.com` (or similar).

> **Free-tier note:** Render free services sleep after ~15 minutes without
> visitors; the first visit afterwards takes ~30–60 s to wake up. To keep it
> awake, create a free monitor at [uptimerobot.com](https://uptimerobot.com)
> that pings `https://YOUR-SITE.onrender.com/api/health` every 5 minutes.

## 2. Make product edits permanent with Supabase (free)

Render's free disk is wiped on every deploy/restart, so without this step
Stacey's stock edits eventually reset. Supabase's free tier fixes that.

1. Create a free account at [supabase.com](https://supabase.com) → **New project**.
2. In the project, open **SQL Editor** and run:

   ```sql
   create table shop_data (
     key text primary key,
     value jsonb not null
   );
   ```

3. In **Project Settings → API**, copy:
   - **Project URL** → set as `SUPABASE_URL` on Render
   - **service_role key** (under "Project API keys") → set as
     `SUPABASE_SERVICE_KEY` on Render. This key must never appear in the
     website code — only in Render's environment settings.
4. Redeploy. `GET /api/health` should now report `"storage": "supabase"`.
   On first run the server seeds Supabase from `data/products.json`.

## 3. Hand it to Stacey

Send her two things:

- the admin link: `https://YOUR-SITE.onrender.com/admin.html`
- the `ADMIN_PASSWORD` you chose

She logs in, flips the **In Stock / Out of Stock** switch on any product, and
the storefront updates instantly for customers. To change the password later,
edit `ADMIN_PASSWORD` in the Render dashboard (Environment tab) — active
sessions expire after 12 hours anyway.

## Running locally

```bash
npm start          # http://localhost:3000
npm test           # API + auth tests
```

If `ADMIN_PASSWORD` isn't set, the server prints a one-time password in the
terminal at startup so you can still log in during development.
