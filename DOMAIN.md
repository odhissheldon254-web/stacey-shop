# Connecting tacey.odhis.co.ke

The shop lives at **https://tacey.odhis.co.ke**, a sub-address of `odhis.co.ke`
(registered at Truehost, 2026-10-15). Every canonical tag, Open Graph URL,
sitemap entry and structured-data record already points there.

Because it is a sub-address, not the bare domain, a single ordinary CNAME
record at Truehost is enough. No Cloudflare, no nameserver changes. The bare
`odhis.co.ke` stays free for other projects (e.g. `venuecheck.odhis.co.ke`).

Cost: only the domain renewal. Hosting (Render) and the TLS certificate are free.

---

## Step 1 — Tell Render about the domain

1. Open the `stacey-shop` service in the [Render dashboard](https://dashboard.render.com).
2. **Settings → Custom Domains → Add Custom Domain** → `tacey.odhis.co.ke`.
3. Render shows the target, your service hostname, e.g. `stacey-shop.onrender.com`.

## Step 2 — Add the DNS record at Truehost

Truehost client area → **Domains → odhis.co.ke → Manage DNS** (DNS Management),
then add:

| Type | Host / Name | Value / Target | TTL |
|---|---|---|---|
| CNAME | `tacey` | `stacey-shop.onrender.com` | 3600 (or default) |

Use `tacey`, not `tacey.odhis.co.ke`. Truehost appends the domain itself; typing
the full name usually ends up as `tacey.odhis.co.ke.odhis.co.ke`.

If the DNS page says the domain uses other nameservers, first set the
nameservers back to Truehost's defaults (`ns1.truehost.cloud` /
`ns2.truehost.cloud` or whatever the panel lists as default).

## Step 3 — Verify

Back in Render's Custom Domains panel, hit **Verify**. It should read
**Verified** with a certificate issued, usually within minutes of DNS
resolving (allow up to a few hours for a freshly bought `.co.ke`).

```bash
curl -I https://tacey.odhis.co.ke
curl https://tacey.odhis.co.ke/api/health
curl https://tacey.odhis.co.ke/sitemap.xml
```

## Step 4 — Tell Google the site exists

1. [Google Search Console](https://search.google.com/search-console) → add a
   **URL prefix** property for `https://tacey.odhis.co.ke/` and verify with the
   HTML-tag or DNS method.
2. **Sitemaps →** submit `sitemap.xml`.

Indexing takes days to weeks.

## Afterwards: update these links

- Stacey's admin panel: `https://tacey.odhis.co.ke/admin.html`
- Instagram bio link, WhatsApp Business profile → **Website**
- Google Business Profile, if you create one

## Keeping the free tier awake

Render's free service sleeps after ~15 minutes without visitors. Create a free
monitor at [uptimerobot.com](https://uptimerobot.com) that pings
`https://tacey.odhis.co.ke/api/health` every 5 minutes.

## If something goes wrong

| Symptom | Cause | Fix |
|---|---|---|
| `DNS_PROBE_FINISHED_NXDOMAIN` | Domain not activated yet, or record missing | Check Truehost shows the domain as Active, recheck the CNAME |
| Render says "Domain not verified" | DNS has not propagated | Wait, then hit **Verify** again |
| Record resolves to `tacey.odhis.co.ke.odhis.co.ke` | Full name typed in the Host field | Host must be just `tacey` |
| First load takes 40 seconds | Free tier went to sleep | Set up the UptimeRobot ping above |
