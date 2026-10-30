import { test } from "node:test"; import assert from "node:assert/strict";
import { T, TILE, derive } from "../app/oribu/tuning.js";
import { newState, step, parseLevel, findAnchor, center, balloonsGot } from "../app/oribu/physics.js";
import { LEVEL } from "../app/oribu/level.js";
const run = (s, n, inp = {}) => { for (let i = 0; i < n; i++) step(s, typeof inp === "function" ? inp(i, s) : inp); return s; };
const fresh = () => run(newState(LEVEL), 5);
const feet = s => s.p.y + T.h;

test("level data: 20 balloons, 5 checkpoints, start, finish, anchors, pigeon", () => {
  const m = parseLevel(LEVEL);
  assert.equal(m.balloons.length, 20); assert.equal(m.checkpoints.length, 5);
  assert.ok(m.start && m.finish); assert.equal(m.anchors.length, 5); assert.equal(m.pigeons.length, 1);
});
test("tuning spec values", () => {
  assert.equal(TILE, 32); assert.equal(T.runTop, 6); assert.equal(T.coyote, 0.15); assert.equal(T.jumpHold, 4.5); assert.equal(T.buffer, 0.12); assert.equal(T.fallMult, 1.6);
  assert.equal(T.swingRange, 6); assert.equal(T.ropeMax, 5); assert.equal(T.releaseBoost, 1.3); assert.equal(T.invuln, 0.5); assert.equal(T.assistTime, 0.3); assert.equal(T.assistGravity, undefined); assert.equal(T.swingMaxSpeed, 12);
  assert.equal(T.wallSlideMax, 2); assert.equal(T.wallJumpOut, 3); assert.equal(T.wallJumpUp, 3.5); assert.equal(T.wallLock, 0.15);
  assert.equal(T.bop, 3); assert.equal(T.bopHeld, 4.5);
});
test("run reaches 6 tiles/s in ~0.15 s and stops within half a tile", () => {
  const s = fresh(); run(s, 9, { r: true }); assert.ok(s.p.vx >= 6 * TILE - 1, `vx ${s.p.vx}`);
  run(s, 30, { r: true }); const x = s.p.x; run(s, 30); assert.equal(s.p.vx, 0); assert.ok(s.p.x - x < TILE / 2, `slid ${(s.p.x - x).toFixed(1)}px`);
});
for (const [name, held, want] of [["tap", false, 2], ["hold", true, 4.5]]) test(`${name} jump ≈ ${want} tiles`, () => {
  const s = fresh(), y0 = feet(s); let top = y0;
  run(s, 80, i => ({ jump: held || i === 0 })); // min tracked below
  const s2 = fresh(); for (let i = 0; i < 80; i++) { step(s2, { jump: held || i === 0 }); top = Math.min(top, feet(s2)); }
  const h = (y0 - top) / TILE; assert.ok(Math.abs(h - want) < 0.15, `height ${h.toFixed(2)}`);
});
test("fall gravity is 1.6x", () => { const D = derive(); assert.ok(Math.abs(D.fallG / D.g - 1.6) < 1e-9); });
test("coyote (0.15 s): jump 0.08 s after leaving a ledge still counts; 0.2 s does not", () => {
  for (const [late, ok] of [[5, true], [12, false]]) {
    const s = newState(LEVEL); s.p.x = 13 * TILE - 2; s.p.vx = 192; s.p.ground = true; let left = -1, jumped = false;
    for (let i = 0; i < 60; i++) { if (left < 0 && !s.p.ground && i > 0) left = i; const j = left >= 0 && i === left + late; step(s, { r: true, jump: j }); if (s.events.includes("jump")) jumped = true; }
    assert.equal(jumped, ok, `late=${late}`);
  }
});
test("buffer: jump pressed 0.1 s before landing fires on landing", () => {
  const s = fresh(); run(s, 1, { jump: true }); run(s, 1);
  let landedJump = false; for (let i = 0; i < 120; i++) { const pre = !s.p.ground && s.p.vy > 0 && (feet(s) + s.p.vy * 0.1 >= 19 * TILE - 2);
    step(s, { jump: pre }); if (s.events.includes("jump")) { landedJump = true; break; } }
  assert.ok(landedJump);
});
test("same result at 60 and 120 Hz displays (fixed timestep is frame-rate independent)", () => {
  // mimic main.js: accumulate real frame time, advance in fixed 1/60 steps
  const play = hz => { const s = fresh(); let acc = 0, t = 0; const DT = 1 / 60;
    for (let f = 0; f < hz * 2; f++) { acc += 1 / hz; t += 1 / hz; while (acc >= DT - 1e-9) { step(s, { r: true, jump: t < 0.33 }); acc -= DT; } } return s; };
  const a = play(60), b = play(120);
  assert.ok(Math.abs(a.p.x - b.p.x) < 1 && Math.abs(a.p.y - b.p.y) < 1, `${a.p.x},${a.p.y} vs ${b.p.x},${b.p.y}`);
});
test("swing grabs nearest anchor ahead, never behind; rope ≤ 5 tiles; release boosts and caps speed", () => {
  const s = newState(LEVEL); const a = s.m.anchors[0];
  s.p.x = a.x - 3 * TILE; s.p.y = a.y + 2 * TILE; s.p.ground = false; s.p.face = 1; s.p.vx = 150;
  step(s, { swing: true }); assert.ok(s.p.rope); assert.equal(s.p.rope.a, a); assert.ok(s.p.rope.len <= 5 * TILE + 1e-6);
  for (let i = 0; i < 20; i++) step(s, { swing: true });
  const sp = Math.hypot(s.p.vx, s.p.vy); step(s, { swing: false });
  assert.equal(s.p.rope, null); assert.ok(Math.hypot(s.p.vx, s.p.vy) <= 12 * TILE + 1e-6);
  assert.ok(Math.hypot(s.p.vx, s.p.vy) > sp * 1.05 || sp * 1.15 > 12 * TILE);
  const s2 = newState(LEVEL); s2.p.x = a.x + 2 * TILE; s2.p.y = a.y + 2 * TILE; s2.p.face = 1; s2.p.ground = false;
  assert.equal(findAnchor(s2), null, "anchor behind must not be grabbed");
});
test("wall slide capped at 2 tiles/s; wall jump kicks away and locks steering", () => {
  const s = newState(LEVEL); s.p.x = 54 * TILE + 1; s.p.y = 10 * TILE; s.p.ground = false; s.p.vy = 400;
  run(s, 3, { l: true }); assert.equal(s.p.wall, -1); assert.ok(s.p.vy <= 2 * TILE + 1e-6, `vy ${s.p.vy}`);
  step(s, { l: true, jump: true }); assert.ok(s.p.vx > 0 && s.p.vy < 0); assert.ok(s.p.lock > 0);
  step(s, { l: true }); assert.ok(s.p.vx > 0, "steering toward the wall is ignored during the lock");
});
test("bop bounces 3 tiles (4.5 held) and poofs the pigeon; side bump hops back + blinks, no respawn", () => {
  for (const [held, want] of [[false, 3], [true, 4.5]]) {
    const s = newState(LEVEL); const g = s.pigeons[0]; s.p.x = g.x - T.w / 2; s.p.y = g.y - g.h / 2 - T.h - 20; s.p.vy = 200; s.p.ground = false;
    let bopY = null, top = 1e9; for (let i = 0; i < 80; i++) { step(s, { jump: held }); if (s.events.includes("bop")) bopY = feet(s); if (bopY != null) top = Math.min(top, feet(s)); }
    assert.ok(bopY != null); assert.equal(s.pigeons[0].alive, false);
    assert.ok(Math.abs((bopY - top) / TILE - want) < 0.2, `bop ${((bopY - top) / TILE).toFixed(2)}`);
  }
  const s = newState(LEVEL); s.cp = 3; const g = s.pigeons[0]; s.p.x = g.x - 40; s.p.y = g.y - T.h / 2; s.p.ground = true;
  let bumped = false; for (let i = 0; i < 30; i++) { step(s, { r: true }); if (s.events.includes("bump")) { bumped = true; assert.ok(s.p.vx < 0 && s.p.vy < 0 && s.p.inv > 0.45 && s.p.inv <= 0.5); assert.ok(s.events.includes("knock"), "knock event for the art layer"); assert.equal(s.fx.length, 0, "no placeholder stars on a bump"); } }
  assert.ok(bumped); assert.equal(s.dead, 0); assert.ok(s.pigeons[0].alive);
  run(s, 70); assert.equal(s.p.inv, 0);
});
test("fall: spin+shrink, poof, respawn at flag in ≤0.6 s", () => {
  const s = newState(LEVEL); s.cp = 1; s.p.x = 14.5 * TILE; s.p.y = 19 * TILE; s.p.ground = false; let t0 = -1, poof = -1, back = -1;
  for (let i = 0; i < 200 && back < 0; i++) { step(s, {}); if (s.events.includes("fall")) t0 = i; if (s.events.includes("poof")) poof = i; if (t0 >= 0 && i > t0 && !s.dead) back = i; }
  assert.ok(t0 >= 0 && poof > t0 && back > poof); assert.ok((back - t0) / 60 <= 0.6 + 1e-9, `${(back - t0) / 60}s`);
});
test("falling off respawns at the last flag within ~1 s, no lives", () => {
  const s = newState(LEVEL); s.cp = 1; s.p.x = 14.5 * TILE; s.p.y = 19 * TILE; s.p.ground = false;
  let died = -1; for (let i = 0; i < 200; i++) { step(s, {}); if (s.dead > 0 && died < 0) died = i; if (died >= 0 && !s.dead) { assert.ok(i - died <= 36, `respawn took ${i - died} ticks`); break; } }
  assert.ok(died >= 0); const k = s.m.checkpoints[1]; assert.ok(Math.abs(center(s).x - k.x) < 1);
});
test("no tunneling: max-speed fall lands on a 1-tile floor", () => {
  const s = newState(LEVEL); s.p.x = 3 * TILE; s.p.y = 0; s.p.vy = 2000; s.p.ground = false; run(s, 120);
  assert.ok(s.p.ground && Math.abs(feet(s) - 19 * TILE) < 1);
});
test("balloons and checkpoints are collected", () => {
  const s = newState(LEVEL); const b = s.m.balloons[0]; s.p.x = b.x - T.w / 2; s.p.y = b.y - T.h / 2; step(s, {}); assert.equal(balloonsGot(s), 1);
});

// bot: run right, jump off roof G, hold swing, let go at a given angle past the bottom (or at the top of the arc if it never gets there)
function alley(deg) {
  const s = newState(LEVEL); s.cp = 2; s.p.x = 88 * TILE - 20; s.p.y = 10 * TILE - T.h; s.p.vx = 192; let jumped = false;
  for (let i = 0; i < 600; i++) {
    const p = s.p, c = center(s), inp = { r: true };
    if (p.rope) { const a = p.rope.a, th = Math.atan2(c.x - a.x, c.y - a.y);
      inp.swing = !(p.vx > 0 && (th > deg * Math.PI / 180 || (th > 0 && p.vy < 0 && Math.hypot(p.vx, p.vy) < 60))); }
    else inp.swing = !p.ground && p.vy > -200;
    if (!jumped && p.x > 88 * TILE - 10) { inp.jump = true; jumped = true; }
    step(s, inp); if (s.dead) return false; if (s.p.ground && s.p.x > 106 * TILE) return true;
  }
  return false;
}
for (const deg of [5, 10, 30, 60, 89]) test(`alley: 3 swings cleared releasing at ${deg}° past the bottom`, () => assert.ok(alley(deg)));
test("widest (4-tile) gap: takeoff window is at least 50 px", () => {
  const ok = [];
  for (let off = -60; off <= 80; off++) { const s = newState(LEVEL); s.p.x = 26 * TILE; s.p.y = 19 * TILE - T.h; s.p.vx = 192; let jumped = false, prev = false, res = false;
    for (let i = 0; i < 200; i++) { let j = prev; if (!jumped && s.p.x + T.w >= 31 * TILE + off) { j = true; jumped = true; } step(s, { r: true, jump: j }); prev = j;
      if (s.dead) break; if (s.p.ground && s.p.x > 35 * TILE - 20) { res = true; break; } }
    if (res) ok.push(off); }
  const win = ok.at(-1) - ok[0] + 1; console.log(`  jump window ${win}px (${ok[0]}..${ok.at(-1)})`); assert.ok(win >= 50 && ok.length === win);
});

test("hitbox: solid 22x68 feet-anchored, pigeon box 18x44", () => { assert.equal(T.w, 22); assert.equal(T.h, 68); assert.equal(T.hurtW, 18); assert.equal(T.hurtH, 44); });
test("clearance: every standable spot has >= 72 px of headroom (no crouching needed)", () => {
  const m = parseLevel(LEVEL), solid = (x, y) => y >= 0 && "#W".includes(m.grid[y][x]);
  const low = [];
  for (let x = 0; x < m.W; x++) for (let y = 1; y < m.H; y++) if (solid(x, y) && !solid(x, y - 1)) {
    let room = 0; for (let yy = y - 1; yy >= 0 && !solid(x, yy); yy--) room += TILE;
    if (room < 72 && !(y - 1 - room / TILE < 0)) low.push(`${x},${y}:${room}`);
  }
  assert.deepEqual(low, []);
  // shafts are wide enough for the box
  for (const [a, b] of [[53, 57], [119, 123]]) assert.ok((b - a - 1) * TILE >= T.w + 40);
});

// every swing: release at 5..90° past the bottom (or at the top of the arc) -> first landing is on the NEXT roof, never past its far edge
const SWINGS = [ // [name, start col, start roof top row, next roof first col, last col]
  ["first swing (awning gap)", 76, 9, 82, 88], ["alley x3", 88, 10, 106, 122], ["combo swing", 131, 5, 137, 150]];
for (const [name, sx, sy, r0, r1] of SWINGS) test(`${name}: releases 5..90° land on the next roof, never beyond`, () => {
  const bad = [];
  for (let deg = 5; deg <= 90; deg += 5) {
    const s = newState(LEVEL); s.p.x = sx * TILE - 20; s.p.y = sy * TILE - T.h; s.p.vx = 192; let jumped = false, land = null;
    for (let i = 0; i < 600 && land == null; i++) {
      const p = s.p, c = center(s), inp = { r: true };
      if (p.rope) { const a = p.rope.a, th = Math.atan2(c.x - a.x, c.y - a.y);
        inp.swing = !(p.vx > 0 && (th > deg * Math.PI / 180 || (th > 0 && p.vy < 0 && Math.hypot(p.vx, p.vy) < 60))); }
      else inp.swing = !p.ground && p.vy > -200;
      if (!jumped && p.x > sx * TILE - 10) { inp.jump = true; jumped = true; }
      const wasAir = !p.ground; step(s, inp);
      if (s.dead) land = "fell"; else if (jumped && wasAir && s.p.ground && s.p.x > sx * TILE) land = center(s).x / TILE;
    }
    if (typeof land !== "number" || land < r0 - 0.5 || land > r1 + 1) bad.push(`${deg}°:${land}`);
  }
  assert.deepEqual(bad, []);
});

function alleyGrabs(deg) { // returns the rings grabbed in order, and how it ended
  const s = newState(LEVEL); s.cp = 2; s.p.x = 88 * TILE - 20; s.p.y = 10 * TILE - T.h; s.p.vx = 192; let jumped = false; const got = [];
  for (let i = 0; i < 600; i++) {
    const p = s.p, c = center(s), inp = { r: true };
    if (p.rope) { const a = p.rope.a, th = Math.atan2(c.x - a.x, c.y - a.y);
      inp.swing = !(p.vx > 0 && (th > deg * Math.PI / 180 || (th > 0 && p.vy < 0 && Math.hypot(p.vx, p.vy) < 60))); }
    else inp.swing = !p.ground; // keep holding swing after a release
    if (!jumped && p.x > 88 * TILE - 10) { inp.jump = true; jumped = true; }
    step(s, inp); if (s.events.includes("grab")) got.push(s.p.rope.a.x / TILE | 0);
    if (s.dead) return { got, end: "fell" }; if (s.p.ground && s.p.x > 106 * TILE - 20) return { got, end: "roof" };
  }
  return { got, end: "timeout" };
}
test("alley: weak releases (5-30°) with swing held re-grab the next ring", () => {
  for (let deg = 5; deg <= 30; deg += 5) { const r = alleyGrabs(deg); assert.deepEqual(r.got, [92, 97, 102], `${deg}°`); assert.equal(r.end, "roof", `${deg}°`); }
});
test("alley: no release angle (5..90°) skips a ring", () => {
  for (let deg = 5; deg <= 90; deg += 5) assert.deepEqual(alleyGrabs(deg).got, [92, 97, 102], `${deg}°`);
});
test("auto-catch: holding swing and passing within 1.5 tiles of a ring grabs it (even slightly behind)", () => {
  const s = newState(LEVEL); const a = s.m.anchors[1]; s.p.face = 1; s.p.ground = false;
  s.p.x = a.x + 20 - T.w / 2; s.p.y = a.y + 10 - T.h / 2; s.p.vx = 100; s.p.prev = { jump: false, swing: true }; step(s, { swing: true });
  assert.equal(s.p.rope?.a, a);
});
test("alley flag: touching it saves it; a miss in the alley respawns there within ~1 s", () => {
  const s = newState(LEVEL); const k = s.m.checkpoints.findIndex(c => c.x > 82 * TILE && c.x < 89 * TILE); assert.ok(k >= 0);
  s.cp = k - 1; s.p.x = 83 * TILE; s.p.y = 10 * TILE - T.h; s.p.ground = true; run(s, 40, { r: true });
  assert.equal(s.cp, k, "flag touched");
  s.p.x = 96 * TILE; s.p.y = 14 * TILE; s.p.vx = 0; s.p.ground = false; s.p.rope = null; let fell = -1, back = -1;
  for (let i = 0; i < 300 && back < 0; i++) { step(s, {}); if (s.events.includes("fall")) fell = i; if (fell >= 0 && i > fell && !s.dead) back = i; }
  assert.ok(fell >= 0 && back - fell <= 60); assert.ok(Math.abs(center(s).x - s.m.checkpoints[k].x) < 1);
});
