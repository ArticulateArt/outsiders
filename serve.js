#!/usr/bin/env node
/* serve.js — tiny static server for local preview of site/ (no deps).
   node serve.js [port]   →  http://localhost:8347/          */
const http = require("http"), fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, "site");
const PORT = +(process.argv[2] || 8347);
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json",
  ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg", ".webp": "image/webp", ".woff2": "font/woff2" };

/* ── dev-only frame shim (?shim=1) ────────────────────────────────────────────
   Headless/offscreen preview tabs report document.hidden, so the browser never
   fires requestAnimationFrame and the WebGL canvas stays black. With ?shim=1 the
   server injects a stub that queues rAF callbacks and exposes window.__step(n),
   so frames can be advanced deliberately for screenshots. Never served without
   the flag — the page itself is untouched. */
const SHIM = `<script>(function(){
  var q=[],t=0;
  window.requestAnimationFrame=function(cb){ q.push(cb); return q.length; };
  window.cancelAnimationFrame=function(){};
  /* the page derives dt from performance.now(), so a synchronous burst of frames
     would advance no world-time at all — the virtual clock has to drive both. */
  var realNow=performance.now.bind(performance);
  performance.now=function(){ return t; };
  window.__realNow=realNow;
  try{ Object.defineProperty(document,"hidden",{get:function(){return false;}});
       Object.defineProperty(document,"visibilityState",{get:function(){return "visible";}}); }catch(e){}
  window.__step=function(n){ n=n||1; for(var i=0;i<n;i++){ var due=q; q=[]; t+=16.7;
      for(var k=0;k<due.length;k++){ try{ due[k](t); }catch(e){ console.error("frame:",e); } } }
    return {frames:n,clock:t,queued:q.length}; };
  /* the offscreen pane reports innerWidth 0 on a fresh navigation, which sizes the
     renderer to nothing — pin a deterministic viewport instead of racing the pane. */
  window.__viewport=function(w,h){
    Object.defineProperty(window,"innerWidth",{get:function(){return w;},configurable:true});
    Object.defineProperty(window,"innerHeight",{get:function(){return h;},configurable:true});
    window.dispatchEvent(new Event("resize"));
    return [window.innerWidth,window.innerHeight];
  };
  /* The page's script is an IIFE, so nothing is reachable from outside; wrap the
     renderer to keep the last scene/camera it drew on window.__three.
     Polling for THREE is a race: the page's inline script constructs the renderer in
     the same parse, so a setTimeout may not fire first. three's UMD assigns its exports
     object early and fills it in progressively, so intercept the moment WebGLRenderer
     itself is assigned. r128 puts render() on the INSTANCE, hence wrapping the ctor. */
  function wrapRenderer(Real){
    function Patched(params){
      var r=new Real(params), realRender=r.render.bind(r);
      r.render=function(scene,camera){ window.__three={scene:scene,camera:camera,renderer:r};
        return realRender(scene,camera); };
      return r;
    }
    Patched.prototype=Real.prototype;
    return Patched;
  }
  function armExports(obj){
    if(!obj||obj.__armed) return; obj.__armed=true;
    var held;
    Object.defineProperty(obj,"WebGLRenderer",{configurable:true,
      get:function(){ return held; },
      set:function(v){ held=wrapRenderer(v); }});
  }
  var theHolder;
  Object.defineProperty(window,"THREE",{configurable:true,
    get:function(){ return theHolder; },
    set:function(v){ theHolder=v; armExports(v); }});
  /* Grab the frame. drawImage() on the live GL canvas races the compositor — with
     preserveDrawingBuffer off it intermittently comes back empty — so read the back
     buffer directly instead. readPixels is bottom-up, hence the row flip.
     The gain argument multiplies exposure; the scene is deliberately near-black,
     so a lift is often the only way to inspect structure. */
  window.__shot=function(name,scale,gain){
    window.__step(1);
    var el=document.querySelector("canvas"), gl=el.getContext("webgl2")||el.getContext("webgl");
    var W=el.width, H=el.height, g=gain||1;
    var buf=new Uint8Array(W*H*4);
    gl.readPixels(0,0,W,H,gl.RGBA,gl.UNSIGNED_BYTE,buf);
    var full=document.createElement("canvas"); full.width=W; full.height=H;
    var fx=full.getContext("2d"), img=fx.createImageData(W,H), D=img.data;
    for(var y=0;y<H;y++){ var src=(H-1-y)*W*4, dst=y*W*4;
      for(var x2=0;x2<W*4;x2+=4){
        D[dst+x2]  =Math.min(255,buf[src+x2]*g);
        D[dst+x2+1]=Math.min(255,buf[src+x2+1]*g);
        D[dst+x2+2]=Math.min(255,buf[src+x2+2]*g);
        D[dst+x2+3]=255; } }
    fx.putImageData(img,0,0);
    var s=scale||1, out=full;
    if(s!==1){ out=document.createElement("canvas"); out.width=Math.round(W*s); out.height=Math.round(H*s);
      var ox=out.getContext("2d"); ox.imageSmoothingQuality="high"; ox.drawImage(full,0,0,out.width,out.height); }
    return fetch("/__shot?name="+encodeURIComponent(name||"shot"),
      {method:"POST",body:out.toDataURL("image/png")}).then(function(r){return r.text();});
  };
})();<\/script>`;

/* POST /__shot?name=foo  with a base64 PNG body → writes .preview/foo.png.
   The preview pane won't composite the WebGL layer into its screenshots, so the
   page grabs its own canvas (right after a __step, before the buffer is cleared)
   and ships it here to be looked at as a file. */
const SHOTS = path.join(__dirname, ".preview");

http.createServer((req, res) => {
  if (req.method === "POST" && req.url.startsWith("/__shot")) {
    let body = "";
    req.on("data", c => (body += c));
    req.on("end", () => {
      const name = (new URL(req.url, "http://x").searchParams.get("name") || "shot").replace(/[^\w.-]/g, "_");
      fs.mkdirSync(SHOTS, { recursive: true });
      const out = path.join(SHOTS, name + ".png");
      fs.writeFileSync(out, Buffer.from(body.replace(/^data:image\/png;base64,/, ""), "base64"));
      res.writeHead(200, { "content-type": "text/plain" }).end(out);
    });
    return;
  }
  const shim = /[?&]shim=1/.test(req.url);
  let p = decodeURIComponent(req.url.split("?")[0]);
  if (p === "/" || p.endsWith("/")) p += "index.html";
  // /__dev/* serves project-root tooling (the egg contact sheet); never part of the site
  const dev = p.startsWith("/__dev/");
  const base = dev ? __dirname : ROOT;
  if (dev) p = p.slice(6);
  const file = path.join(base, path.normalize(p).replace(/^(\.\.[/\\])+/, ""));
  if (!file.startsWith(base)) { res.writeHead(403).end("forbidden"); return; }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404, { "content-type": "text/plain" }).end("not found: " + p); return; }
    const ext = path.extname(file).toLowerCase();
    if (shim && ext === ".html") buf = Buffer.from(String(buf).replace(/<head>/i, "<head>" + SHIM));
    res.writeHead(200, { "content-type": TYPES[ext] || "application/octet-stream" });
    res.end(buf);
  });
}).listen(PORT, () => console.log("serving site/ on http://localhost:" + PORT));
