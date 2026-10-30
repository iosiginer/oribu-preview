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
function die(s) { if (s.dead > 0 || s.done) return; s.dead = s.t.respawnTime; const c = center(s); s.events.push("poof"); burst(s, c.x, c.y, 10); s.p.rope = null; }
function burst(s, x, y, n) { for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; s.fx.push({ x, y, vx: Math.cos(a) * 120, vy: Math.sin(a) * 120 - 40, life: 0.6 }); } }

export function step(s, inp) {
  const D = s.D, t = s.t, p = s.p, m = s.m;
  s.events = [];
  s.fx = s.fx.filter(f => (f.life -= DT) > 0); s.fx.forEach(f => { f.x += f.vx * DT; f.y += f.vy * DT; f.vy += 300 * DT; });
  if (s.done) return s;
  s.tick++;
  if (s.dead > 0) { s.dead -= DT; if (s.dead <= 0) { s.dead = 0; spawn(s); } return s; }
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
    p.vx *= t.releaseBoost; p.vy *= t.releaseBoost; p.vy = Math.min(p.vy, -D.assistLift); clampSpeed(p, D.swingMax);
    p.last = p.rope.a; p.rope = null; p.regrab = t.regrabDelay; p.assist = t.assistTime; p.jumping = false; s.events.push("launch");
  }
  if (!p.rope && inp.swing && !p.ground && p.regrab <= 0) {
    const a = findAnchor(s, p.last);
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
    if (p.assist > 0 && dir !== -p.face) { // steer horizontally toward the landing roof; gravity untouched
      const need = landingSpeed(s); const want = Math.max(D.assistMin, need ?? 0);
      if (p.face * p.vx < want) p.vx = p.face * Math.min(want, D.swingMax);
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
    const px = p.x, py = p.y, gx = g.x - g.w / 2, gy = g.y - g.h / 2;
    if (px < gx + g.w && px + t.w > gx && py < gy + g.h && py + t.h > gy) {
      if (p.vy > 0 && py + t.h - p.vy * DT <= gy + 8) {
        g.alive = false; g.back = t.pigeonRespawn; burst(s, g.x, g.y, 8); s.events.push("bop");
        p.vy = -(inp.jump ? D.bopHeldV : D.bopV); p.jumping = false; p.y = gy - t.h; p.rope = null;
      } else if (!(p.inv > 0)) { // side bump: hop back, blink, keep going
        const away = Math.sign(p.x + t.w / 2 - g.x) || -1; p.vx = away * D.hitX; p.vy = -D.hitUp; p.rope = null; p.jumping = false; p.ground = false;
        p.inv = t.invuln; p.lock = 0.25; p.lockDir = -away; s.events.push("bump"); const hc = center(s); burst(s, hc.x, hc.y, 10);
      }
    }
  }
  // --- pickups ---
  const c = center(s);
  m.balloons.forEach((b, i) => { if (!b.got && Math.abs(b.x - c.x) < 22 && Math.abs(b.y - c.y) < 30) { b.got = true; s.events.push("balloon"); burst(s, b.x, b.y, 5); } });
  m.checkpoints.forEach((k, i) => { if (i > s.cp && Math.abs(k.x - c.x) < 24 && Math.abs(k.y - (p.y + t.h)) < 48) { s.cp = i; s.events.push("checkpoint"); } });
  if (m.finish && Math.abs(m.finish.x - c.x) < 24 && Math.abs(m.finish.y - (p.y + t.h)) < 48) { s.done = true; s.events.push("finish"); }
  if (p.y > m.H * TILE + 64) die(s);
  return s;
}
// Horizontal speed needed to land just past the near edge of the next roof ahead (normal gravity), or null.
function landingSpeed(s) {
  const p = s.p, t = s.t, D = s.D, f = p.face, feet = p.y + t.h, front = f > 0 ? p.x + t.w : p.x;
  const apex = p.vy < 0 ? feet - p.vy * p.vy / (2 * D.g) : feet;
  for (let k = 1; k <= 10; k++) {
    const tx = Math.floor(front / TILE) + f * k; let ty = -1;
    for (let y = 0; y < s.m.H; y++) if (solidAt(s.m, tx, y)) { ty = y; break; }
    if (ty < 0) continue; const top = ty * TILE;
    if (top < apex) return null; // a wall higher than we can reach: don't steer
    // time to come down to the roof top: rise then fall (fall gravity)
    const up = p.vy < 0 ? -p.vy / D.g : 0, drop = top - apex, fall = Math.sqrt(2 * Math.max(drop, 0) / D.fallG);
    const edge = f > 0 ? tx * TILE + 12 : (tx + 1) * TILE - 12;
    return Math.max(0, (edge - front) * f) / Math.max(up + fall, 0.05);
  }
  return null;
}
const approach = (v, to, d) => v < to ? Math.min(v + d, to) : Math.max(v - d, to);
function clampSpeed(p, max) { const sp = Math.hypot(p.vx, p.vy); if (sp > max) { p.vx *= max / sp; p.vy *= max / sp; } }
export const balloonsGot = s => s.m.balloons.filter(b => b.got).length;
