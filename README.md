# OUTSIDERS — The Constellation Gallery

A living wall of the work this community has witnessed. Land on `index.html`
for a short explanation of what the place is, then **Enter the Gallery**
(`wall.html`) — a scrolling grid of every witnessed work, searchable by name,
with "follow this author / this witness" reshaping the grid around whoever
you follow. For those who want it, **The Immersive Experience**
(`immersive.html`) is the original 3D constellation: Card 347 hangs around
you as a cloud of coloured points, and searching a name draws that person's
constellation in front of you.

Static, no server, no build step. It runs from `file://`.

    site/
      index.html           the lander — what this is, then "Enter the Gallery"
      wall.html            the gallery — a scrolling grid, search, your own kept works
      immersive.html       the 3D constellation, linked from the lander
      constellation.html   redirect stub (old URL, keeps working)
      data/                portrait · cloud347 · sky · serials · eggs
      vendor/               three.js r128, vendored so a CDN outage costs nobody

    producer/
      producer.js     crawls the wave, decides what belongs, bakes site/data
      roster.js       whose :outsiders: mark counts — the chain of trust
      fixtures/       grants.json (the chain, cached) · overrides · samples

    drawings/         SVGs → bake-eggs.js → the secret star-formations
    serve.js          local preview; ?shim=1 adds the frame-capture harness

## Look at it

    node serve.js

Then <http://localhost:8347>. Or just open `site/index.html` — it runs
straight from `file://` too.

## How a work gets on the wall

Nobody uploads anything here. A work appears because a person marked it
`:outsiders:` in the OUTSIDERS wave on 6529 — and because that person was
entitled to. Entitlement is a chain rooted in one man: Articulate granted
OUTSIDERS Grant Rep to people he trusts, they grant it onward, and anyone
inside that chain can put a work on the wall. See `producer/roster.js`.

The site itself never calls 6529. `site/data/portrait.js` is a photograph of
the wave, and a GitHub Action retakes it every morning
(`.github/workflows/refresh-data.yml`), commits the change, and Vercel
redeploys. To do it by hand:

    cd producer && node producer.js --live --diff

Without `--live` it runs the rules against the sample drops and writes nothing.

## Deploying

See `DEPLOY.md`. Publish `site/` and nothing else.

## The rules that don't bend

No counts, no leaderboards, no numbers. Light means someone paid attention.
The founder is rendered exactly like everyone else. Serif only. Nothing
demands to be clicked. ESC always escapes. No audio without being asked.
The wall stays whole. Built for ten thousand works, not a hundred.

See `HANDOVER.md` for what the site is and how the auto-refresh works.
