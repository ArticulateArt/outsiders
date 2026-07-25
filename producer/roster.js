"use strict";
/* ═══════════════════════════════════════════════════════════════════════
   THE ROSTER — who is allowed to witness

   A work enters the Portrait when someone marks it :outsiders:. This file
   answers the only question that gates that: *whose mark counts?*

   The answer is a chain of trust rooted in one person.

     depth 0   Articulate — the founder.
     depth 1   everyone Articulate granted OUTSIDERS Grant Rep to.
     depth 2   everyone THEY granted it to.
     …         (CONFIG.trustDepth; null = follow it as far as it goes)

   So the founder does not have to witness anything himself. He hands the
   right to witness to people he trusts, and they hand it on. The community
   grows its own eyes. Nobody outside the chain can put a work on the wall.

   ── why this is not just "is on the grant roster" ─────────────────────
   `/rep/categories/{cat}/recipients` lists everyone who holds the Rep from
   ANYONE, with no provenance. Under that rule a stranger who granted the
   Rep to themselves and a friend would be minting witnesses. We need the
   EDGES — who granted it to whom — and one endpoint has them:

     GET /api/profile-logs?category=OUTSIDERS%20Grant%20Recipient

   Every RATING_EDIT in the category, newest first, carrying giver
   (`profile_*`), receiver (`target_*`), the resulting rating, and — the
   part that matters — `proxy_handle`.

   ── proxies: the grant of record is not always the hand that gave ─────
   6529 lets you hand someone your Rep budget. Four accounts have handed
   theirs to Articulate (gpebbles, MOJ, MadaCollects, dsanchesGM — see
   `/api/profiles/Articulate/proxies`), and grants he made through them are
   recorded under THEIR names. Reading the logs naively, gpebbles looks like
   an independent granter who seeded five witnesses out of nowhere; those
   five would fall out of the chain. `proxy_id`/`proxy_handle` name the hand
   that actually gave — and `proxy_id` is a plain profile id, verified against
   `/profiles/{handle}` — so we walk the chain on the ACTOR, not the account
   of record. As of 2026-07-25 that is the difference between 88 grants by
   Articulate and 76.

   Output: Map profileId -> { handle, depth }.
   ─────────────────────────────────────────────────────────────────────── */

const API = "https://api.6529.io/api";

async function fetchJson(url, tries = 3) {
  let last;
  for (let a = 0; a < tries; a++) {
    try {
      const res = await fetch(url);
      if (res.ok) return res.json();
      last = new Error(`HTTP ${res.status} ${url}`);
      if (res.status < 500 && res.status !== 429) break; // not worth retrying
    } catch (e) { last = e; }
    await new Promise((s) => setTimeout(s, 700 * (a + 1)));
  }
  throw last;
}

/* Every grant in the category, collapsed to the CURRENT state of each
   (giver of record → receiver) pair. The log is newest-first, so the first
   row we see for a pair is its latest value; later rows are its history. */
async function crawlGrants(category, onProgress) {
  const seen = new Set();
  const grants = [];
  let rows = 0;
  for (let page = 1; ; page++) {
    const j = await fetchJson(
      `${API}/profile-logs?page=${page}&page_size=50&category=${encodeURIComponent(category)}`
    );
    const data = j.data || [];
    for (const r of data) {
      if (r.type !== "RATING_EDIT") continue;
      const key = r.profile_id + ">" + r.target_id;
      if (seen.has(key)) continue; // an older edit of a pair we already have
      seen.add(key);
      const c = r.contents || {};
      grants.push({
        ofRecordId: r.profile_id,
        ofRecord: r.profile_handle,
        // the hand that actually gave — a proxy holder acting for the account of record
        actorId: r.proxy_id || r.profile_id,
        actor: r.proxy_handle || r.profile_handle,
        targetId: r.target_id,
        target: r.target_profile_handle,
        rating: c.new_rating == null ? 0 : c.new_rating,
        at: r.created_at,
      });
    }
    rows += data.length;
    if (onProgress) onProgress(rows, grants.length);
    if (!j.next) break;
    if (page > 400) throw new Error("profile-logs paging did not terminate");
  }
  return grants;
}

/* Walk the chain out from the root. Only live grants (rating > 0) carry
   trust — a revoked grant sets the rating to 0 and the edge goes dead. */
function walkChain(grants, rootId, rootHandle, maxDepth) {
  const out = new Map(); // actorId -> [{ id, handle }]
  for (const g of grants) {
    if (!(g.rating > 0)) continue;
    if (!out.has(g.actorId)) out.set(g.actorId, []);
    out.get(g.actorId).push({ id: g.targetId, handle: g.target });
  }
  const trusted = new Map([[rootId, { handle: rootHandle, depth: 0 }]]);
  let frontier = [rootId];
  for (let d = 1; maxDepth == null || d <= maxDepth; d++) {
    const next = [];
    for (const from of frontier) {
      for (const t of out.get(from) || []) {
        if (trusted.has(t.id)) continue;
        trusted.set(t.id, { handle: t.handle, depth: d });
        next.push(t.id);
      }
    }
    if (!next.length) break;
    frontier = next;
  }
  return trusted;
}

/* Everyone holding the Rep, whoever gave it — used only to report who the
   chain leaves out, so an unexplained exclusion is never silent. */
async function crawlHolders(category) {
  const holders = new Map();
  for (let page = 1; ; page++) {
    const j = await fetchJson(
      `${API}/rep/categories/${encodeURIComponent(category)}/recipients?page=${page}`
    );
    for (const row of j.data || []) {
      const p = row.profile || {};
      if (p.id) holders.set(p.id, p.handle);
    }
    if (!j.next) break;
    if (page > 200) break;
  }
  return holders;
}

/* The whole job, live. Returns the shape cached in fixtures/grants.json. */
async function buildLive({ category, rootId, rootHandle, trustDepth }, log = () => {}) {
  const grants = await crawlGrants(category, (rows, pairs) =>
    process.stderr.write(`\r[roster] ${rows} grant-log rows · ${pairs} pairs…`));
  process.stderr.write("\r");
  const trusted = walkChain(grants, rootId, rootHandle, trustDepth);
  const holders = await crawlHolders(category);
  const outside = [...holders].filter(([id]) => !trusted.has(id)).map(([, h]) => h);

  const byDepth = new Map();
  for (const { depth } of trusted.values()) byDepth.set(depth, (byDepth.get(depth) || 0) + 1);
  log(
    `[roster] chain from ${rootHandle}: ` +
    [...byDepth].sort((a, b) => a[0] - b[0]).map(([d, n]) => `depth ${d} → ${n}`).join(" · ") +
    ` = ${trusted.size} may witness`
  );
  if (outside.length) {
    log(`[roster] ${outside.length} hold the Rep but sit outside the chain (their marks are ignored): ${outside.join(", ")}`);
  }

  return {
    _source: `${API}/profile-logs?category=${encodeURIComponent(category)} (+ /profiles/*/proxies via proxy_handle)`,
    _fetched: new Date().toISOString().slice(0, 10),
    _note:
      "Grant edges in the OUTSIDERS Grant Rep category, one row per giver→receiver pair at its " +
      "CURRENT rating. `actor` is the hand that actually gave (a proxy holder acting for `ofRecord`); " +
      "the trust chain is walked on `actor`. Regenerated by producer.js --live; read as-is offline.",
    category,
    rootId,
    rootHandle,
    trustDepth,
    grants,
    outsideChain: outside,
  };
}

module.exports = { buildLive, walkChain, crawlGrants, crawlHolders, fetchJson, API };
