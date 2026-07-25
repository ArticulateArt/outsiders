# OUTSIDERS — The Constellation

A field of stars you fly through. Each star is a photograph someone made and
someone else stopped to look at. Card 347 (a hand holding a phone) hangs
around you as a cloud of coloured points; search a name and that person's
constellation draws itself in front of you. On phones, or machines without
WebGL2, it falls back to `wall.html`, a native scrolling grid of the same
works — touch is a browse-and-read experience, not a shrunk-down 3D scene.

Static site, no server, no build step, no environment variables. Everything
that ships lives in `site/`. See `README.md` for how it's put together, and
`DEPLOY.md` for how to host and redeploy it.

## How a work gets on the wall

Nobody uploads anything here. A work appears because someone marked it
`:outsiders:` in the OUTSIDERS wave on 6529 — and because that person is
inside the **chain of trust**: Articulate granted OUTSIDERS Grant Rep to
people he trusts, they grant it onward, and anyone inside that chain can put
a work on the wall by witnessing it. `producer/roster.js` decides who's in
the chain; `producer/producer.js` decides what's on the wall.

## The auto-refresh

The site never talks to 6529 directly — `site/data/portrait.js` is a
photograph of the wave. What keeps that photograph current is
`.github/workflows/refresh-data.yml`:

- Runs every 6 hours (05:17, 11:17, 17:17, 23:17 UTC), and can be triggered
  by hand from the Actions tab any time.
- Crawls the wave, rebuilds `site/data/`, and commits the change if anything
  moved.
- Vercel's git integration sees that commit and redeploys automatically.
  Nobody has to be asked, and nobody has to remember.

**If a crawl goes wrong, the run fails and commits nothing.** `producer.js`
refuses to write when the chain of trust collapses, or when the portrait
would lose more than 20% of its works (`CONFIG.shrinkGuard`). A red run in
GitHub Actions means "look at this", not "the site is broken" — the last
good version keeps serving until someone looks.

To refresh by hand:

```bash
cd producer && node producer.js --live --diff
```

Add `--write` (or run the workflow's `--force` input) only if a genuine large
drop needs to ship anyway.

## Mobile grid → whole-site identity rework (2026-07-26)

The 3D constellation was broken on touch (no pinch-zoom, desktop HUD crammed
onto a phone screen, the kinship ribbon burst overwhelming a small screen).
Fix wasn't a patch: built `site/wall.html`, a native scrolling masonry grid
over the same `portrait.js` data — shuffled landing, live search, tap a work
for image+caption+witness credit, "follow this author/witness" re-scopes the
grid with a dismissible pill, a bookmark (⬡) on every tile builds a private
kept-gallery (`localStorage.outsiders_kept`, same schema as `index.html`).
`threads.html` (the old 2D fallback) is retired; `index.html`'s boot gate
now sends touch + non-WebGL2 devices to `wall.html` instead
(`site/index.html:296-309`, `goFallback()`).

Tested live on the founder's iPhone: **"works BEAUTIFULLY... this is the
solution."** Verdict after seeing it: the masonry gallery does the job better
than the 3D scene even conceptually — it's not just the mobile fallback
anymore, it's the site's new front door. Follow-up direction, not yet built:

- **`site/land.html`** (this pass) — a clean lander explaining the concept
  before "Enter"ing `wall.html`. Not yet wired as the actual site root — the
  boot gate in `index.html` still opens straight into the 3D scene for
  non-touch/WebGL2 visitors. Making `land.html` the true `/` (with the 3D
  scene demoted to a secondary "immersive experience" link, as land.html
  already offers) is a deliberate follow-up, not done here.
- **Dynamic column count in `wall.html`** — currently a fixed 2/3/4-column
  media-query ladder (`site/wall.html`, `#grid,#ggrid{columns:...}`); should
  scale with actual window width for laptop-size screens instead of jumping
  at fixed breakpoints. Explicitly deferred — "don't touch wall.html, that
  is done" (2026-07-26).
- Whole-site copy/identity pass: working title **"OUTSIDERS Constellation
  Gallery"** / **"The Constellation"**. `land.html` establishes the tone
  (what a witness is, why being witnessed is the community's central act);
  extending that voice into `wall.html` and `index.html` themselves (button
  labels, hints, etc.) hasn't been done.
