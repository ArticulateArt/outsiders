#!/usr/bin/env node
/* bake-eggs.js — turn the SVGs in ./drawings into star-formation point sets.
 *
 * Each SVG's filename (minus extension, lower-cased) becomes the codeword a visitor
 * types to make the work-stars fly into that shape (a "drone show"). We sample points
 * evenly along every path in the SVG, normalise to a centred, aspect-preserved unit box
 * (y flipped SVG→world), and emit site/data/eggs.js  ->  window.EGGS = { codeword: {ar, pts:[[x,y],…]} }.
 *
 * Usage:  npm i svg-path-properties   (once)   then:   node bake-eggs.js
 * The viewer resamples pts to however many stars exist, so the same SVG auto-scales as the community grows.
 */
const fs = require("fs");
const path = require("path");
const { svgPathProperties } = require("svg-path-properties");

const DRAWINGS = path.join(__dirname, "drawings");
const OUT = path.join(__dirname, "site", "data", "eggs.js");
const SAMPLES = 260;          // baked points per egg (viewer picks N≤this evenly)
const MIN_SEG = 3;            // never fewer than this many samples on a tiny path
const STARS_TODAY = 129;      // only used to warn about drawings too fine to read as a formation

/* ── SVG transforms ───────────────────────────────────────────────────────────
   Affinity/Serif exports wrap paths in <g transform="matrix(…)">. Sampling the
   raw `d` and ignoring that silently distorts the drawing — harmless when every
   path carries the SAME translate (the normalise step cancels it), badly wrong
   the moment one group is scaled, rotated, or offset differently. So compose the
   matrix stack properly. Matrix is [a,b,c,d,e,f]: (x,y) → (ax+cy+e, bx+dy+f). */
const I = [1, 0, 0, 1, 0, 0];
const mul = (A, B) => [
  A[0] * B[0] + A[2] * B[1], A[1] * B[0] + A[3] * B[1],
  A[0] * B[2] + A[2] * B[3], A[1] * B[2] + A[3] * B[3],
  A[0] * B[4] + A[2] * B[5] + A[4], A[1] * B[4] + A[3] * B[5] + A[5],
];
const apply = (M, x, y) => [M[0] * x + M[2] * y + M[4], M[1] * x + M[3] * y + M[5]];

function parseTransform(str) {
  let M = I;
  const re = /([a-zA-Z]+)\s*\(([^)]*)\)/g;
  let m;
  while ((m = re.exec(str))) {
    const n = m[2].trim().split(/[\s,]+/).map(Number).filter(v => !Number.isNaN(v));
    const rad = a => (a * Math.PI) / 180;
    let T = null;
    switch (m[1].toLowerCase()) {
      case "matrix":    if (n.length >= 6) T = n.slice(0, 6); break;
      case "translate": T = [1, 0, 0, 1, n[0] || 0, n[1] || 0]; break;
      case "scale":     T = [n[0] ?? 1, 0, 0, n[1] ?? n[0] ?? 1, 0, 0]; break;
      case "rotate": {
        const c = Math.cos(rad(n[0] || 0)), s = Math.sin(rad(n[0] || 0));
        T = [c, s, -s, c, 0, 0];
        if (n.length >= 3) T = mul(mul([1, 0, 0, 1, n[1], n[2]], T), [1, 0, 0, 1, -n[1], -n[2]]);
        break;
      }
      case "skewx":     T = [1, 0, Math.tan(rad(n[0] || 0)), 1, 0, 0]; break;
      case "skewy":     T = [1, Math.tan(rad(n[0] || 0)), 0, 1, 0, 0]; break;
    }
    if (T) M = mul(M, T);
  }
  return M;
}

/* Walk the markup keeping a transform stack, and return every path's `d` paired
   with the composed matrix that applies to it. */
function pathsFromSvg(svg) {
  const out = [];
  const stack = [I];
  const tag = /<(\/?)([a-zA-Z][\w:.-]*)((?:"[^"]*"|'[^']*'|[^>])*?)(\/?)>/g;
  let m;
  while ((m = tag.exec(svg))) {
    const [, closing, name, attrs, selfClose] = m;
    const lname = name.toLowerCase();
    if (closing) { if (stack.length > 1) stack.pop(); continue; }

    const tm = /\btransform\s*=\s*"([^"]*)"/i.exec(attrs) || /\btransform\s*=\s*'([^']*)'/i.exec(attrs);
    const here = tm ? mul(stack[stack.length - 1], parseTransform(tm[1])) : stack[stack.length - 1];

    if (lname === "path") {
      const d = /\bd\s*=\s*"([^"]*)"/i.exec(attrs) || /\bd\s*=\s*'([^']*)'/i.exec(attrs);
      if (d && d[1].trim()) out.push({ d: d[1], M: here });
    }
    // only containers keep a stack frame; void/self-closed tags never nest
    if (!selfClose && !["path", "meta", "br", "img", "use", "image", "stop"].includes(lname)) stack.push(here);
  }
  return out;
}

function sampleFile(file) {
  const svg = fs.readFileSync(file, "utf8");
  const items = pathsFromSvg(svg);
  if (!items.length) return null;

  // measure each path; distribute the sample budget by arc-length so density is uniform
  const props = items
    .map(it => { try { return { p: new svgPathProperties(it.d), M: it.M }; } catch { return null; } })
    .filter(Boolean);
  const lens = props.map(o => o.p.getTotalLength());
  const total = lens.reduce((a, b) => a + b, 0);
  if (total <= 0) return null;

  const pts = [];
  props.forEach((o, i) => {
    const n = Math.max(MIN_SEG, Math.round(SAMPLES * lens[i] / total));
    for (let k = 0; k < n; k++) {
      const pt = o.p.getPointAtLength(lens[i] * (k / (n - 1 || 1)));
      pts.push(apply(o.M, pt.x, pt.y));
    }
  });

  // normalise: tight bbox of the sampled points, centre, scale so max extent = 1, flip Y
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of pts) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
  const w = maxX - minX, h = maxY - minY, s = 1 / Math.max(w, h, 1e-6);
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  const norm = pts.map(([x, y]) => [ +(((x - cx) * s).toFixed(4)), +(((cy - y) * s).toFixed(4)) ]); // y flipped
  // how many stars each path would win at today's field size — the legibility signal
  const share = lens.map(l => (STARS_TODAY * l) / total);
  return { egg: { ar: +(w / h).toFixed(4), pts: norm }, paths: props.length, share, transformed: props.some(o => o.M !== I) };
}

const files = fs.readdirSync(DRAWINGS).filter(f => f.toLowerCase().endsWith(".svg")).sort();
const eggs = {};
const report = [], warn = [];
for (const f of files) {
  const code = path.basename(f, path.extname(f)).toLowerCase();
  const r = sampleFile(path.join(DRAWINGS, f));
  if (!r) { warn.push(`  ${f}: SKIPPED — no usable <path>`); continue; }
  eggs[code] = r.egg;
  report.push(`  ${f.padEnd(14)} -> "${code}"`.padEnd(34) +
    `${String(r.egg.pts.length).padStart(3)} pts · aspect ${r.egg.ar.toFixed(2)} · ${r.paths} path(s)` +
    (r.transformed ? " · transformed" : ""));

  /* Warn where a drawing will read poorly once resampled onto ~129 stars: extreme
     aspect ratios shrink to a sliver on screen, and paths that win fewer than ~3
     stars vanish. This is a drawing note for the founder, not a code problem. */
  const thin = r.share.filter(n => n < 3).length;
  if (r.egg.ar < 0.5 || r.egg.ar > 2)
    warn.push(`  ${code}: aspect ${r.egg.ar.toFixed(2)} is very ${r.egg.ar < 1 ? "tall" : "wide"} — reads small on screen`);
  if (thin >= Math.max(3, r.paths * 0.4))
    warn.push(`  ${code}: ${thin}/${r.paths} paths get <3 stars at ${STARS_TODAY} — detail will drop out`);
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT,
  "/* eggs.js — typed-codeword star formations, baked from drawings/*.svg by bake-eggs.js.\n" +
  "   window.EGGS = { codeword: { ar:<w/h>, pts:[[x,y],…] } }  · coords centred, max-extent 1, y-up. */\n" +
  "window.EGGS=" + JSON.stringify(eggs) + ";\n");

console.error(`[bake-eggs] ${Object.keys(eggs).length} egg(s) → ${path.relative(process.cwd(), OUT)} ` +
  `(${(fs.statSync(OUT).size / 1024).toFixed(1)}KB)`);
console.error(report.join("\n"));
if (warn.length) console.error("\n[legibility — a drawing note, not an error]\n" + warn.join("\n"));
