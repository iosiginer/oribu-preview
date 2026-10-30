const ART = {
  paper: "#faf7f1",
  ink: "#1c1916",
  red: "#d63c3c",
  cuff: "#fb8500",
  mint: "#3fd0a0",
  pow: "#ffb703",
  jump: "#49c6ff",
  sky: "#a9cde6",
  skyline: "#c9dceb",
  mid: "#b5cfe0",
  pigeon: "#9aa3ad",
  pigeonWing: "#7d8790",
  can: "#8fa39a",
  balloons: ["#ff6b6b", "#49c6ff", "#3fd0a0", "#c77dff", "#ff9ecb"],
  // yellow reserved for grabbables
  shadow: 6,
  tile: 32,
  heroShadow: "#c9bfae",
  heroShadowOff: 4,
  heroScale: 1.3
  // hero only: no red on Oribu except the scarf
};
const TAU = Math.PI * 2;
function oribuPose(s, fx) {
  const p = s.p, w = s.t.w, h = s.t.h, face = p.face || 1;
  const base = { x: p.x + w / 2, y: p.y + h, face, vx: p.vx, vy: p.vy, wall: p.wall || 0, anchor: p.rope ? p.rope.a : null };
  if (s.dead > 0) return { ...base, pose: "hit", k: 1 - s.dead / (s.t.respawnTime || 0.8) };
  if (fx.knock > 0) return { ...base, pose: "knock", k: 1 - fx.knock / 0.5 };
  if (p.rope) return { ...base, pose: "swing" };
  if (fx.bop > 0) return { ...base, pose: "bop", k: 1 - fx.bop / 0.18 };
  if (p.wall && !p.ground) return { ...base, pose: "cling" };
  if (p.lock > 0 && !p.ground) return { ...base, pose: "kick", k: 1 - p.lock / (s.t.wallLock || 0.2) };
  if (!p.ground) return { ...base, pose: p.vy < 0 ? "jump" : "fall" };
  if (Math.abs(p.vx) > 10) return { ...base, pose: "run" };
  return { ...base, pose: "idle" };
}
function seg(c, pts) {
  c.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]);
}
function star(c, x, y, r, rot = 0, col = ART.pow) {
  c.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = rot + i * Math.PI / 5 - Math.PI / 2, rr = i % 2 ? r * 0.48 : r;
    c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  c.closePath();
  c.fillStyle = col;
  c.fill();
  c.strokeStyle = ART.ink;
  c.lineWidth = Math.max(1.2, r * 0.22);
  c.lineJoin = "round";
  c.stroke();
}
function poof(c, x, y, k, n = 6, R = 22) {
  const r = 6 * (1 - k * 0.6), d = 6 + R * Math.sqrt(k);
  for (let i = 0; i < n; i++) {
    const a = i * TAU / n + k;
    star(c, x + Math.cos(a) * d, y + Math.sin(a) * d, r, k * 3);
  }
  if (k < 0.25) {
    c.beginPath();
    c.arc(x, y, 4 + k * 24, 0, TAU);
    c.strokeStyle = ART.ink;
    c.lineWidth = 2;
    c.stroke();
  }
}
const HEAD_R = 11;
function rig(v, t) {
  const f = v.face, sp = Math.hypot(v.vx || 0, v.vy || 0);
  let rot = 0, sq = 1, face = "smile";
  let hip = [0, -16], neck = [0, -30], head = [0, -30 - HEAD_R - 1];
  let lf = [-5, 0], lb = [5, 0], af = [f * 7, -19], ab = [-f * 7, -19];
  let scarfAng = Math.PI / 2 - f * 0.35, scarfLen = 12, flap = Math.sin(t * 3) * 1.5;
  switch (v.pose) {
    case "idle": {
      const b = Math.sin(t * 2.5) * 0.6;
      hip[1] += b;
      neck[1] += b;
      head[1] += b;
      af = [f * 7, -18 + b];
      ab = [-f * 6, -18 + b];
      break;
    }
    case "run": {
      const ph = t * 14, s1 = Math.sin(ph), c1 = Math.cos(ph);
      lf = [f * s1 * 9, c1 > 0 ? -c1 * 4 : 0, f * s1 * 9 + f * 2, 0];
      lf = [f * s1 * 9, -Math.max(0, c1) * 5];
      lb = [-f * s1 * 9, -Math.max(0, -c1) * 5];
      af = [-f * s1 * 9, -20 + Math.abs(s1) * 3];
      ab = [f * s1 * 9, -20 + Math.abs(s1) * 3];
      neck[0] = f * 2.5;
      head[0] = f * 3.5;
      const bob = -Math.abs(c1) * 1.5;
      hip[1] += bob;
      neck[1] += bob;
      head[1] += bob;
      scarfAng = f > 0 ? Math.PI - 0.15 : 0.15;
      scarfLen = 14 + Math.min(14, sp / 14);
      flap = Math.sin(t * 22) * 3.5;
      break;
    }
    case "jump":
      lf = [f * 6, -6];
      lb = [-f * 4, -3];
      af = [f * 8, -40];
      ab = [-f * 9, -24];
      face = "open";
      scarfAng = Math.PI / 2;
      scarfLen = 18 + Math.min(10, sp / 20);
      flap = 0;
      break;
    // straight on launch
    case "fall":
      lf = [f * 7, -2];
      lb = [-f * 6, -6];
      af = [f * 11, -34];
      ab = [-f * 11, -34];
      face = "o";
      scarfAng = -Math.PI / 2 - f * 0.4;
      scarfLen = 16;
      flap = Math.sin(t * 18) * 2.5;
      break;
    // scarf blows up
    case "swing": {
      af = [0, -48];
      ab = [-f * 6, -22];
      lf = [f * 5, -3];
      lb = [-f * 3, 0];
      const vx = v.vx || 0;
      scarfAng = Math.atan2(-(v.vy || 0), -vx);
      scarfLen = 14 + Math.min(16, sp / 14);
      flap = Math.sin(t * 20) * 2;
      if (v.anchor) rot = Math.atan2(v.anchor.x - v.x, -(v.anchor.y - (v.y - 30))) * 0.9;
      face = "grin";
      break;
    }
    case "cling": {
      const w = v.wall || f;
      lf = [w * 8, -4];
      lb = [w * 9, -12];
      af = [w * 10, -36];
      ab = [w * 10, -26];
      hip[0] = w * 2;
      neck[0] = w * 3;
      head[0] = w * 1;
      scarfAng = Math.PI / 2 - w * 0.15;
      scarfLen = 15;
      flap = Math.sin(t * 2) * 0.6;
      break;
    }
    // scarf hangs
    case "kick": {
      const w = v.wall || -f, k = v.k ?? 0.3;
      lf = [w * 12, -10 + k * 6];
      lb = [-w * 4, -4];
      af = [-w * 10, -36];
      ab = [w * 8, -24];
      neck[0] = -w * 3;
      head[0] = -w * 4;
      face = "grin";
      scarfAng = w > 0 ? 0.3 : Math.PI - 0.3;
      scarfLen = 20;
      flap = 0;
      break;
    }
    case "bop": {
      const k = v.k ?? 0;
      sq = 1 - 0.28 * Math.sin(Math.min(1, k) * Math.PI);
      lf = [-8, 0];
      lb = [8, 0];
      af = [f * 11, -22];
      ab = [-f * 11, -22];
      face = "grin";
      scarfAng = Math.PI / 2 - f * 0.9;
      scarfLen = 14;
      flap = 2;
      break;
    }
    case "knock": {
      const k = Math.min(1, v.k ?? 0);
      rot = -f * 0.35 * Math.sin(k * Math.PI);
      lf = [-f * 6, -5];
      lb = [f * 3, -2];
      af = [-f * 12, -30];
      ab = [f * 6, -34];
      face = "dizzy";
      scarfAng = f > 0 ? 0.25 : Math.PI - 0.25;
      scarfLen = 14;
      flap = Math.sin(t * 16) * 2.5;
      break;
    }
    case "hit": {
      const k = Math.min(1, v.k ?? 0);
      rot = k * TAU * f;
      lf = [-8, -4];
      lb = [8, -4];
      af = [10, -36];
      ab = [-10, -36];
      scarfAng = Math.PI / 2 + rot;
      scarfLen = 14;
      break;
    }
  }
  const sa = scarfAng, sx = Math.cos(sa) * scarfLen, sy = Math.sin(sa) * scarfLen;
  const scarf = [neck[0], neck[1] + 1, neck[0] + sx * 0.5 - Math.sin(sa) * flap, neck[1] + sy * 0.5 + Math.cos(sa) * flap, neck[0] + sx, neck[1] + sy + flap * 0.6];
  return { head, neck, hip, lf, lb, af, ab, rot, sq, scarf, face };
}
function figure(c, r, f, shadow) {
  const ink = shadow ? ART.heroShadow : ART.ink;
  c.lineCap = "round";
  c.lineJoin = "round";
  c.strokeStyle = ink;
  c.lineWidth = shadow ? 8 : 8.5;
  c.beginPath();
  c.moveTo(r.scarf[0], r.scarf[1]);
  c.quadraticCurveTo(r.scarf[2], r.scarf[3], r.scarf[4], r.scarf[5]);
  c.stroke();
  if (!shadow) {
    c.strokeStyle = ART.red;
    c.lineWidth = 5.5;
    c.stroke();
  }
  c.strokeStyle = ink;
  c.lineWidth = 4.2;
  c.beginPath();
  seg(c, [r.lb[0], r.lb[1], r.hip[0], r.hip[1], r.lf[0], r.lf[1]]);
  seg(c, [r.hip[0], r.hip[1], r.neck[0], r.neck[1]]);
  const sh = [r.neck[0], r.neck[1] + 3];
  seg(c, [r.ab[0], r.ab[1], sh[0], sh[1], r.af[0], r.af[1]]);
  c.stroke();
  c.fillStyle = shadow ? ART.heroShadow : ART.red;
  c.beginPath();
  c.arc(r.neck[0], r.neck[1] + 0.5, 4, 0, TAU);
  c.fill();
  if (!shadow) {
    c.lineWidth = 1.8;
    c.strokeStyle = ART.ink;
    c.stroke();
  }
  const cx = sh[0] + (r.af[0] - sh[0]) * 0.8, cy = sh[1] + (r.af[1] - sh[1]) * 0.8, ang = Math.atan2(r.af[1] - sh[1], r.af[0] - sh[0]);
  c.save();
  c.translate(cx, cy);
  c.rotate(ang);
  c.beginPath();
  c.rect(-3, -4, 6, 8);
  c.fillStyle = shadow ? ART.heroShadow : ART.cuff;
  c.fill();
  if (!shadow) {
    c.lineWidth = 1.8;
    c.strokeStyle = ART.ink;
    c.stroke();
  }
  c.restore();
  c.beginPath();
  c.arc(r.head[0], r.head[1], HEAD_R, 0, TAU);
  c.fillStyle = shadow ? ART.heroShadow : ART.paper;
  c.fill();
  if (!shadow) {
    c.lineWidth = 3;
    c.strokeStyle = ART.ink;
    c.stroke();
    faceOf(c, r.head[0], r.head[1], f, r.face);
  }
}
function faceOf(c, x, y, f, kind) {
  const ex = x + f * 2.5;
  c.fillStyle = ART.ink;
  c.strokeStyle = ART.ink;
  c.lineWidth = 1.8;
  if (kind === "dizzy") {
    for (const d of [-3.8, 3.8]) {
      c.beginPath();
      c.arc(ex + d, y - 2, 2.2, 0, Math.PI * 1.6);
      c.stroke();
    }
    c.beginPath();
    c.arc(ex, y + 3, 3, 0.15 * Math.PI, 0.85 * Math.PI);
    c.stroke();
    return;
  }
  c.beginPath();
  c.ellipse(ex - 3.6, y - 2, 1.8, 2.4, 0, 0, TAU);
  c.ellipse(ex + 3.6, y - 2, 1.8, 2.4, 0, 0, TAU);
  c.fill();
  c.beginPath();
  if (kind === "open" || kind === "o") {
    c.ellipse(ex, y + 4, kind === "o" ? 2 : 3, 2.4, 0, 0, TAU);
    c.fill();
  } else if (kind === "grin") {
    c.arc(ex, y + 2.2, 3.6, 0.05 * Math.PI, 0.95 * Math.PI);
    c.closePath();
    c.fill();
  } else {
    c.arc(ex, y + 2.4, 3.2, 0.15 * Math.PI, 0.85 * Math.PI);
    c.stroke();
  }
}
function drawOribu(c, v, t) {
  const r = rig(v, t), f = v.face, S = ART.heroShadowOff, Z = ART.heroScale;
  const k = Math.min(1, v.k ?? 0);
  let ox = v.x, oy = v.y, scale = 1;
  if (v.pose === "knock") {
    ox -= f * 10 * Z * k;
    oy -= 9 * Z * Math.sin(k * Math.PI);
  }
  if (v.pose === "hit") {
    oy -= 22 * Z * k;
    scale = 1 - 0.75 * k * k;
  }
  if (v.pose === "swing" && v.anchor) {
    const a = v.anchor, cs = Math.cos(r.rot), sn = Math.sin(r.rot), hx = ox + Z * (r.af[0] * cs - r.af[1] * sn), hy = oy + Z * (r.af[0] * sn + r.af[1] * cs);
    c.strokeStyle = ART.ink;
    c.lineWidth = 2;
    c.lineCap = "round";
    c.beginPath();
    c.moveTo(hx, hy);
    c.lineTo(a.x, a.y);
    c.moveTo(a.x - 4, a.y - 7);
    c.arc(a.x, a.y - 4, 4, Math.PI, Math.PI * 2.3);
    c.stroke();
  }
  if (scale > 0.05) for (const shadow of [true, false]) {
    c.save();
    c.translate(ox + (shadow ? S : 0), oy + (shadow ? S : 0));
    c.scale(Z, Z);
    if (r.sq !== 1) c.scale(1 / Math.sqrt(r.sq), r.sq);
    if (scale !== 1) {
      c.translate(0, -26);
      c.scale(scale, scale);
      c.translate(0, 26);
    }
    figure(c, r, f, shadow);
    c.restore();
  }
  if (v.pose === "knock") {
    const hx = ox + Z * r.head[0], hy = oy + Z * (r.head[1] - HEAD_R - 3);
    for (let i = 0; i < 4; i++) {
      const a = t * 7 + i * TAU / 4;
      star(c, hx + Math.cos(a) * 13 * Z, hy + Math.sin(a) * 4 * Z, 3.6 * Z, a);
    }
  }
  if (v.pose === "hit") poof(c, ox, oy - Z * (26 + 22 * k), k, 7, 24 * Z);
}
function tileShadow(c, X, Y) {
  c.fillStyle = ART.red;
  c.fillRect(X + ART.shadow, Y + ART.shadow, 32, 32);
}
function drawTile(c, kind, X, Y, e = { t: true, b: true, l: true, r: true }) {
  const T = 32, ink = ART.ink;
  c.lineCap = "butt";
  const box = () => {
    c.fillStyle = ART.paper;
    c.fillRect(X, Y, T, T);
    c.strokeStyle = ink;
    c.lineWidth = 2.5;
    c.beginPath();
    if (e.t) {
      c.moveTo(X, Y);
      c.lineTo(X + T, Y);
    }
    if (e.b) {
      c.moveTo(X, Y + T);
      c.lineTo(X + T, Y + T);
    }
    if (e.l) {
      c.moveTo(X, Y);
      c.lineTo(X, Y + T);
    }
    if (e.r) {
      c.moveTo(X + T, Y);
      c.lineTo(X + T, Y + T);
    }
    c.stroke();
  };
  const faint = (pts) => {
    c.strokeStyle = "#1c191638";
    c.lineWidth = 1.5;
    c.beginPath();
    for (const p of pts) seg(c, p);
    c.stroke();
  };
  switch (kind) {
    case "roof":
    case "roofEdgeL":
    case "roofEdgeR":
      box();
      if (e.t) {
        c.fillStyle = ink;
        c.fillRect(X, Y, T, 5);
        faint([[X, Y + 12, X + T, Y + 12]]);
      }
      if (kind === "roofEdgeL") {
        c.fillStyle = ink;
        c.fillRect(X - 3, Y - 1, 7, 7);
      }
      if (kind === "roofEdgeR") {
        c.fillStyle = ink;
        c.fillRect(X + T - 4, Y - 1, 7, 7);
      }
      break;
    case "brick":
    case "brickClingL":
    case "brickClingR":
      box();
      faint([[X, Y + 10.5, X + T, Y + 10.5], [X, Y + 21.5, X + T, Y + 21.5], [X + 12, Y, X + 12, Y + 10], [X + 26, Y + 11, X + 26, Y + 21], [X + 8, Y + 22, X + 8, Y + T]]);
      c.fillStyle = ART.mint;
      if (kind === "brickClingL") {
        c.fillRect(X + 1, Y, 6, T);
      }
      if (kind === "brickClingR") {
        c.fillRect(X + T - 7, Y, 6, T);
      }
      break;
    case "chimney":
      c.fillStyle = ART.paper;
      c.fillRect(X + 4, Y + 6, 24, 26);
      c.fillRect(X, Y, T, 8);
      c.strokeStyle = ink;
      c.lineWidth = 2.5;
      c.strokeRect(X + 4, Y + 6, 24, 26);
      c.strokeRect(X, Y, T, 8);
      faint([[X + 4, Y + 18, X + 28, Y + 18], [X + 15, Y + 8, X + 15, Y + 18]]);
      break;
    case "tank":
      c.fillStyle = ART.paper;
      c.beginPath();
      c.moveTo(X + 3, Y + 8);
      c.lineTo(X + 16, Y + 1);
      c.lineTo(X + 29, Y + 8);
      c.lineTo(X + 29, Y + 26);
      c.lineTo(X + 3, Y + 26);
      c.closePath();
      c.fill();
      c.strokeStyle = ink;
      c.lineWidth = 2.5;
      c.stroke();
      faint([[X + 3, Y + 15, X + 29, Y + 15], [X + 3, Y + 21, X + 29, Y + 21]]);
      c.lineWidth = 2.5;
      c.strokeStyle = ink;
      c.beginPath();
      seg(c, [X + 7, Y + 26, X + 5, Y + 32]);
      seg(c, [X + 25, Y + 26, X + 27, Y + 32]);
      c.stroke();
      break;
    case "awning":
      for (let i = 0; i < 4; i++) {
        c.fillStyle = i % 2 ? ART.paper : ART.red;
        c.fillRect(X + i * 8, Y + 4, 8, 11);
      }
      c.beginPath();
      for (let i = 0; i < 4; i++) c.arc(X + 4 + i * 8, Y + 15, 4, 0, Math.PI);
      c.fillStyle = ART.red;
      c.fill();
      c.strokeStyle = ink;
      c.lineWidth = 2;
      c.strokeRect(X, Y + 4, T, 11);
      break;
  }
}
function drawAnchor(c, x, y, inRange, t) {
  if (inRange) {
    const p = 1 + Math.sin(t * 8) * 0.12;
    c.fillStyle = "#ffb70366";
    c.beginPath();
    c.arc(x, y, 19 * p, 0, TAU);
    c.fill();
  }
  c.beginPath();
  c.arc(x + 3, y + 3, 10, 0, TAU);
  c.strokeStyle = ART.red;
  c.lineWidth = 6;
  c.stroke();
  c.beginPath();
  c.arc(x, y, 10, 0, TAU);
  c.strokeStyle = ART.ink;
  c.lineWidth = 7;
  c.stroke();
  c.strokeStyle = ART.pow;
  c.lineWidth = 4;
  c.stroke();
}
function drawBalloon(c, x, y, i, t) {
  const b = Math.sin(t * 2 + x) * 3, col = ART.balloons[i % ART.balloons.length];
  y += b;
  c.strokeStyle = ART.ink;
  c.lineWidth = 1.3;
  c.beginPath();
  c.moveTo(x, y + 10);
  c.quadraticCurveTo(x + 5, y + 17, x, y + 24);
  c.stroke();
  c.beginPath();
  c.ellipse(x + 3, y + 3, 8, 10, 0, 0, TAU);
  c.fillStyle = ART.red;
  c.fill();
  c.beginPath();
  c.ellipse(x, y, 8, 10, 0, 0, TAU);
  c.fillStyle = col;
  c.fill();
  c.lineWidth = 2;
  c.stroke();
  c.beginPath();
  seg(c, [x - 2, y + 11, x, y + 9, x + 2, y + 11]);
  c.closePath();
  c.fillStyle = col;
  c.fill();
  c.stroke();
  c.fillStyle = "#ffffffaa";
  c.beginPath();
  c.ellipse(x - 3, y - 4, 1.8, 3, 0.4, 0, TAU);
  c.fill();
}
function drawFlag(c, x, y, up, burst = 1, finish = false) {
  const top = y - 46, fy = y - 18 - 28 * up, col = up > 0 ? ART.red : "#b9b2a8";
  c.lineCap = "round";
  c.strokeStyle = ART.red;
  c.lineWidth = 3.5;
  c.beginPath();
  c.moveTo(x + 3, y + 3);
  c.lineTo(x + 3, top + 3);
  c.stroke();
  c.strokeStyle = ART.ink;
  c.beginPath();
  c.moveTo(x, y);
  c.lineTo(x, top);
  c.stroke();
  c.beginPath();
  c.arc(x, top - 2, 3, 0, TAU);
  c.fillStyle = ART.ink;
  c.fill();
  c.beginPath();
  c.moveTo(x, fy);
  c.lineTo(x + 24, fy + 7 + (1 - up) * 6);
  c.lineTo(x, fy + 14);
  c.closePath();
  c.fillStyle = col;
  c.fill();
  c.lineWidth = 2;
  c.lineJoin = "round";
  c.stroke();
  if (burst < 1) for (let i = 0; i < 5; i++) {
    const a = Math.PI + i * Math.PI / 4, d = 6 + burst * 18;
    c.beginPath();
    c.arc(x + Math.cos(a) * d, y - 2 + Math.sin(a) * d * 0.4, 4 * (1 - burst), 0, TAU);
    c.fillStyle = "#e8e1d6";
    c.fill();
    c.lineWidth = 1.2;
    c.stroke();
  }
  if (finish) {
    c.fillStyle = ART.ink;
    c.font = "700 11px Fredoka, 'Baloo 2', system-ui, sans-serif";
    c.fillText("FINISH", x - 18, top - 8);
  }
}
function drawPigeon(c, x, y, dir, t) {
  y += Math.sin(t * 6 + x) * 2;
  const d = dir;
  for (const sh of [true, false]) {
    const o = sh ? 5 : 0;
    c.beginPath();
    c.ellipse(x + o, y + o, 14, 12, 0, 0, TAU);
    c.fillStyle = sh ? ART.red : ART.pigeon;
    c.fill();
    if (!sh) {
      c.strokeStyle = ART.ink;
      c.lineWidth = 2.5;
      c.stroke();
    }
  }
  c.beginPath();
  c.ellipse(x - d * 4, y + 2, 8, 5, Math.sin(t * 14) * 0.5 * d, 0, TAU);
  c.fillStyle = ART.pigeonWing;
  c.fill();
  c.lineWidth = 2;
  c.stroke();
  c.beginPath();
  c.moveTo(x + d * 12, y - 2);
  c.lineTo(x + d * 19, y + 1);
  c.lineTo(x + d * 12, y + 4);
  c.closePath();
  c.fillStyle = ART.cuff;
  c.fill();
  c.lineWidth = 1.6;
  c.stroke();
  for (const e of [1, 6]) {
    c.beginPath();
    c.arc(x + d * e, y - 4, 4.6, 0, TAU);
    c.fillStyle = "#fff";
    c.fill();
    c.lineWidth = 1.8;
    c.stroke();
    c.beginPath();
    c.arc(x + d * (e + 1.2), y - 3, 2, 0, TAU);
    c.fillStyle = ART.ink;
    c.fill();
  }
  c.lineWidth = 2.4;
  c.beginPath();
  c.moveTo(x - d * 3, y - 11);
  c.lineTo(x + d * 10, y - 8);
  c.stroke();
  c.lineWidth = 2;
  c.beginPath();
  seg(c, [x - 3, y + 11, x - 3, y + 15]);
  seg(c, [x + 3, y + 11, x + 3, y + 15]);
  c.stroke();
}
function drawTrashCan(c, x, y, dir, t) {
  const roll = t * 6 * dir, lid = Math.abs(Math.sin(t * 9)) * 0.7;
  c.save();
  c.translate(x, y - 12);
  for (const sh of [true, false]) {
    const o = sh ? 5 : 0;
    c.beginPath();
    c.roundRect ? c.roundRect(-15 + o, -10 + o, 30, 22, 5) : c.rect(-15 + o, -10 + o, 30, 22);
    c.fillStyle = sh ? ART.red : ART.can;
    c.fill();
    if (!sh) {
      c.strokeStyle = ART.ink;
      c.lineWidth = 2.5;
      c.stroke();
    }
  }
  c.strokeStyle = "#1c191655";
  c.lineWidth = 1.5;
  c.beginPath();
  for (let i = 0; i < 3; i++) {
    const px = ((i * 10 + roll * 4) % 30 + 30) % 30 - 15;
    c.moveTo(px, -8);
    c.lineTo(px, 10);
  }
  c.stroke();
  c.save();
  c.translate(-dir * 15, -10);
  c.rotate(-dir * lid);
  c.fillStyle = ART.can;
  c.strokeStyle = ART.ink;
  c.lineWidth = 2.5;
  c.beginPath();
  c.rect(dir > 0 ? 0 : -32, -4, 32, 5);
  c.fill();
  c.stroke();
  c.restore();
  for (const e of [-5, 5]) {
    c.beginPath();
    c.arc(dir * 4 + e, -1, 3.4, 0, TAU);
    c.fillStyle = "#fff";
    c.fill();
    c.lineWidth = 1.6;
    c.strokeStyle = ART.ink;
    c.stroke();
    c.beginPath();
    c.arc(dir * 5 + e, 0, 1.5, 0, TAU);
    c.fillStyle = ART.ink;
    c.fill();
  }
  c.restore();
}
const L1 = Array.from({ length: 40 }, (_, i) => ({ x: i * 90, w: 60 + i * 37 % 50, h: 80 + i * 53 % 120 }));
const L2 = Array.from({ length: 40 }, (_, i) => ({ x: i * 130, w: 90 + i * 29 % 60, h: 60 + i * 71 % 90 }));
function drawBackground(c, W, H, camX, sc) {
  c.fillStyle = ART.sky;
  c.fillRect(0, 0, W, H);
  const layer = (list, f, col, base, gap, cap) => {
    const span = list.length * gap;
    c.fillStyle = col;
    for (const b of list) {
      const X = ((b.x - camX * f) % span + span) % span - 150;
      if (X > W) continue;
      const bh = b.h * Math.min(1.4, sc * 1.2);
      c.fillRect(X, H - base - bh, b.w, bh + base);
      if (cap) c.fillRect(X - 4, H - base - bh, b.w + 8, 6);
    }
  };
  layer(L1, 0.15, ART.skyline, H * 0.25, 90, false);
  layer(L2, 0.35, ART.mid, H * 0.08, 130, true);
}
const BUTTON_CSS = `#pad button{border:2px solid #1c1916;box-shadow:3px 3px 0 #1c1916;font-family:Fredoka,"Baloo 2",ui-rounded,system-ui,sans-serif;font-weight:700;letter-spacing:.5px}
#pad .jp{background:#49c6ff;color:#1c1916}#pad .sw{background:#ffb703;color:#1c1916}
#pad button.on{transform:translate(3px,3px);box-shadow:0 0 0 #1c1916}`;
export {
  ART,
  BUTTON_CSS,
  drawAnchor,
  drawBackground,
  drawBalloon,
  drawFlag,
  drawOribu,
  drawPigeon,
  drawTile,
  drawTrashCan,
  oribuPose,
  poof,
  star,
  tileShadow
};
