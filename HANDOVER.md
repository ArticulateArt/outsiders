# OUTSIDERS — The Constellation

A field of stars you fly through. Each star is a photograph someone made and
someone else stopped to look at. Card 347 (a hand holding a phone) hangs
around you as a cloud of coloured points; search a name and that person's
constellation draws itself in front of you. On phones, or machines without
WebGL2, it falls back to `threads.html`, a 2D version of the same wall.

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
