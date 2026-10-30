// Canvas renderer: read-only on sim state. Paper + ink + red offset shadow.
import { TILE } from "./tuning.js";
import { findAnchor, center, spawnPoint } from "./physics.js";
const C = { paper: "#faf7f1", ink: "#1c1916", red: "#d63c3c", cuff: "#fb8500", mint: "#3fd0a0", pow: "#ffb703", sky: "#a9cde6", blue: "#3a86ff" };
const VIEW_TILES = 11; // tiles visible vertically
export function makeRenderer(cv) {
  const ctx = cv.getContext("2d"); let W = 0, H = 0, dpr = 1, cam = null;
  // fixed pseudo-random skyline (deterministic)
  const sky1 = Array.from({ length: 60 }, (_, i) => ({ x: i * 90, w: 60 + (i * 37) % 50, h: 80 + (i * 53) % 120 }));
  const sky2 = Array.from({ length: 60 }, (_, i) => ({ x: i * 130, w: 90 + (i * 29) % 60, h: 60 + (i * 71) % 90 }));
  function resize() { dpr = Math.min(devicePixelRatio || 1, 2); const r = cv.getBoundingClientRect(); W = r.width; H = r.height;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
  addEventListener("resize", resize); resize();
  return { resize, draw(s, alpha = 1, time = 0) {
    if (!W || !H) resize();
    const sc = H / (VIEW_TILES * TILE), vw = W / sc, vh = H / sc, m = s.m;
    const c = s.dead > 0 && cam ? { x: cam.x + vw / 2, y: cam.y + vh / 2 } : center(s);
    const tx = Math.max(0, Math.min(m.W * TILE - vw, c.x - vw * 0.4)), ty = Math.max(-2 * TILE, Math.min(m.H * TILE - vh, c.y - vh * 0.55));
    cam = cam ? { x: cam.x + (tx - cam.x) * 0.2, y: cam.y + (ty - cam.y) * 0.12 } : { x: tx, y: ty };
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = C.sky; ctx.fillRect(0, 0, W, H);
    // parallax: pale skyline, then mid rooftops (flat, low contrast)
    const par = (list, f, col, base, gap) => { ctx.fillStyle = col; const span = list.length * gap;
      for (const b of list) { const X = (((b.x - cam.x * f) % span) + span) % span - 150; if (X > W) continue; const bh = b.h * Math.min(1.4, sc * 1.2); ctx.fillRect(X, H - base - bh, b.w, bh + base); } };
    par(sky1, 0.15, "#c9dceb", H * 0.25, 90); par(sky2, 0.35, "#b5cfe0", H * 0.08, 130);
    ctx.setTransform(dpr * sc, 0, 0, dpr * sc, -cam.x * sc * dpr, -cam.y * sc * dpr);
    const x0 = Math.max(0, Math.floor(cam.x / TILE) - 1), x1 = Math.min(m.W - 1, Math.ceil((cam.x + vw) / TILE) + 1);
    const y0 = Math.max(0, Math.floor(cam.y / TILE) - 1), y1 = Math.min(m.H - 1, Math.ceil((cam.y + vh) / TILE) + 1);
    // red offset shadow pass, then paper + ink
    const solid = (x, y) => { const c = m.grid[y]?.[x]; return c === "#" || c === "W"; };
    ctx.fillStyle = C.red;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (solid(x, y) && !solid(x + 1, y + 1)) ctx.fillRect(x * TILE + 4, y * TILE + 4, TILE, TILE);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const t = m.grid[y][x], X = x * TILE, Y = y * TILE;
      if (t === "#" || t === "W") {
        ctx.fillStyle = C.paper; ctx.fillRect(X, Y, TILE, TILE);
        ctx.strokeStyle = C.ink; ctx.lineWidth = 2.5; ctx.beginPath();
        if (!solid(x, y - 1)) { ctx.moveTo(X, Y); ctx.lineTo(X + TILE, Y); }
        if (!solid(x, y + 1)) { ctx.moveTo(X, Y + TILE); ctx.lineTo(X + TILE, Y + TILE); }
        if (!solid(x - 1, y)) { ctx.moveTo(X, Y); ctx.lineTo(X, Y + TILE); }
        if (!solid(x + 1, y)) { ctx.moveTo(X + TILE, Y); ctx.lineTo(X + TILE, Y + TILE); }
        ctx.stroke();
        if (t === "W") { // brick + mint cling stripe
          ctx.strokeStyle = "#1c191633"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(X + 3, Y + 16); ctx.lineTo(X + TILE - 3, Y + 16); ctx.moveTo(X + 16, Y + 3); ctx.lineTo(X + 16, Y + 13); ctx.stroke();
          ctx.fillStyle = C.mint; if (!solid(x - 1, y)) ctx.fillRect(X + 1, Y, 6, TILE); if (!solid(x + 1, y)) ctx.fillRect(X + TILE - 7, Y, 6, TILE);
        } else if (!solid(x, y - 1)) { ctx.strokeStyle = "#1c191633"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(X + 4, Y + 7); ctx.lineTo(X + TILE - 4, Y + 7); ctx.stroke(); }
      } else if (t === "^") { // striped bounce awning
        for (let i = 0; i < 4; i++) { ctx.fillStyle = i % 2 ? C.paper : C.red; ctx.fillRect(X + i * 8, Y + 4, 8, 12); }
        ctx.strokeStyle = C.ink; ctx.lineWidth = 2; ctx.strokeRect(X, Y + 4, TILE, 12);
      }
    }
    // flags
    m.checkpoints.forEach((k, i) => flag(k.x, k.y, i <= s.cp ? C.red : "#b9b2a8", i <= s.cp));
    if (m.finish) { flag(m.finish.x, m.finish.y, C.red, true, true); }
    // anchors
    const target = s.p.rope ? s.p.rope.a : (s.dead ? null : findAnchor(s, s.p.last));
    for (const a of m.anchors) {
      const on = a === target, pulse = on ? 1 + Math.sin(time * 8) * 0.12 : 1;
      if (on) { ctx.fillStyle = "#ffb70355"; ctx.beginPath(); ctx.arc(a.x, a.y, 20 * pulse, 0, 7); ctx.fill(); }
      ctx.lineWidth = 6; ctx.strokeStyle = C.ink; ctx.beginPath(); ctx.arc(a.x, a.y, 10, 0, 7); ctx.stroke();
      ctx.lineWidth = 3.5; ctx.strokeStyle = C.pow; ctx.stroke();
    }
    // balloons
    for (const b of m.balloons) if (!b.got) {
      const bob = Math.sin(time * 2 + b.x) * 3, hue = ["#ff6b6b", "#ffb703", "#3a86ff", "#3fd0a0", "#c77dff"][(b.x / TILE | 0) % 5];
      ctx.strokeStyle = C.ink; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(b.x, b.y + 8 + bob); ctx.quadraticCurveTo(b.x + 4, b.y + 16 + bob, b.x, b.y + 22 + bob); ctx.stroke();
      ctx.fillStyle = hue; ctx.beginPath(); ctx.ellipse(b.x, b.y + bob, 8, 10, 0, 0, 7); ctx.fill(); ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = "#fff8"; ctx.beginPath(); ctx.arc(b.x - 3, b.y - 4 + bob, 2.2, 0, 7); ctx.fill();
    }
    // pigeons
    for (const g of s.pigeons) if (g.alive) pigeon(g, time);
    // hero
    if (!s.dead && !(s.p.inv > 0 && Math.floor(time * 12) % 2)) hero(s, time);
    // stars fx
    for (const f of s.fx) star(f.x, f.y, 5 * Math.min(1, f.life * 2.5));
    function flag(x, y, col, up, fin) {
      ctx.strokeStyle = C.ink; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - 46); ctx.stroke();
      ctx.fillStyle = col; ctx.beginPath(); const fy = up ? y - 46 : y - 22; ctx.moveTo(x, fy); ctx.lineTo(x + 22, fy + 7); ctx.lineTo(x, fy + 14); ctx.closePath(); ctx.fill(); ctx.lineWidth = 2; ctx.stroke();
      if (fin) { ctx.fillStyle = C.ink; ctx.font = "bold 11px sans-serif"; ctx.fillText("FINISH", x - 18, y - 52); }
    }
    function star(x, y, r) { ctx.fillStyle = C.pow; ctx.strokeStyle = C.ink; ctx.lineWidth = 1.2; ctx.beginPath();
      for (let i = 0; i < 10; i++) { const a = i * Math.PI / 5 - Math.PI / 2, rr = i % 2 ? r * 0.45 : r; ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } ctx.closePath(); ctx.fill(); ctx.stroke(); }
    function pigeon(g, t) {
      const x = g.x, y = g.y + Math.sin(t * 6 + g.x0) * 2, d = g.dir;
      ctx.fillStyle = "#9aa3ad"; ctx.strokeStyle = C.ink; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(x, y, 13, 10, 0, 0, 7); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(x - d * 3, y + 1, 7, 4, Math.sin(t * 14) * 0.5, 0, 7); ctx.fillStyle = "#7d8790"; ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(x + d * 6, y - 4, 4.5, 0, 7); ctx.fill(); ctx.stroke();
      ctx.fillStyle = C.ink; ctx.beginPath(); ctx.arc(x + d * 7, y - 4, 2, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.moveTo(x + d * 2, y - 9); ctx.lineTo(x + d * 10, y - 7); ctx.stroke(); // grumpy brow
      ctx.fillStyle = C.cuff; ctx.beginPath(); ctx.moveTo(x + d * 12, y - 2); ctx.lineTo(x + d * 18, y); ctx.lineTo(x + d * 12, y + 2); ctx.fill();
    }
    function hero(s, t) {
      const p = s.p, w = s.t.w, h = s.t.h, cx = p.x + w / 2, f = p.face || 1;
      const sp = Math.hypot(p.vx, p.vy), run = p.ground && Math.abs(p.vx) > 10, ph = t * 14;
      const head = { x: cx, y: p.y + 9 }, neck = { x: cx, y: p.y + 18 }, hip = { x: cx, y: p.y + 29 };
      // scarf: length shows speed
      const len = 8 + Math.min(26, sp / 12), flap = Math.sin(t * 20) * (2 + sp / 80);
      const ang = sp > 20 ? Math.atan2(-p.vy, -p.vx) : Math.PI / 2 + (f > 0 ? 0.3 : -0.3);
      ctx.strokeStyle = C.red; ctx.lineWidth = 5; ctx.lineCap = "round"; ctx.beginPath(); ctx.moveTo(neck.x, neck.y - 1);
      ctx.quadraticCurveTo(neck.x + Math.cos(ang) * len * 0.5 + flap, neck.y + Math.sin(ang) * len * 0.5, neck.x + Math.cos(ang) * len, neck.y + Math.sin(ang) * len + flap); ctx.stroke();
      // rope
      let hand = null;
      if (p.rope) { const a = p.rope.a; hand = { x: cx + (a.x - cx) * 0.12, y: neck.y + 2 + (a.y - neck.y) * 0.12 };
        ctx.strokeStyle = C.ink; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(hand.x, hand.y); ctx.lineTo(a.x, a.y); ctx.stroke();
        ctx.beginPath(); ctx.arc(a.x, a.y - 4, 4, Math.PI * 0.1, Math.PI * 1.2); ctx.stroke(); }
      ctx.strokeStyle = C.ink; ctx.lineWidth = 3.2; ctx.lineCap = "round"; const L = (a, b) => { ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); };
      L(neck, hip);
      // legs
      if (p.wall) { L(hip, { x: cx + p.wall * 6, y: hip.y + 10 }); L(hip, { x: cx + p.wall * 9, y: hip.y + 4 }); }
      else if (!p.ground) { L(hip, { x: cx + f * 7, y: hip.y + 7 }); L(hip, { x: cx - f * 5, y: hip.y + 10 }); }
      else if (run) { L(hip, { x: cx + Math.sin(ph) * 8, y: p.y + h }); L(hip, { x: cx - Math.sin(ph) * 8, y: p.y + h }); }
      else { L(hip, { x: cx - 4, y: p.y + h }); L(hip, { x: cx + 4, y: p.y + h }); }
      // arms (cuff on the front arm)
      const sh = { x: cx, y: neck.y + 2 };
      const front = hand || (p.wall ? { x: cx + p.wall * 9, y: sh.y - 6 } : !p.ground ? { x: cx + f * 9, y: sh.y - 7 } : run ? { x: cx + Math.sin(ph + 3) * 9, y: sh.y + 7 } : { x: cx + f * 6, y: sh.y + 9 });
      const back = !p.ground ? { x: cx - f * 9, y: sh.y - 3 } : run ? { x: cx - Math.sin(ph + 3) * 9, y: sh.y + 7 } : { x: cx - f * 6, y: sh.y + 9 };
      L(sh, back); L(sh, front);
      ctx.fillStyle = C.cuff; ctx.strokeStyle = C.ink; ctx.lineWidth = 1.5; const cxu = sh.x + (front.x - sh.x) * 0.75, cyu = sh.y + (front.y - sh.y) * 0.75;
      ctx.beginPath(); ctx.arc(cxu, cyu, 3.6, 0, 7); ctx.fill(); ctx.stroke();
      // head: round, ink outline, eyes face forward
      ctx.fillStyle = C.paper; ctx.strokeStyle = C.ink; ctx.lineWidth = 2.6; ctx.beginPath(); ctx.arc(head.x, head.y, 8.5, 0, 7); ctx.fill(); ctx.stroke();
      ctx.fillStyle = C.ink; ctx.beginPath(); ctx.arc(head.x + f * 3.5, head.y - 1, 1.6, 0, 7); ctx.arc(head.x + f * 0.2, head.y - 1, 1.6, 0, 7); ctx.fill();
      ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(head.x + f * 2, head.y + 2.5, 2.4, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
    }
  } };
}
