#!/usr/bin/env node
/* bake-serials.js — build the complete {dropId: serial_no} map for per-work 6529 permalinks.
 *
 * A drop's public URL is  https://6529.io/my-stream?wave=<WAVE>&serialNo=<serial_no>,
 * and serial_no is not in portrait.json — it has to come from the API.
 *
 * The wave's FEED is wallet-gated (anonymous `serial_no_less_than` pagination comes back
 * empty), which is why an earlier pass could only reach the newest ~9 drops. But a SINGLE
 * drop reads fine anonymously — `GET /api/drops/{id}` returns serial_no for any id we
 * already know. portrait.json holds all 129 ids, so we just ask for them one at a time.
 * Slower than one authenticated crawl, but it needs no credentials and no session.
 *
 * Usage:  node producer/bake-serials.js  [--force]
 *   Re-uses whatever is already in site/data/serials.js; --force re-fetches everything.
 * `producer.js --live` still regenerates this file wholesale as a by-product of its crawl —
 * this script exists so the map can be completed without authenticating.
 */
const fs = require("fs");
const path = require("path");

const SITE = path.join(__dirname, "..", "site", "data");
const PORTRAIT = path.join(SITE, "portrait.json");
const OUT = path.join(SITE, "serials.js");
const API = "https://api.6529.io/api/drops/";
const GAP_MS = 120;              // be a polite neighbour; 129 ids is ~16s
const RETRIES = 3;

const force = process.argv.includes("--force");
const works = JSON.parse(fs.readFileSync(PORTRAIT, "utf8")).works;
const ids = [...new Set(works.map(w => w.drop).filter(Boolean))];

// keep serials we already have so a re-run is cheap and never loses ground
let have = {};
if (!force && fs.existsSync(OUT)) {
  const m = /window\.DROP_SERIALS\s*=\s*(\{[\s\S]*?\});/.exec(fs.readFileSync(OUT, "utf8"));
  if (m) { try { have = JSON.parse(m[1]); } catch {} }
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function serialFor(id) {
  for (let attempt = 1; attempt <= RETRIES; attempt++) {
    try {
      const res = await fetch(API + id, { headers: { accept: "application/json" } });
      if (res.status === 404) return { missing: true };
      if (!res.ok) throw new Error("HTTP " + res.status);
      const d = await res.json();
      if (typeof d.serial_no === "number") return { serial: d.serial_no };
      return { missing: true };
    } catch (err) {
      if (attempt === RETRIES) return { error: String(err.message || err) };
      await sleep(400 * attempt);
    }
  }
}

(async () => {
  const todo = ids.filter(id => !(id in have));
  console.error(`[serials] ${ids.length} works · ${ids.length - todo.length} already known · fetching ${todo.length}`);

  let ok = 0, missing = 0, failed = [];
  for (let i = 0; i < todo.length; i++) {
    const r = await serialFor(todo[i]);
    if (r.serial !== undefined) { have[todo[i]] = r.serial; ok++; }
    else if (r.missing) missing++;
    else failed.push(todo[i]);
    if ((i + 1) % 20 === 0 || i === todo.length - 1)
      process.stderr.write(`\r  ${i + 1}/${todo.length} fetched`);
    await sleep(GAP_MS);
  }
  process.stderr.write("\n");

  // stable order: newest drop first, so a diff of this file reads chronologically
  const sorted = Object.fromEntries(Object.entries(have).sort((a, b) => b[1] - a[1]));
  const covered = ids.filter(id => id in sorted).length;

  fs.writeFileSync(OUT,
    `/* serials.js — {dropId: serial_no} for building per-work 6529 permalinks.\n` +
    `   A drop's public URL is:  https://6529.io/my-stream?wave=<WAVE>&serialNo=<serial_no>\n` +
    `   (WAVE = 815542b5-e8a5-4380-b825-5823a91c4c71 = "Outsiders Rep Grant Submissions").\n` +
    `   Any drop NOT in this map falls back gracefully to the 6529 homepage in the viewers.\n\n` +
    `   Baked ${new Date().toISOString().slice(0, 10)} by producer/bake-serials.js — ${covered}/${ids.length} works covered.\n` +
    `   The wave's feed is wallet-gated, but single drops read fine anonymously, so this is\n` +
    `   built by asking for each drop id in portrait.json directly. Re-run after any re-bake\n` +
    `   of portrait.json; it only fetches ids it does not already have. */\n` +
    `window.DROP_SERIALS = ${JSON.stringify(sorted, null, 2)};\n`);

  console.error(`[serials] ${covered}/${ids.length} works have a permalink → ${path.relative(process.cwd(), OUT)}`);
  if (missing) console.error(`[serials] ${missing} drop(s) returned no serial_no (deleted or moved?)`);
  if (failed.length) console.error(`[serials] ${failed.length} failed after ${RETRIES} tries — re-run to retry:\n  ` + failed.join("\n  "));
})();
