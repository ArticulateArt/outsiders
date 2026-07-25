# OUTSIDERS — The Constellation Gallery

`index.html` is the front door: a short lander explaining what this is (a
living wall of work this community has witnessed, and what a "witness" is),
with a single "Enter the Gallery" action. That takes you to `wall.html` — a
scrolling masonry grid of every witnessed work: search a name, tap a work to
read it, "follow this author/witness" reshapes the grid around them, and a
bookmark (⬡) on any tile builds a private kept-gallery.

For anyone who wants it, the lander also links to **The Immersive
Experience** — `immersive.html`, the original 3D constellation: Card 347 (a
hand holding a phone) hangs around you as a cloud of coloured points, and
searching a name draws that person's constellation in front of you. Touch
devices and machines without WebGL2 never see it — `immersive.html`'s own
boot gate sends them straight to `wall.html` instead.

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
kept-gallery (`localStorage.outsiders_kept`, same schema across every page).
`threads.html` (the old 2D fallback) is retired; the 3D scene's boot gate
sends touch + non-WebGL2 devices to `wall.html` instead
(`site/immersive.html:296-309`, `goFallback()`).

Tested live on the founder's iPhone: **"works BEAUTIFULLY... this is the
solution."** Verdict after seeing it: the masonry gallery does the job better
than the 3D scene even conceptually — it's not just the mobile fallback
anymore, it's the site's new front door. Built a lander (`site/land.html`)
explaining the concept ahead of "Enter"ing the gallery, initially as a
standalone page while the founder reviewed it live.

**Update, same day:** approved, then renamed everything so the lander is the
actual site root: `land.html` → `index.html`; the old 3D `index.html` →
`immersive.html`. Deliberately a plain file rename, not a `vercel.json`
rewrite rule — the founder didn't want routing config interacting with the
6-hourly auto-rebuild. Every internal link/comment across `index.html`,
`immersive.html`, `wall.html`, `constellation.html` (the old redirect stub —
still points at `./`, which now correctly lands on the new lander), and the
docs was updated to match; `vercel.json` needed no changes since its rules
are path-pattern based, not filename-specific.

Still open:

- **Dynamic column count in `wall.html`** — currently a fixed 2/3/4-column
  media-query ladder (`site/wall.html`, `#grid,#ggrid{columns:...}`); should
  scale with actual window width for laptop-size screens instead of jumping
  at fixed breakpoints. Explicitly deferred — "don't touch wall.html, that
  is done" (2026-07-26).
- Whole-site copy/identity pass: working title **"OUTSIDERS Constellation
  Gallery"** / **"The Constellation."** `index.html` (the lander) establishes
  the tone (what a witness is, why being witnessed is the community's
  central act); extending that voice into `wall.html` and `immersive.html`
  themselves (button labels, hints, etc.) hasn't been done.
- `immersive.html` has no link back to the lander/gallery — it's reached
  only forward, from `index.html`'s "Immersive Experience" button. Worth a
  quiet way back in, not added here to stay in scope.
