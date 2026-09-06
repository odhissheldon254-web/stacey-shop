# Connecting taceycollections.co.ke

The site is already built for this domain — every canonical tag, Open Graph
URL, sitemap entry and structured-data record points at
`https://taceycollections.co.ke`. What is left is buying the name and pointing
it at Render.

Budget: **the domain is the only cost.** A `.co.ke` runs roughly
**KES 1,000–1,500 per year**. Hosting (Render), DNS (Cloudflare) and TLS
certificates are all free.

---

## Step 1 — Register the domain (~KES 1,200/yr)

`.co.ke` names are sold through KENIC-accredited Kenyan registrars. Any of
these work:

| Registrar | Notes |
|---|---|
| [Truehost Kenya](https://truehost.co.ke) | Usually the cheapest, pays by M-Pesa |
| [Kenya Web Experts](https://kenyawebexperts.co.ke) | Long-established, good support |
| [HostPinnacle Kenya](https://hostpinnacle.co.ke) | M-Pesa checkout |
| [Safaricom Domains](https://domains.safaricom.co.ke) | Most convenient if you already use Safaricom billing |

Search for `taceycollections.co.ke` and buy **the domain only** — decline the
hosting, email and "website builder" upsells. You do not need them.

> Register for **two years** if the price difference is small. It saves a
> renewal scare, and a domain lapsing takes the whole shop offline.

## Step 2 — Put the domain on Cloudflare (free)

Render cannot serve a bare domain (`taceycollections.co.ke` with no `www`)
from a plain CNAME, and most Kenyan registrars do not support the `ALIAS`
record that would fix it. Cloudflare's free plan solves this with CNAME
flattening, so this step is not optional bureaucracy — it is what makes the
bare domain work.

1. Create a free account at [cloudflare.com](https://cloudflare.com).
2. **Add a site** → enter `taceycollections.co.ke` → choose the **Free** plan.
3. Cloudflare shows you two nameservers, something like
   `ana.ns.cloudflare.com` and `rick.ns.cloudflare.com`.
4. Go back to your registrar's control panel, find **Nameservers** (sometimes
   "DNS Management" or "Child Nameservers"), and replace whatever is there
   with Cloudflare's two.
5. Wait for Cloudflare to confirm the domain is active. This is usually
   under an hour, but the official window is up to 24 hours.

## Step 3 — Tell Render about the domain

1. Open your service in the [Render dashboard](https://dashboard.render.com).
2. **Settings → Custom Domains → Add Custom Domain.**
3. Add **both**, one at a time:
   - `taceycollections.co.ke`
   - `www.taceycollections.co.ke`
4. Render shows the target to point at — your service hostname, e.g.
   `stacey-shop.onrender.com`. Copy it; you need it in the next step.

## Step 4 — Add the DNS records in Cloudflare

In Cloudflare, open **DNS → Records** and add these two:

| Type | Name | Target | Proxy status |
|---|---|---|---|
| CNAME | `@` | `stacey-shop.onrender.com` | **DNS only** (grey cloud) |
| CNAME | `www` | `stacey-shop.onrender.com` | **DNS only** (grey cloud) |

Two details that cause most of the pain if you get them wrong:

- **Use `@` for the bare domain.** Cloudflare flattens it automatically, which
  is the whole reason we are using Cloudflare.
- **Keep the proxy OFF (grey cloud).** With the orange cloud on, Render's
  certificate check can fail and you can end up in a redirect loop. Render
  issues its own free certificate, so you are not losing HTTPS. You can turn
  the proxy on later, once the certificate has been issued, if you want
  Cloudflare's caching — set SSL/TLS mode to **Full (strict)** first.

## Step 5 — Set the canonical host on Render

In **Render → Environment**, confirm:

```
CANONICAL_HOST = taceycollections.co.ke
```

This makes `www.taceycollections.co.ke` issue a single permanent redirect to
the bare domain, so Google never indexes the site twice and splits its own
ranking between two addresses.

Then **Manual Deploy → Deploy latest commit**.

## Step 6 — Verify

Back in Render's Custom Domains panel both entries should read **Verified**,
with a certificate issued. Then check from a terminal:

```bash
# Bare domain serves the site
curl -I https://taceycollections.co.ke

# www folds onto the bare domain with one 301
curl -I https://www.taceycollections.co.ke

# The SEO files are live
curl https://taceycollections.co.ke/robots.txt
curl https://taceycollections.co.ke/sitemap.xml
```

Certificate issuance can take a few minutes after DNS resolves. A browser
warning during that window is normal; if it is still there after an hour,
the proxy is probably switched on in Cloudflare.

## Step 7 — Tell Google the site exists

1. Go to [Google Search Console](https://search.google.com/search-console).
2. Add a property for `taceycollections.co.ke` (the **Domain** type — verify
   with the TXT record it gives you, added in Cloudflare DNS).
3. **Sitemaps →** submit `sitemap.xml`.
4. Do the same at [Bing Webmaster Tools](https://www.bing.com/webmasters) if
   you want the extra traffic. It takes two minutes and imports from Google.

Indexing takes days to weeks. Nothing is broken if the shop is not on Google
the next morning.

---

## Afterwards: update these links

Once the domain is live, the domain becomes the address you hand out:

- Stacey's admin panel moves to `https://taceycollections.co.ke/admin.html`
- The Instagram bio link
- WhatsApp Business profile → **Website**
- Google Business Profile, if you create one (recommended — it is free and it
  is how local customers find a Nairobi boutique)

## Keeping the free tier awake

Render's free service sleeps after ~15 minutes without traffic, and the next
visitor waits 30–60 seconds for it to wake. For a shop, that is the difference
between a sale and a bounce.

Create a free monitor at [uptimerobot.com](https://uptimerobot.com) that pings
`https://taceycollections.co.ke/api/health` every 5 minutes. Free, and it keeps
the site warm around the clock.

## If something goes wrong

| Symptom | Cause | Fix |
|---|---|---|
| `DNS_PROBE_FINISHED_NXDOMAIN` | Nameservers not switched yet | Recheck step 2.4, then wait |
| Certificate warning after an hour | Cloudflare proxy is on | Set both records to **DNS only** |
| Redirect loop | Cloudflare proxy on with SSL mode "Flexible" | **DNS only**, or SSL mode **Full (strict)** |
| `www` works, bare domain does not | Apex record missing or not `@` | Recheck the `@` CNAME in step 4 |
| Render says "Domain not verified" | DNS has not propagated | Wait, then hit **Verify** again |
| First load takes 40 seconds | Free tier went to sleep | Set up the UptimeRobot ping above |
