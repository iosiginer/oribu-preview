// Keyboard + multi-touch. Each pointer is tracked on its own; a lifted, cancelled or lost pointer always releases.
const KEYS = { ArrowLeft: "l", KeyA: "l", ArrowRight: "r", KeyD: "r", Space: "jump", KeyW: "jump", ArrowUp: "jump",
  ShiftLeft: "swing", ShiftRight: "swing", KeyJ: "swing" };
export function createInput(pad) {
  const keys = new Set(), ptr = new Map(); // pointerId -> action
  const kd = e => { const a = KEYS[e.code]; if (!a) return; e.preventDefault(); keys.add(a); };
  const ku = e => { const a = KEYS[e.code]; if (a) keys.delete(a); };
  const clearAll = () => { keys.clear(); ptr.clear(); paint(); };
  const actionAt = (x, y) => { const el = document.elementFromPoint(x, y)?.closest?.("[data-k]"); return el && pad.contains(el) ? el.dataset.k : null; };
  const paint = () => pad && pad.querySelectorAll("[data-k]").forEach(b => b.classList.toggle("on", [...ptr.values()].includes(b.dataset.k)));
  const down = e => { const a = actionAt(e.clientX, e.clientY); if (!a) return; e.preventDefault(); ptr.set(e.pointerId, a); paint(); };
  const move = e => { if (!ptr.has(e.pointerId)) return; const a = ptr.get(e.pointerId);
    // thumbs can slide between ◀ and ▶; jump/swing stay put until lifted
    if (a === "l" || a === "r") { const n = actionAt(e.clientX, e.clientY); if (n === "l" || n === "r") { ptr.set(e.pointerId, n); paint(); } } };
  const up = e => { if (ptr.delete(e.pointerId)) paint(); };
  addEventListener("keydown", kd); addEventListener("keyup", ku); addEventListener("blur", clearAll);
  document.addEventListener("visibilitychange", () => document.hidden && clearAll());
  if (pad) {
    pad.addEventListener("pointerdown", down); addEventListener("pointermove", move, { passive: true });
    for (const ev of ["pointerup", "pointercancel"]) addEventListener(ev, up);
    pad.addEventListener("contextmenu", e => e.preventDefault());
  }
  return {
    poll() { const v = new Set([...keys, ...ptr.values()]); return { l: v.has("l"), r: v.has("r"), jump: v.has("jump"), swing: v.has("swing") }; },
    clear: clearAll, _ptr: ptr,
  };
}
