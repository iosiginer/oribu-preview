// Pure, deterministic sim (no DOM, clock or randomness). step(state, input) advances exactly 1/60 s.
import { T, TILE, HZ, derive } from "./tuning.js";
export const DT = 1 / HZ;
const SOLID = new Set(["#", "W"]);

export function parseLevel(level) {
  const rows = level.rows, H = rows.length, W = Math.max(...rows.map(r => r.length));
  const grid = rows.map(r => r.padEnd(W, " ").split(""));
  const out = { W, H, grid, anchors: [], balloons: [], checkpoints: [], pigeons: [], start: null, finish: null };
  grid.forEach((row, y) => row.forEach((c, x) => {
    const cx = x * TILE + TILE / 2, cy = y * TILE + TILE / 2, bot = (y + 1) * TILE;
    if ("SoCbFp".includes(c)) row[x] = " ";
    if (c === "S") out.start = { x: cx, y: bot };
    else if (c === "o") out.anchors.push({ x: cx, y: cy });
    else if (c === "b") out.balloons.push({ x: cx, y: cy, got: false });
    else if (c === "C") out.checkpoints.push({ x: cx, y: bot });
    else if (c === "F") out.finish = { x: cx, y: bot };
    else if (c === "p") out.pigeons.push({ x0: cx, y: cy - 10, w: 26, h: 20 });
  }));
  out.checkpoints.sort((a, b) => a.x - b.x);
  return out;
}
export const tileAt = (m, tx, ty) => (ty < 0 || ty >= m.H || tx < 0 || tx >= m.W) ? (tx < 0 || tx >= m.W ? "#" : " ") : m.grid[ty][tx];
const solidAt = (m, tx, ty) => SOLID.has(tileAt(m, tx, ty));

export function newState(level, tuning = T, save = null) {
  const m = parseLevel(level), D = derive(tuning);
  const s = { m, D, t: tuning, tick: 0, cp: -1, done: false, fx: [], events: [],
    p: null, dead: 0, pigeons: m.pigeons.map(p => ({ ...p, x: p.x0, dir: 1, alive: true, back: 0 })) };
  if (save) { s.cp = save.cp ?? -1; s.tick = save.tick || 0; (save.got || []).forEach(i => m.balloons[i] && (m.balloons[i].got = true)); }
  spawn(s); return s;
}
export function spawnPoint(s) { return s.cp >= 0 ? s.m.checkpoints[s.cp] : s.m.start; }
function spawn(s) {
  const sp = spawnPoint(s), t = s.t;
  s.p = { x: sp.x - t.w / 2, y: sp.y - t.h, vx: 0, vy: 0, ground: true, coyote: 0, buffer: 0, jumping: false,
    wall: 0, lock: 0, lockDir: 0, rope: null, regrab: 0, face: 1, prev: { jump: false, swing: false } };
  s.pigeons.forEach(p => { p.alive = true; p.x = p.x0; p.back = 0; });
}

// Move along one axis and resolve against the tile grid. Returns contact side (-1/1) or 0.
function moveAxis(s, p, dx, dy) {
  const m = s.m, t = s.t; let hit = 0;
  if (dx) {
    p.x += dx;
    const y0 = Math.floor(p.y / TILE), y1 = Math.floor((p.y + t.h - 0.01) / TILE);
    const tx = dx > 0 ? Math.floor((p.x + t.w) / TILE) : Math.floor(p.x / TILE);
    for (let ty = y0; ty <= y1; ty++) if (solidAt(m, tx, ty)) {
      p.x = dx > 0 ? tx * TILE - t.w : (tx + 1) * TILE; hit = Math.sign(dx); break;
    }
  }
  if (dy) {
    p.y += dy;
    const x0 = Math.floor(p.x / TILE), x1 = Math.floor((p.x + t.w - 0.01) / TILE);
    const ty = dy > 0 ? Math.floor((p.y + t.h) / TILE) : Math.floor(p.y / TILE);
    for (let tx = x0; tx <= x1; tx++) {
      const c = tileAt(m, tx, ty);
      if (SOLID.has(c) || (c === "^" && dy > 0 && p.y + t.h - dy <= ty * TILE + 0.01)) {
        p.y = dy > 0 ? ty * TILE - t.h : (ty + 1) * TILE; hit = Math.sign(dy) * (c === "^" ? 2 : 1); break;
      }
    }
  }
  return hit;
}
// Sub-step so fast launches never tunnel through a tile.
function move(s, p, dx, dy) {
  const n = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 8)); let hx = 0, hy = 0;
  for (let i = 0; i < n; i++) {
    if (!hx) { const h = moveAxis(s, p, dx / n, 0); if (h) hx = h; }
    if (!hy) { const h = moveAxis(s, p, 0, dy / n); if (h) hy = h; }
  }
  return { hx, hy };
}
const wallSide = (s, p) => {
  const t = s.t, y0 = Math.floor((p.y + 4) / TILE), y1 = Math.floor((p.y + t.h - 4) / TILE);
  for (const d of [-1, 1]) {
    const tx = Math.floor((d < 0 ? p.x - 1 : p.x + t.w + 1) / TILE);
    for (let ty = y0; ty <= y1; ty++) if (tileAt(s.m, tx, ty) === "W") return d;
  }
  return 0;
};
export function center(s) { const p = s.p; return { x: p.x + s.t.w / 2, y: p.y + s.t.h / 2 }; }
// Nearest anchor in range that is ahead of (or above) the hero.
export function findAnchor(s, skip = null) {
  const c = center(s), p = s.p; let best = null, bd = Infinity;
  for (const a of s.m.anchors) {
    const dx = a.x - c.x, dy = a.y - c.y, d = Math.hypot(dx, dy);
    if (a === skip || d > s.D.range || dy > 0) continue;
    if (dx * p.face < -TILE / 2) continue; // never grab one behind you
    if (d < bd) { bd = d; best = a; }
  }
  return best;
}
function die(s) { if (s.dead > 0 || s.done) return; s.dead = s.t.respawnTime; s.deadAt = center(s); s.poofed = false; s.events.push("fall"); s.p.rope = null; }
function burst(s, x, y, n) { for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; s.fx.push({ x, y, vx: Math.cos(a) * 120, vy: Math.sin(a) * 120 - 40, life: 0.6 }); } }

export function step(s, inp) {
  const D = s.D, t = s.t, p = s.p, m = s.m;
  s.events = [];
  s.fx = s.fx.filter(f => (f.life -= DT) > 0); s.fx.forEach(f => { f.x += f.vx * DT; f.y += f.vy * DT; f.vy += 300 * DT; });
  if (s.done) return s;
  s.tick++;
  if (s.dead > 0) { s.dead -= DT; if (!s.poofed && s.dead <= s.t.poofAt) { s.poofed = true; s.events.push("poof"); /* the art layer draws the single spin + poof */ } if (s.dead <= 0) { s.dead = 0; spawn(s); } return s; }
  const jumpPress = inp.jump && !p.prev.jump, swingPress = inp.swing && !p.prev.swing;
  if (swingPress || p.ground) p.last = null; // the anchor you just let go of needs a fresh press
  p.prev = { jump: !!inp.jump, swing: !!inp.swing };
  let dir = (inp.r ? 1 : 0) - (inp.l ? 1 : 0);
  if (p.lock > 0) { p.lock -= DT; if (dir === p.lockDir) dir = 0; }
  if (dir) p.face = dir;
  p.regrab = Math.max(0, p.regrab - DT); p.inv = Math.max(0, (p.inv || 0) - DT);
  p.assist = p.ground || p.wall ? 0 : Math.max(0, (p.assist || 0) - DT);
  p.buffer = jumpPress ? t.buffer : Math.max(0, p.buffer - DT);
  p.coyote = p.ground ? t.coyote : Math.max(0, p.coyote - DT);

  // --- swing ---
  if (p.rope && !inp.swing) { // release: launch on the arc with a boost
    p.vx *= t.releaseBoost; p.vy *= t.releaseBoost; clampSpeed(p, D.swingMax);
    if (p.vy > -D.assistLift) { p.vy = -D.assistLift; const vmax = Math.sqrt(Math.max(0, D.swingMax ** 2 - p.vy ** 2)); if (Math.abs(p.vx) > vmax) p.vx = Math.sign(p.vx) * vmax; } // lift wins over sideways speed
    p.last = p.rope.a; p.rope = null; p.regrab = t.regrabDelay; p.assist = t.assistTime; p.roof = nextRoof(s); p.ring = nextRing(s, p.roof); if (p.ring) p.roof = null; if (!p.roof && !p.ring) p.assist = 0; p.jumping = false; s.events.push("launch");
  }
  if (!p.rope && inp.swing && !p.ground && p.regrab <= 0) {
    const a = findAnchor(s, p.last) || catchAnchor(s);
    if (a) { const c = center(s); p.rope = { a, len: Math.min(Math.hypot(a.x - c.x, a.y - c.y), D.ropeMax) }; s.events.push("grab"); }
  }
  if (p.rope) {
    p.vy += D.g * DT; p.vx += dir * D.pump * DT;
    const c = center(s), a = p.rope.a;
    let nx = c.x + p.vx * DT, ny = c.y + p.vy * DT;
    const dx = nx - a.x, dy = ny - a.y, d = Math.hypot(dx, dy);
    if (d > p.rope.len) { nx = a.x + dx / d * p.rope.len; ny = a.y + dy / d * p.rope.len; }
    // shorten rope smoothly if it was grabbed longer than max (len already capped) -> velocity from position change
    p.vx = (nx - c.x) / DT; p.vy = (ny - c.y) / DT; clampSpeed(p, D.swingMax);
    if (p.vx) p.face = Math.sign(p.vx);
    const { hx, hy } = move(s, p, nx - c.x, ny - c.y);
    if (hx) p.vx = 0;
    if (hy) { p.vy = 0; if (hy > 0) { p.rope = null; p.ground = true; } }
  } else {
    // --- horizontal ---
    const target = dir * D.top;
    if (dir && Math.abs(p.vx) > D.top && Math.sign(p.vx) === dir) p.vx = Math.sign(p.vx) * Math.max(D.top, Math.abs(p.vx) - D.overDrag * DT);
    else if (dir) p.vx = approach(p.vx, target, (Math.sign(p.vx) === dir || !p.vx ? D.accel : D.decel) * DT);
    else p.vx = approach(p.vx, 0, (p.ground ? D.decel : D.airDecel) * DT);
    // --- jumps ---
    if (p.buffer > 0 && p.coyote > 0) { p.vy = -D.jumpV; p.jumping = true; p.buffer = 0; p.coyote = 0; p.ground = false; s.events.push("jump"); }
    else if (p.buffer > 0 && p.wall && !p.ground) {
      p.vy = -D.wallUp; p.vx = -p.wall * D.wallOut; p.lock = t.wallLock; p.lockDir = p.wall; p.face = -p.wall;
      p.jumping = false; p.buffer = 0; s.events.push("walljump");
    }
    if (p.assist > 0 && p.ring) { // no roof under the next ring: steer toward that ring, never past it
      const a = p.ring, cx = p.x + t.w / 2, f = p.face, gap = (a.x - cx) * f;
      if (gap <= TILE / 2 || p.rope) p.assist = 0;
      else if (dir !== -p.face) { const hi = Math.min(gap / Math.max(p.assist, DT), Math.sqrt(Math.max(0, D.swingMax ** 2 - p.vy ** 2)));
        const v = Math.min(Math.max(p.vx * f, D.assistMin), hi); p.vx = f * v; }
    }
    if (p.assist > 0 && p.roof) { // steer sideways toward the NEXT roof only; gravity untouched
      const r = p.roof, cx = p.x + t.w / 2;
      if (cx >= r.x0 && cx <= r.x1) p.assist = 0; // over that roof: assist off
      else if (dir !== -p.face) {
        const time = fallTime(s, r.top);
        if (time != null) {
          const f = p.face, near = (f > 0 ? r.x0 + 14 : r.x1 - 14) - cx, far = (f > 0 ? r.x1 - 14 : r.x0 + 14) - cx;
          const lo = Math.max(D.assistMin, near * f / time), hi = Math.min(Math.sqrt(Math.max(0, D.swingMax ** 2 - p.vy ** 2)), far * f / time);
          const v = Math.min(Math.max(p.vx * f, lo), hi); if (hi > 0) p.vx = f * v; // never predicted past the far edge
        }
      }
    }
    // --- gravity ---
    let g = D.g;
    if (p.vy > 0) g *= t.fallMult; else if (p.jumping && !inp.jump) g *= D.cutMult;
    p.vy = Math.min(p.vy + g * DT, D.maxFall);
    if (p.wall && p.vy > D.wallSlide && dir !== -p.wall) p.vy = D.wallSlide;
    const wasGround = p.ground;
    const { hx, hy } = move(s, p, p.vx * DT, p.vy * DT);
    if (hx) p.vx = 0;
    p.ground = hy === 1;
    if (hy === 2) { p.vy = -D.awningV; p.jumping = false; p.ground = false; s.events.push("boing"); }
    else if (hy) { if (hy > 0 && !wasGround) s.events.push("land"); p.vy = 0; }
    if (p.ground) p.jumping = false;
    if (!p.ground && p.vy > -1e-6 && p.vy < 1 && !hy) { /* apex */ }
    if (!p.ground) { // still standing if floor directly below
      const x0 = Math.floor(p.x / TILE), x1 = Math.floor((p.x + t.w - 0.01) / TILE), ty = Math.floor((p.y + t.h + 0.5) / TILE);
      if (p.vy >= 0 && Math.abs(ty * TILE - (p.y + t.h)) < 0.6) for (let x = x0; x <= x1; x++) if (solidAt(m, x, ty)) p.ground = true;
    }
  }
  p.wall = p.ground || p.rope ? 0 : wallSide(s, p);

  // --- pigeons ---
  for (const g of s.pigeons) {
    if (!g.alive) { if ((g.back -= DT) <= 0) { g.alive = true; g.x = g.x0; } continue; }
    g.x += g.dir * D.pigeon * DT; if (Math.abs(g.x - g.x0) > TILE * 2) g.dir *= -1;
    const gx = g.x - g.w / 2, gy = g.y - g.h / 2, hx = p.x + (t.w - t.hurtW) / 2, hy = p.y + (t.h - t.hurtH) / 2, feetY = p.y + t.h;
    const hurt = hx < gx + g.w && hx + t.hurtW > gx && hy < gy + g.h && hy + t.hurtH > gy;
    const stomp = p.vy > 0 && p.x < gx + g.w && p.x + t.w > gx && feetY >= gy && feetY - p.vy * DT <= gy + 8;
    if (hurt || stomp) {
      if (stomp) {
        g.alive = false; g.back = t.pigeonRespawn; burst(s, g.x, g.y, 8); s.events.push("bop");
        p.vy = -(inp.jump ? D.bopHeldV : D.bopV); p.jumping = false; p.y = gy - t.h; p.rope = null;
      } else if (!(p.inv > 0)) { // side bump: hop back, blink, keep going
        const away = Math.sign(p.x + t.w / 2 - g.x) || -1; p.vx = away * D.hitX; p.vy = -D.hitUp; p.rope = null; p.jumping = false; p.ground = false;
        p.inv = t.invuln; p.lock = 0.25; p.lockDir = -away; s.events.push("bump", "knock"); // knock stars are drawn by the art layer
      }
    }
  }
  // --- pickups ---
  const c = center(s);
  m.balloons.forEach((b, i) => { if (!b.got && Math.abs(b.x - c.x) < 22 && Math.abs(b.y - c.y) < 30) { b.got = true; s.events.push("balloon"); burst(s, b.x, b.y, 5); } });
  m.checkpoints.forEach((k, i) => { if (i > s.cp && Math.abs(k.x - c.x) < 24 && Math.abs(k.y - (p.y + t.h)) < 48) { s.cp = i; s.events.push("checkpoint"); } });
  if (m.finish && Math.abs(m.finish.x - c.x) < 24 && Math.abs(m.finish.y - (p.y + t.h)) < 48) { s.done = true; s.events.push("finish"); }
  if (p.y > m.H * TILE - t.h / 2) die(s); // die while still at the screen's bottom edge so the spin is visible
  return s;
}
// Next ring ahead (past the one just released) that comes BEFORE the next roof, or null.
function nextRing(s, roof) {
  const p = s.p, f = p.face || 1, cx = p.x + s.t.w / 2; let best = null;
  for (const a of s.m.anchors) { if (a === p.last || (a.x - cx) * f <= 0) continue;
    if (roof && (f > 0 ? a.x > roof.x0 : a.x < roof.x1)) continue;
    if (!best || (a.x - cx) * f < (best.x - cx) * f) best = a; }
  return best;
}
// Auto-catch: holding swing and passing within catchRange of any ring (even just behind) grabs it.
function catchAnchor(s) {
  const c = center(s); let best = null, bd = s.t.catchRange * TILE;
  for (const a of s.m.anchors) { if (a === s.p.last) continue; const d = Math.hypot(a.x - c.x, a.y - c.y); if (d <= bd) { bd = d; best = a; } }
  return best;
}
export function ringGlow(s, a) { // 0..1 proximity glow while swing is held or the ring is in range
  const c = center(s), d = Math.hypot(a.x - c.x, a.y - c.y), r = s.D.range;
  return (s.p.prev.swing || d <= r) && !s.dead ? Math.max(0, 1 - d / (r * 1.5)) : 0;
}
// The next roof ahead of the hero (first column with ground whose top is below the hero's apex), as a span of same-height tops.
function nextRoof(s) {
  const p = s.p, t = s.t, f = p.face || 1, front = f > 0 ? p.x + t.w : p.x, feet = p.y + t.h;
  const apex = p.vy < 0 ? feet - p.vy * p.vy / (2 * s.D.g) : feet;
  const topOf = tx => { for (let y = 0; y < s.m.H; y++) if (solidAt(s.m, tx, y)) return y; return -1; };
  for (let k = 1; k <= 16; k++) {
    const tx = Math.floor(front / TILE) + f * k, ty = topOf(tx);
    if (ty < 0) continue; if (ty * TILE < apex) return null;
    let e = tx; while (topOf(e + f) === ty) e += f;
    const x0 = Math.min(tx, e) * TILE, x1 = (Math.max(tx, e) + 1) * TILE;
    return { x0, x1, top: ty * TILE };
  }
  return null;
}
// Seconds until the feet come down to height `top` (rise under normal gravity, fall under fall gravity), or null.
function fallTime(s, top) {
  const p = s.p, D = s.D, feet = p.y + s.t.h, up = p.vy < 0 ? -p.vy / D.g : 0, apex = p.vy < 0 ? feet - p.vy * p.vy / (2 * D.g) : feet;
  if (top < apex) return null; const v0 = p.vy > 0 ? p.vy : 0, d = top - apex;
  return up + (-v0 + Math.sqrt(v0 * v0 + 2 * D.fallG * d)) / D.fallG;
}
const approach = (v, to, d) => v < to ? Math.min(v + d, to) : Math.max(v - d, to);
function clampSpeed(p, max) { const sp = Math.hypot(p.vx, p.vy); if (sp > max) { p.vx *= max / sp; p.vy *= max / sp; } }
export const balloonsGot = s => s.m.balloons.filter(b => b.got).length;
