// Canvas renderer: read-only on sim state. Paper + ink + red offset shadow.
import { TILE } from "./tuning.js";
import { findAnchor, center, spawnPoint, ringGlow } from "./physics.js";
import * as Art from "./oribu-art.js";
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
  // one-shot pose timers (s): fed from sim events via note(); "knock" = side-brush knock-back (~0.5s)
  const fx = { bop: 0, knock: 0 }, flagT = new Map(); let lastT = 0;
  const note = ev => { if (ev.includes("bop")) fx.bop = 0.18; if (ev.includes("knock")) fx.knock = 0.5; };
  return { resize, note, draw(s, alpha = 1, time = 0) {
    const dt = Math.min(0.1, Math.max(0, time - lastT)); lastT = time; fx.bop = Math.max(0, fx.bop - dt); fx.knock = Math.max(0, fx.knock - dt);
    if (!W || !H) resize();
    const sc = H / (VIEW_TILES * TILE), vw = W / sc, vh = H / sc, m = s.m;
    const c = s.dead > 0 && cam ? { x: cam.x + vw / 2, y: cam.y + vh / 2 } : center(s);
    const tx = Math.max(0, Math.min(m.W * TILE - vw, c.x - vw * 0.4)), ty = Math.max(-2 * TILE, Math.min(m.H * TILE - vh, c.y - vh * 0.55));
    cam = cam ? { x: cam.x + (tx - cam.x) * 0.2, y: cam.y + (ty - cam.y) * 0.12 } : { x: tx, y: ty };
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    Art.drawBackground(ctx, W, H, cam.x, sc);
    ctx.setTransform(dpr * sc, 0, 0, dpr * sc, -cam.x * sc * dpr, -cam.y * sc * dpr);
    const x0 = Math.max(0, Math.floor(cam.x / TILE) - 1), x1 = Math.min(m.W - 1, Math.ceil((cam.x + vw) / TILE) + 1);
    const y0 = Math.max(0, Math.floor(cam.y / TILE) - 1), y1 = Math.min(m.H - 1, Math.ceil((cam.y + vh) / TILE) + 1);
    // red offset shadow pass, then paper + ink
    const solid = (x, y) => { const c = m.grid[y]?.[x]; return c === "#" || c === "W"; };
    ctx.fillStyle = C.red;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (solid(x, y) && !solid(x + 1, y + 1)) ctx.fillRect(x * TILE + 6, y * TILE + 6, TILE, TILE);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const t = m.grid[y][x], X = x * TILE, Y = y * TILE;
      if (t === "#" || t === "W") {
        const e = { t: !solid(x, y - 1), b: !solid(x, y + 1), l: !solid(x - 1, y), r: !solid(x + 1, y) };
        const k = t === "W" ? (e.l ? "brickClingL" : e.r ? "brickClingR" : "brick") : e.t ? (e.l ? "roofEdgeL" : e.r ? "roofEdgeR" : "roof") : "brick";
        Art.drawTile(ctx, k, X, Y, e);
      } else if (t === "^") Art.drawTile(ctx, "awning", X, Y);
    }
    // flags
    m.checkpoints.forEach((k, i) => { const up = i <= s.cp; if (up && !flagT.has(i)) flagT.set(i, time); if (!up) flagT.delete(i);
      const a = up ? Math.min(1, (time - flagT.get(i)) / 0.25) : 0, b = up ? Math.min(1, (time - flagT.get(i)) / 0.5) : 1; Art.drawFlag(ctx, k.x, k.y, a, b); });
    if (m.finish) Art.drawFlag(ctx, m.finish.x, m.finish.y, 1, 1, true);
    // anchors
    const target = s.p.rope ? s.p.rope.a : (s.dead ? null : findAnchor(s, s.p.last));
    for (const a of m.anchors) { const gl = ringGlow(s, a);
      if (gl > 0.05) { ctx.fillStyle = `rgba(255,183,3,${(0.15 + 0.45 * gl).toFixed(3)})`; ctx.beginPath(); ctx.arc(a.x, a.y, 14 + 14 * gl, 0, 7); ctx.fill(); }
      Art.drawAnchor(ctx, a.x, a.y, a === target, time); }
    // balloons
    for (const b of m.balloons) if (!b.got) Art.drawBalloon(ctx, b.x, b.y, (b.x / TILE | 0), time);
    // pigeons
    for (const g of s.pigeons) if (g.alive) Art.drawPigeon(ctx, g.x, g.y, g.dir, time);
    // hero
    Art.drawOribu(ctx, Art.oribuPose(s, fx), time); // dead => "hit" star-spin
    // stars fx
    for (const f of s.fx) Art.star(ctx, f.x, f.y, 5 * Math.min(1, f.life * 2.5));
  } };
}
