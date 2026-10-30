import { LEVEL } from "./level.js";
import { newState, step, DT, balloonsGot } from "./physics.js";
import { makeRenderer } from "./render.js";
import { createInput } from "./input.js";
const $ = q => document.querySelector(q);
const touch = matchMedia("(pointer: coarse)").matches || "ontouchstart" in window;
document.documentElement.classList.toggle("touch", touch);
const KEY_CP = "oribu_cp_v1", KEY_BEST = "oribu_best_v1";
const load = k => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };
const store = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch {} };
const fmt = ticks => { const s = ticks / 60, m = Math.floor(s / 60); return `${m}:${(s % 60).toFixed(1).padStart(4, "0")}`; };
const total = LEVEL.rows.join("").split("b").length - 1;

const R = makeRenderer($("#cv")), input = createInput($("#pad"));
let s = newState(LEVEL), running = false, acc = 0, last = 0, t0 = performance.now();
window.__oribu = { get s() { return s; }, input, step: n => { for (let i = 0; i < n; i++) step(s, input.poll()); } };

function saveCp() { store(KEY_CP, { cp: s.cp, tick: s.tick, got: s.m.balloons.map((b, i) => b.got ? i : -1).filter(i => i >= 0) }); }
function showTitle() {
  running = false; const cp = load(KEY_CP), best = load(KEY_BEST);
  $("#title").hidden = false; $("#cont").hidden = !(cp && cp.cp >= 0);
  $("#best").textContent = best ? `Best: ${fmt(best.time)} · 🎈 ${best.balloons}/${total}` : "";
}
function begin(cont) {
  input.clear(); s = newState(LEVEL, undefined, cont ? load(KEY_CP) : null); if (!cont) store(KEY_CP, null);
  ["#title", "#end", "#pause"].forEach(q => $(q).hidden = true); running = true; acc = 0; last = performance.now();
}
$("#play").onclick = () => begin(false); $("#cont").onclick = () => begin(true);
$("#again").onclick = () => begin(false); $("#restart").onclick = () => begin(false);
const pause = () => { if (!running || s.done) return; running = false; input.clear(); $("#pause").hidden = false; };
$("#pauseBtn").onclick = pause; $("#resume").onclick = () => { $("#pause").hidden = true; running = true; last = performance.now(); acc = 0; };
addEventListener("keydown", e => { if (e.code === "Escape" || e.code === "KeyP") running ? pause() : !$("#pause").hidden && $("#resume").click();
  if (e.code === "Enter" && !$("#title").hidden) begin(false); });
document.addEventListener("visibilitychange", () => document.hidden && pause());

function finish() {
  running = false; const got = balloonsGot(s), best = load(KEY_BEST) || {}; const nb = { time: Math.min(best.time ?? Infinity, s.tick), balloons: Math.max(best.balloons ?? 0, got) };
  const rec = !best.time || s.tick < best.time; store(KEY_BEST, nb); store(KEY_CP, null);
  $("#endTime").textContent = `⏱ ${fmt(s.tick)}`; $("#endBal").textContent = `🎈 ${got} / ${total} balloons`;
  $("#endBest").textContent = rec ? "New best time!" : `Best: ${fmt(nb.time)} · 🎈 ${nb.balloons}/${total}`; $("#end").hidden = false;
}
const rot = () => $("#rotate").hidden = !(touch && innerHeight > innerWidth);
addEventListener("resize", rot); rot();

function frame(now) {
  requestAnimationFrame(frame);
  if (running) {
    acc += Math.min(0.25, (now - last) / 1000); last = now;
    let n = 0;
    while (acc >= DT && n < 8) { step(s, input.poll()); acc -= DT; n++; R.note(s.events);
      if (s.events.includes("checkpoint")) saveCp();
      if (s.events.includes("finish")) { finish(); break; } }
    if (n === 8) acc = 0;
  } else last = now;
  $("#time").textContent = fmt(s.tick); $("#bal").textContent = `🎈 ${balloonsGot(s)}/${total}`;
  R.draw(s, 1, (now - t0) / 1000);
}
showTitle(); requestAnimationFrame(frame);
