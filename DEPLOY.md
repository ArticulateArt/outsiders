# Deploying to outsiders.articulate.art

The site is fully static — no server, no build step, no environment variables.
**Publish the `site/` directory and nothing else.** It is already exactly what ships:

```
site/
  index.html              the lander — the front door, "Enter the Gallery"
  wall.html               the gallery — a scrolling grid (also mobile / no-WebGL2 / slow machines)
  immersive.html          the 3D constellation, linked from the lander
  constellation.html      redirect stub, only for links shared before the rename
  vendor/three.r128.min.js
  data/                   portrait · cloud347 · sky · serials · eggs
```

Total ~1.5 MB, all cacheable. Everything else in this repo (`producer/`,
`drawings/`, `serve.js`, the `.md` docs) is build-time or reference material
and must **not** be published.

The one thing that keeps this static site alive is `.github/workflows/refresh-data.yml`
— read "How the data stays fresh" below before you choose how to deploy.

## Look at it locally first

```bash
node serve.js
```

Then open <http://localhost:8347>. It also runs straight from `file://` — open
`site/index.html` — which is how the founder has always previewed it.

## Host: Vercel

`vercel.json` at the repo root already has everything: no build step, output
directory `site`, and cache headers (`vendor/` immutable for a year, `data/` a week,
HTML always revalidated). Nothing outside `site/` gets served.

`cleanUrls` is deliberately left off — it would 308 `/wall.html` to `/wall`,
adding a redirect hop to the mobile fallback, which is the slowest path we have.
The only URLs that matter are `/` and `/wall.html`, so there is nothing to tidy.

### First deploy — do it via GitHub, not the CLI

Push this repo to GitHub, then in Vercel: *Add New → Project → Import*. Vercel reads
`vercel.json`, so framework/build/output are already right — don't override them.

Take this path even though the CLI looks quicker. The daily refresh works by committing
to the repo (see below), and only the git integration turns that commit into a deploy.
A CLI-only project would keep serving a frozen wall while the data updated in git.

The CLI still has its uses — a one-off push of a hand-fixed bake:

```bash
npx vercel --prod
```

If it offers to auto-detect a framework, choose "Other" and leave the build command empty.

### The custom domain

In the Vercel project: *Settings → Domains → Add* `outsiders.articulate.art`.
Vercel then shows you the record to create wherever DNS for `articulate.art` lives:

```
CNAME   outsiders   cname.vercel-dns.com
```

TLS is provisioned automatically once that resolves — usually minutes.

> If `articulate.art` itself is already a Vercel project, add the subdomain to **this**
> project, not that one. Two projects can share a parent domain; they cannot share the
> same exact hostname.

## How the data stays fresh (2026-07-25)

**The site never talks to 6529.** Verified from a network trace of a real page load: the
only requests are `vendor/three.js` and the five files in `data/`. Work images come from
the 6529 CDN and "read on 6529 ↗" links out, but nothing is ever *fetched* from the API.

So `data/portrait.js` is a photograph of the wave. It stays true because something
retakes it: **`.github/workflows/refresh-data.yml` runs every morning at 05:17 UTC**,
crawls the wave, rebuilds `site/data/`, and commits any change. Vercel's git integration
redeploys on that commit. Nobody has to be asked, and nobody has to remember.

That is the whole point of the thing. A community member runs an OUTSIDERS workshop,
uploads the photographs to the wave, the community marks them `:outsiders:`, and by the
next morning they are on the wall.

**This requires the repo to be on GitHub with Vercel's git integration connected.** If you
deploy only from the CLI (`npx vercel --prod`), the schedule has nothing to trigger and the
site freezes at whatever was last pushed by hand.

It needs no credentials — every endpoint it reads is public.

### Whose mark counts

Not everyone's. A work enters the portrait only when someone inside the **chain of trust**
marks it: Articulate granted them OUTSIDERS Grant Rep, or someone *he* granted it to
granted it to them (`CONFIG.trustDepth`, default 2 hops). `producer/roster.js` is the whole
gate, and its header explains why the flat "is on the grant roster" list was not enough.
Today the chain holds 82 people, and it grows whenever a trusted member grants onward —
no code change, no redeploy.

### If a crawl goes wrong

`producer.js` refuses to write when the chain of trust collapses, or when the portrait
would lose more than 20% of its works (`CONFIG.shrinkGuard`). The workflow run goes red and
commits nothing, so a bad API minute can never quietly take the wall down. If a big drop is
genuine, re-run the workflow by hand with the **force** input ticked.

An offline `node producer.js` writes nothing at all — it reports what the rules would do
against the sample drops. Add `--write` if you really mean to overwrite `site/data`.

### Refresh it by hand

```bash
cd producer && node producer.js --live --diff
```

The `--diff` block names every work that arrived or left, and flags anything whose
attribution wants a human eye. Correct attributions in `producer/fixtures/overrides.json` —
those survive every future re-crawl. Then:

```bash
node producer/bake-serials.js && npx vercel --prod
```

`--live` already bakes every permalink it crawled (132/132 today), so `bake-serials.js` is
just a top-up for anything the crawl missed; it only fetches ids it does not already have.
Re-run `node bake-eggs.js` only when `drawings/` changed.

## Before you announce it

- Open the real URL on a **phone** — you should land on the lander, and
  "Enter the Gallery" should take you to `wall.html`, not a broken 3D scene.
- Open it on a laptop, click through to **The Immersive Experience**, and
  check the arrival resolves into Card 347.
- Click any work → "read on 6529 ↗" should open that specific drop, not the homepage.
  (Members not in the OUTSIDERS wave will hit 6529's login gate — that is expected
  and the link text stays honest about where it goes.)
