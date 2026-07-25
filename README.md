# OUTSIDERS — The Constellation

A field of stars you fly through. Each one is a photograph someone made and
someone else stopped to look at. Card 347 hangs around you as a cloud of
coloured points; search a name and that person's constellation draws itself in
front of you.

Static, single page, no server, no build step. It runs from `file://`.

    site/
      index.html      the constellation — the front door
      wall.html       the native grid (phones, no-WebGL2, slow machines)
      data/           portrait · cloud347 · sky · serials · eggs
      vendor/         three.js r128, vendored so a CDN outage costs us nobody

    producer/
      producer.js     crawls the wave, decides what belongs, bakes site/data
      roster.js       whose :outsiders: mark counts — the chain of trust
      fixtures/       grants.json (the chain, cached) · overrides · samples

    drawings/         SVGs → bake-eggs.js → the secret star-formations
    serve.js          local preview; ?shim=1 adds the frame-capture harness

## Look at it

    node serve.js

Then <http://localhost:8347>. Or just open `site/index.html`.

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
