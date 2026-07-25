#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════
   OUTSIDERS Living Portrait — THE PRODUCER  (witness-model rework)

   "Pull, not push." The only moving part. Reads the OUTSIDERS wave from
   6529, decides which works belong in the Portrait via the :outsiders:
   witness signal, attributes makers, lays out the field, and bakes ONE
   static data contract the site renders. The founder is never in the data
   path. Runs while you are away.

   WHAT COUNTS (the witness signal — lenient, three rules)
     A work is IN the Portrait when a QUALIFIED witness marks it :outsiders:
       R1. :outsiders: reaction on the photo drop            → witness = reactor
       R2. :outsiders: reaction on a REPLY to the photo drop → credit parent
       R3. a typed ":outsiders:" reply to the photo drop     → witness = replier
     Qualified = inside the CHAIN OF TRUST rooted in Articulate: he granted
     you OUTSIDERS Grant Rep, or someone he granted it to granted it to you
     (CONFIG.trustDepth hops).  See roster.js — that file is the whole gate.
     A numeric Level gate is available but OFF by default (levelFloor = null).
     Unqualified marks are ignored.

   MAKER ATTRIBUTION (structural, not NLP)
     maker = the drop's author, UNLESS a curator (a giver, e.g. Articulate)
     authored it while crediting others — via @mention, an x.com link, or a
     "by/from/for <handle>" phrase — then maker = the credited person(s).
     Multi-maker works are kept.  Anything inferred (curator-credited, text-
     only credit, >1 maker) is flagged review:true for a founder eyeball.

   EXCLUSIONS
     - No resolvable image (e.g. X/Farcaster-link-only submissions) → excluded.
     - No qualified :outsiders: witness → excluded (not removed; just uncounted).

   OUTPUT (schema is FROZEN — both threads.html & constellation.html read it)
     work = { drop, makers[], witnesses[], img, full, nx, ny, review }
     ../site/data/portrait.json   and   ../site/data/portrait.js  (window.PORTRAIT=…)

   RUN
     node producer.js            # offline, from fixtures/drops.sample.json (+ grants.json)
     node producer.js --live     # crawl the wave AND the grant chain from 6529
     node producer.js --live --diff   # also print added/dropped vs the current baked file
     …--force                    # ship even if the portrait shrinks alarmingly (see SAFETY)

   SAFETY (this runs unattended — see .github/workflows/refresh-data.yml)
     A bad crawl must never quietly empty the wall. The build refuses to write
     if the chain of trust collapses, or if the portrait loses more than
     CONFIG.shrinkGuard of its works, unless --force is passed.

   No build tools, no dependencies. Node 18+ (global fetch).
   ─────────────────────────────────────────────────────────────────────── */

"use strict";
const fs = require("fs");
const path = require("path");

// ── CONFIG ──────────────────────────────────────────────────────────────
const CONFIG = {
  apiBase: "https://api.6529.io/api",
  waveId: "815542b5-e8a5-4380-b825-5823a91c4c71",
  category: "OUTSIDERS Grant Recipient",
  founderId: "d084ab7b-a9c8-4dff-97d5-42bacd035574",
  founderHandle: "Articulate",
  // The witness signal. Custom 6529 emoji; matched loosely (strip colons, lc).
  witnessEmoji: "outsiders",
  // The community proxy account. Tagging @MemesOutside on a work means its
  // creator is an OUTSIDER (not on 6529): maker → none, credited to witness.
  // This is the going-forward rule; the sharer is NOT treated as the maker.
  outsiderProxyId: "1aa020d3-5948-4607-b883-679e60bf7bec",
  outsiderProxyHandle: "memesoutside",
  // Qualification: inside the chain of trust rooted in the founder (roster.js).
  // trustDepth 1 = only people Articulate granted to; 2 = and the people THEY
  // granted to (the founder's "second-order community"); null = as far as it
  // goes. Optional numeric Level floor is OR-ed on top; null = chain only.
  trustDepth: 2,
  levelFloor: null,
  // Refuse to ship a bake that loses more than this share of the works — an
  // API hiccup must not silently take the wall down. Override with --force.
  shrinkGuard: 0.2,
  // Crawl paging: newest→oldest via serial_no_less_than (CONFIRMED working).
  pageLimit: 50,
  ipfsGateway: "https://ipfs.io/ipfs/",
  frontEnd: "https://6529.io",
};

const roster_ = require("./roster");

const HERE = __dirname;
const FIX_DIR = path.join(HERE, "fixtures");
const FIX_GRANTS = path.join(FIX_DIR, "grants.json");
const FIX_DROPS = path.join(FIX_DIR, "drops.sample.json");
const FIX_OVERRIDES = path.join(FIX_DIR, "overrides.json");
const SITE_DATA = path.join(HERE, "..", "site", "data");
const OUT_JSON = path.join(SITE_DATA, "portrait.json");
const OUT_JS = path.join(SITE_DATA, "portrait.js");
const OUT_SERIALS = path.join(SITE_DATA, "serials.js"); // {dropId:serial_no} for per-work 6529 permalinks

// ── SMALL HELPERS ─────────────────────────────────────────────────────────
function hash(str) {
  let h = 0x811c9dc5;
  str = String(str);
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}
// deterministic float in [0,1) from a seed string
function rnd(seed) { return (hash(seed) % 100000) / 100000; }

function resolveMedia(url) {
  if (!url) return null;
  if (url.startsWith("ipfs://")) return CONFIG.ipfsGateway + url.slice(7).replace(/^ipfs\//, "");
  return url;
}
const norm = (r) => String(r || "").replace(/:/g, "").trim().toLowerCase();
const isOutsiders = (reaction) => norm(reaction) === CONFIG.witnessEmoji;

// A drop's text = all its parts joined.
function dropText(d) { return (d.parts || []).map((p) => p.content || "").join("\n").trim(); }
// A drop's first usable IMAGE url (skip non-image media), ipfs-resolved.
function dropImg(d) {
  for (const p of d.parts || []) {
    for (const m of p.media || []) {
      const mime = m.mime_type || "";
      if (!mime || mime.startsWith("image/")) return resolveMedia(m.url);
    }
  }
  return null;
}

// ── DATA SOURCES (live crawl OR offline fixtures; identical drop shape) ─────
async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return res.json();
}

// The chain of trust (roster.js). Live: crawl the grant log and re-cache it.
// Offline: read the cache as-is, so fixture runs see the same chain.
async function loadRoster(live) {
  let cache;
  if (live) {
    cache = await roster_.buildLive(
      {
        category: CONFIG.category,
        rootId: CONFIG.founderId,
        rootHandle: CONFIG.founderHandle,
        trustDepth: CONFIG.trustDepth,
      },
      (m) => console.error(m)
    );
    fs.writeFileSync(FIX_GRANTS, JSON.stringify(cache, null, 1));
  } else {
    cache = JSON.parse(fs.readFileSync(FIX_GRANTS, "utf8"));
  }
  const trusted = roster_.walkChain(
    cache.grants, CONFIG.founderId, CONFIG.founderHandle, CONFIG.trustDepth
  );
  const ids = new Set(trusted.keys());
  const handles = new Map([...trusted].map(([id, v]) => [id, v.handle]));
  // Anyone who has actually handed out the grant is a curator too: they are the
  // accounts that post other people's work on their behalf (§MAKER ATTRIBUTION).
  const granters = new Set();
  for (const g of cache.grants) if (g.rating > 0 && ids.has(g.actorId)) { granters.add(g.actorId); granters.add(g.ofRecordId); }
  return { ids, handles, granters, depths: trusted };
}

// All wave drops, newest→oldest. Live: page down by serial_no_less_than.
async function loadDrops(live) {
  if (!live) return JSON.parse(fs.readFileSync(FIX_DROPS, "utf8")).drops || [];
  const out = [];
  let cursor = null;
  while (true) {
    let url = `${CONFIG.apiBase}/waves/${CONFIG.waveId}/drops?limit=${CONFIG.pageLimit}`;
    if (cursor != null) url += `&serial_no_less_than=${cursor}`;
    const j = await fetchJson(url);
    const drops = j.drops || [];
    if (!drops.length) break;
    out.push(...drops);
    const last = drops[drops.length - 1];
    if (last.serial_no == null || last.serial_no === cursor) break; // safety
    cursor = last.serial_no;
    if (drops.length < CONFIG.pageLimit) break; // last page
    process.stderr.write(`\r[producer] crawled ${out.length} drops…`);
  }
  if (live) process.stderr.write(`\r[producer] crawled ${out.length} drops.   \n`);
  return out;
}

// ── WITNESS DETECTION ──────────────────────────────────────────────────────
// Qualified reactors of :outsiders: on a drop → array of {id,handle,level}.
function qualifiedOutsidersReactors(drop, roster) {
  const out = [];
  for (const r of drop.reactions || []) {
    if (!isOutsiders(r.reaction)) continue;
    for (const p of r.profiles || []) if (isQualified(p, roster)) out.push(p);
  }
  return out;
}
function isQualified(profile, roster) {
  if (!profile || !profile.id) return false;
  if (roster.ids.has(profile.id)) return true;
  if (CONFIG.levelFloor != null && (profile.level || 0) >= CONFIG.levelFloor) return true;
  return false;
}

// ── MAKER ATTRIBUTION ──────────────────────────────────────────────────────
const CURATOR_IDS = new Set([CONFIG.founderId]); // givers added at runtime
function isCurator(id) { return CURATOR_IDS.has(id); }

// Credited handles when a curator authored on someone's behalf.
// Returns { makers:[handle...], review:bool } — makers may be [author] if none found.
function mentionsOutsiderProxy(drop) {
  return (drop.mentioned_users || []).some((m) =>
    m.mentioned_profile_id === CONFIG.outsiderProxyId ||
    (m.current_handle || m.handle_in_content || "").toLowerCase() === CONFIG.outsiderProxyHandle
  );
}

function attributeMakers(drop, roster) {
  const author = drop.author || {};
  const authorHandle = author.handle;
  // GOING-FORWARD RULE: @MemesOutside tag ⇒ creator is an outsider (not on
  // 6529). No maker; the work is credited to its witness. Beats all other
  // attribution, whoever posted it.
  if (mentionsOutsiderProxy(drop)) return { makers: [], review: false };
  if (!isCurator(author.id)) return { makers: [authorHandle].filter(Boolean), review: false };

  // curator-authored: look for credited others
  const credited = [];
  const seen = new Set();
  const push = (h) => { const k = (h || "").toLowerCase(); if (h && !seen.has(k) && (h || "").toLowerCase() !== CONFIG.founderHandle.toLowerCase()) { seen.add(k); credited.push(h); } };

  // @mentions (structural, most reliable)
  for (const m of drop.mentioned_users || []) push(m.current_handle || m.handle_in_content);

  const text = dropText(drop);
  // x.com / twitter link → the path segment is usually the maker's handle.
  // (Structural signals ONLY — a fuzzy "by/from/for <word>" text rule was
  // tried and removed: it grabbed stopwords like "the"/"fun"/"this".)
  let textOnly = false;
  const xLinks = text.match(/https?:\/\/(?:www\.)?(?:x|twitter)\.com\/([A-Za-z0-9_]+)/gi) || [];
  const X_STOP = new Set(["i", "home", "intent", "share", "search", "hashtag", "explore"]);
  for (const link of xLinks) {
    const h = link.replace(/.*\.com\//i, "").replace(/[/?#].*$/, "");
    if (h && !X_STOP.has(h.toLowerCase())) { push(h); textOnly = true; }
  }

  if (credited.length) return { makers: credited, review: textOnly || credited.length > 1 };
  // curator authored with no structural credit → attribute to the curator,
  // but flag for a human: it may be someone else's work we can't resolve.
  return { makers: [authorHandle].filter(Boolean), review: true };
}

// ── FIELD LAYOUT (nx,ny in 0..1, clustered by primary maker) ────────────────
// Each maker gets a deterministic cluster centre; works scatter in a small
// disc around their primary maker's centre. Same feel as the prior bake.
const MARGIN = 0.08;
function makerCentre(maker) {
  const a = rnd("cx::" + maker), b = rnd("cy::" + maker);
  return { x: MARGIN + a * (1 - 2 * MARGIN), y: MARGIN + b * (1 - 2 * MARGIN) };
}
function placeWork(work, idxInMaker) {
  const c = makerCentre(work.makers[0] || work.drop);
  const ang = rnd(work.drop + "::a") * Math.PI * 2;
  const rad = 0.02 + rnd(work.drop + "::r::" + idxInMaker) * 0.06; // 0.02..0.08
  const clamp = (v) => Math.max(MARGIN, Math.min(1 - MARGIN, v));
  work.nx = +clamp(c.x + Math.cos(ang) * rad).toFixed(4);
  work.ny = +clamp(c.y + Math.sin(ang) * rad * 1.3).toFixed(4);
}

// ── BUILD ───────────────────────────────────────────────────────────────
async function build() {
  const live = process.argv.includes("--live");
  const wantDiff = process.argv.includes("--diff");
  const force = process.argv.includes("--force");
  console.error(`[producer] mode: ${live ? "LIVE (6529 API)" : "offline (fixtures)"}`);

  // snapshot the currently-baked works BEFORE we overwrite (--diff + shrink guard)
  let baseline = [];
  if (fs.existsSync(OUT_JSON)) {
    try { baseline = JSON.parse(fs.readFileSync(OUT_JSON, "utf8")).works || []; } catch { /* ignore */ }
  }

  const roster = await loadRoster(live);
  for (const id of roster.granters) CURATOR_IDS.add(id);
  // The chain must at minimum contain the founder plus the people he granted
  // to. If it does not, the grant crawl failed and every witness would be
  // rejected — that would empty the wall, so stop before anything is written.
  if (!roster.ids.has(CONFIG.founderId) || roster.ids.size < 2) {
    throw new Error(`chain of trust collapsed (${roster.ids.size} trusted) — refusing to bake`);
  }

  const drops = await loadDrops(live);
  console.error(`[producer] may witness=${roster.ids.size} · drops=${drops.length}`);

  // Accumulate works keyed by the PHOTO drop id. Value carries the raw photo
  // drop (for maker/img/text) + a Set of witness handles.
  const works = new Map(); // dropId -> { drop, witnesses:Set }
  const register = (photoDrop, witnessProfile) => {
    if (!photoDrop || !photoDrop.id) return;
    if (!witnessProfile || !isQualified(witnessProfile, roster)) return;
    let w = works.get(photoDrop.id);
    if (!w) { w = { drop: photoDrop, witnesses: new Set() }; works.set(photoDrop.id, w); }
    w.witnesses.add(witnessProfile.handle);
  };

  for (const d of drops) {
    const parent = d.reply_to && d.reply_to.drop ? d.reply_to.drop : null;

    // R1: :outsiders: reaction on THIS drop → this drop is the work.
    for (const p of qualifiedOutsidersReactors(d, roster)) register(d, p);

    if (parent) {
      // R2: :outsiders: reaction on a reply → credit the parent (photo) drop.
      for (const p of qualifiedOutsidersReactors(d, roster)) register(parent, p);
      // R3: a typed ":outsiders:" reply → replier witnesses the parent.
      if ((dropText(d).match(/:?outsiders:?/i)) && isQualified(d.author, roster)) register(parent, d.author);
    }
  }

  // Materialise works → frozen schema, filtering out image-less submissions.
  const byMaker = new Map(); // primaryMaker -> count (for scatter index)
  const out = [];
  let droppedNoImg = 0;
  for (const { drop, witnesses } of works.values()) {
    const img = dropImg(drop);
    if (!img) { droppedNoImg++; continue; } // X-link-only & other image-less
    const { makers, review } = attributeMakers(drop, roster);
    // makers may be [] on purpose — an "outsider" (creator not on 6529).
    const w = {
      drop: drop.id,
      makers,
      witnesses: [...witnesses].sort(),
      img,
      full: dropText(drop),
      nx: 0, ny: 0,
      review: !!review,
    };
    out.push(w);
  }
  // founder hand-curation: apply overrides after attribution, before layout
  // (so nx/ny reflect the corrected maker). makers:[] => an outsider.
  const overrides = fs.existsSync(FIX_OVERRIDES)
    ? (JSON.parse(fs.readFileSync(FIX_OVERRIDES, "utf8")).overrides || {}) : {};
  let overridden = 0;
  for (const w of out) {
    const ov = overrides[w.drop];
    if (!ov) continue;
    if (Array.isArray(ov.makers)) w.makers = ov.makers.slice();
    if (Array.isArray(ov.witnesses)) w.witnesses = ov.witnesses.slice();
    if (typeof ov.review === "boolean") w.review = ov.review;
    overridden++;
  }

  // stable order (older serials first-ish → deterministic), then place
  out.sort((a, b) => a.drop.localeCompare(b.drop));
  for (const w of out) {
    const key = w.makers[0] || w.drop;
    const idx = byMaker.get(key) || 0; byMaker.set(key, idx + 1);
    placeWork(w, idx);
  }

  const makerSet = new Set(); out.forEach((w) => w.makers.forEach((m) => makerSet.add(m)));
  const witSet = new Set(); out.forEach((w) => w.witnesses.forEach((x) => witSet.add(x)));

  const data = {
    generated: new Date().toISOString().slice(0, 10),
    source_wave: CONFIG.waveId,
    note:
      "Witnessed via :outsiders: by someone inside the chain of trust rooted in Articulate " +
      `(up to ${CONFIG.trustDepth} grants of OUTSIDERS Grant Rep from him). ` +
      "Lenient detection: reaction on drop / on reply / typed reply. " +
      "review=true → attribution to verify. Image-less (X-link-only) submissions excluded.",
    works: out,
  };

  // An offline run is a test of the rules against 9 fixture drops. It used to
  // write its 6 works straight over the real portrait, so a stray `node
  // producer.js` took the wall down to a stub. It now reports and stops.
  if (!live && !process.argv.includes("--write")) {
    console.error(`[producer] offline test: ${out.length} works · ${makerSet.size} makers · ${witSet.size} witnesses · ${out.filter((w) => w.review).length} review · excluded ${droppedNoImg} image-less`);
    console.error("[producer] nothing written (offline). Use --live to bake for real, or --write to overwrite site/data from fixtures.");
    return;
  }

  // The wall must not come down because an endpoint had a bad minute. A bake
  // that loses a fifth of the works is far more likely to be a broken crawl
  // than a real change, so it needs a human saying --force.
  if (live && baseline.length) {
    const lost = baseline.filter((w) => !out.some((n) => n.drop === w.drop)).length;
    if (lost / baseline.length > CONFIG.shrinkGuard && !force) {
      throw new Error(
        `${lost} of ${baseline.length} works would disappear (>${Math.round(CONFIG.shrinkGuard * 100)}%). ` +
        `Nothing written. Check the crawl, then re-run with --force if this is real.`
      );
    }
  }

  fs.mkdirSync(SITE_DATA, { recursive: true });
  fs.writeFileSync(OUT_JSON, JSON.stringify(data, null, 1));
  fs.writeFileSync(OUT_JS, "window.PORTRAIT=" + JSON.stringify(data) + ";\n");

  // serials.js — dropId -> serial_no, so each work links to its exact 6529 post.
  // serial_no rides on every crawled drop (and reply parent); harvest, then keep to the emitted works.
  const serialOf = new Map();
  for (const d of drops) {
    if (d && d.id && d.serial_no != null) serialOf.set(d.id, d.serial_no);
    const par = d && d.reply_to && d.reply_to.drop;
    if (par && par.id && par.serial_no != null) serialOf.set(par.id, par.serial_no);
  }
  const serials = {};
  let noSerial = 0;
  for (const w of out) { const s = serialOf.get(w.drop); if (s != null) serials[w.drop] = s; else noSerial++; }
  fs.writeFileSync(
    OUT_SERIALS,
    "/* dropId -> serial_no · 6529 permalink = my-stream?wave=<source_wave>&serialNo=<serial_no> · regenerated by producer.js */\n" +
    "window.DROP_SERIALS=" + JSON.stringify(serials) + ";\n"
  );
  console.error(`[producer] wrote serials.js · ${Object.keys(serials).length}/${out.length} works (${noSerial} without a crawled serial)`);

  console.error(
    `[producer] wrote ${out.length} works · ${makerSet.size} makers · ${witSet.size} witnesses · ` +
    `${out.filter((w) => w.review).length} review · ${overridden} overrides · excluded ${droppedNoImg} image-less`
  );

  if (wantDiff || live) printDiff(baseline, out);
  console.error("[producer] done.");
}

// Added/dropped vs the pre-run baked file. On an unattended run this is the
// only account of what changed, so it names people, not just drop ids.
function printDiff(prev, newWorks) {
  const prevIds = new Set(prev.map((w) => w.drop));
  const newIds = new Set(newWorks.map((w) => w.drop));
  const added = newWorks.filter((w) => !prevIds.has(w.drop));
  const dropped = prev.filter((w) => !newIds.has(w.drop));
  const who = (w) => (w.makers && w.makers.length ? w.makers.join(" + ") : "an outsider");
  console.error(`[producer] diff vs baseline: +${added.length} added, -${dropped.length} dropped`);
  for (const w of added) {
    console.error(`  + ${who(w)} — witnessed by ${w.witnesses.join(", ")}${w.review ? "   [review]" : ""}   ${w.drop}`);
  }
  for (const w of dropped) console.error(`  - ${who(w)}   ${w.drop}`);
}

build().catch((e) => { console.error("[producer] FAILED:", e.stack || e.message); process.exit(1); });
